import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const API_VERSION =
  process.env.SHOPIFY_ADMIN_API_VERSION || '2026-07';

const COLLECTION_HANDLE =
  process.env.SHOPIFY_FOTOTAPETEN_COLLECTION_HANDLE ||
  'fototapeten';

const SHOP = (process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');

const CLIENT_ID =
  (process.env.SHOPIFY_MIGRATION_CLIENT_ID || '').trim();

const CLIENT_SECRET =
  (process.env.SHOPIFY_MIGRATION_CLIENT_SECRET || '').trim();

const EXPECTED_COLLECTION_TOTAL = 104;
const EXPECTED_STORE_TOTAL = 111;

const TEST_PRODUCTS = [
  {
    currentHandle: '6-2',
    title: 'Fototapete Schwarzer Marmor mit Goldadern',
    targetHandle: 'fototapete-schwarzer-marmor-mit-goldadern',
  },
  {
    currentHandle: '3-3',
    title: 'Fototapete Traumwal über den Wolken',
    targetHandle: 'fototapete-traumwal-ueber-den-wolken',
  },
];

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error(
    'Missing PUBLIC_STORE_DOMAIN / SHOPIFY_MIGRATION_CLIENT_ID / SHOPIFY_MIGRATION_CLIENT_SECRET.',
  );
}

if (!SHOP.endsWith('.myshopify.com')) {
  throw new Error(
    `PUBLIC_STORE_DOMAIN must be *.myshopify.com. Received: ${SHOP}`,
  );
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

let writesCompleted = 0;

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms),
  );

function generateSeoHandle(title) {
  let value =
    String(title || '').trim();

  value = value
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ẞ/g, 'SS')
    .replace(/ß/g, 'ss');

  value = value
    .replace(/Æ/g, 'Ae')
    .replace(/æ/g, 'ae')
    .replace(/Œ/g, 'Oe')
    .replace(/œ/g, 'oe')
    .replace(/Ø/g, 'O')
    .replace(/ø/g, 'o')
    .replace(/Ł/g, 'L')
    .replace(/ł/g, 'l')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/ı/g, 'i');

  value =
    value.replace(
      /&/g,
      ' und ',
    );

  value =
    value
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '');

  value =
    value.replace(
      /['’‘`´]/g,
      '',
    );

  value =
    value.toLowerCase();

  value =
    value.replace(
      /[^a-z0-9]+/g,
      '-',
    );

  value =
    value
      .replace(/-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');

  return value;
}

async function getAdminAccessToken() {
  if (
    accessToken &&
    Date.now() <
      accessTokenExpiresAt - 60_000
  ) {
    return accessToken;
  }

  const response =
    await fetch(
      `https://${SHOP}/admin/oauth/access_token`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body:
          new URLSearchParams({
            grant_type:
              'client_credentials',

            client_id:
              CLIENT_ID,

            client_secret:
              CLIENT_SECRET,
          }),
      },
    );

  const raw =
    await response.text();

  let body;

  try {
    body =
      raw
        ? JSON.parse(raw)
        : null;
  } catch {
    body = null;
  }

  if (
    !response.ok ||
    !body?.access_token
  ) {
    throw new Error(
      `Authentication failed. HTTP ${response.status}: ${raw}`,
    );
  }

  accessToken =
    body.access_token;

  accessTokenExpiresAt =
    Date.now() +
    Number(body.expires_in || 0) *
      1000;

  grantedScopes =
    String(body.scope || '')
      .split(',')
      .map((scope) =>
        scope.trim(),
      )
      .filter(Boolean);

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope || 'not returned'
    }`,
  );

  if (
    !grantedScopes.includes(
      'write_products',
    )
  ) {
    throw new Error(
      'write_products scope missing.',
    );
  }

  return accessToken;
}

async function gql(
  query,
  variables = {},
  {
    allowMutation = false,
    attempt = 1,
  } = {},
) {
  const isMutation =
    /\bmutation\b/i.test(query);

  if (
    isMutation &&
    !allowMutation
  ) {
    throw new Error(
      'Mutation blocked because allowMutation=false.',
    );
  }

  const token =
    await getAdminAccessToken();

  const response =
    await fetch(
      endpoint,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'X-Shopify-Access-Token':
            token,
        },

        body:
          JSON.stringify({
            query,
            variables,
          }),
      },
    );

  if (
    response.status === 429 &&
    attempt <= 5
  ) {
    const waitMs =
      Math.min(
        attempt * 1000,
        5000,
      );

    console.log(
      `Shopify throttled request; retrying in ${waitMs}ms...`,
    );

    await sleep(waitMs);

    return gql(
      query,
      variables,
      {
        allowMutation,
        attempt:
          attempt + 1,
      },
    );
  }

  const raw =
    await response.text();

  let body;

  try {
    body =
      raw
        ? JSON.parse(raw)
        : null;
  } catch {
    throw new Error(
      `Non-JSON Shopify response. HTTP ${response.status}: ${raw}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify HTTP ${response.status}: ${raw}`,
    );
  }

  if (body?.errors?.length) {
    throw new Error(
      `Shopify GraphQL error:\n${JSON.stringify(
        body.errors,
        null,
        2,
      )}`,
    );
  }

  return body.data;
}

const ALL_PRODUCTS_QUERY = `#graphql
  query HandleTestAllProducts(
    $after: String
  ) {
    products(
      first: 250
      after: $after
    ) {
      nodes {
        id
        title
        handle
        status
      }

      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const COLLECTION_QUERY = `#graphql
  query HandleTestCollection(
    $handle: String!
    $after: String
  ) {
    collectionByIdentifier(
      identifier: {
        handle: $handle
      }
    ) {
      id
      handle
      title

      products(
        first: 100
        after: $after
      ) {
        nodes {
          id
          title
          handle
        }

        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

const TRANSLATION_QUERY = `#graphql
  query HandleTestTranslationState(
    $resourceId: ID!
  ) {
    translatableResource(
      resourceId: $resourceId
    ) {
      resourceId

      translatableContent {
        key
        value
        digest
        locale
      }

      translations(
        locale: "en"
      ) {
        key
        value
        locale
        outdated

        market {
          id
          name
        }
      }
    }
  }
`;

const UPDATE_HANDLE_MUTATION = `#graphql
  mutation UpdateTestProductHandle(
    $product: ProductUpdateInput!
  ) {
    productUpdate(
      product: $product
    ) {
      product {
        id
        title
        handle
        status
        updatedAt
      }

      userErrors {
        field
        message
      }
    }
  }
`;

async function getAllStoreProducts() {
  const products = [];
  let after = null;

  do {
    const data =
      await gql(
        ALL_PRODUCTS_QUERY,
        {after},
      );

    const connection =
      data?.products;

    if (!connection) {
      throw new Error(
        'Could not read store products.',
      );
    }

    products.push(
      ...connection.nodes,
    );

    after =
      connection.pageInfo
        .hasNextPage
        ? connection.pageInfo
            .endCursor
        : null;
  } while (after);

  return products;
}

async function getCollectionProducts() {
  const products = [];
  let after = null;

  do {
    const data =
      await gql(
        COLLECTION_QUERY,
        {
          handle:
            COLLECTION_HANDLE,
          after,
        },
      );

    const collection =
      data?.collectionByIdentifier;

    if (!collection) {
      throw new Error(
        `Collection not found: ${COLLECTION_HANDLE}`,
      );
    }

    products.push(
      ...collection.products.nodes,
    );

    after =
      collection.products
        .pageInfo.hasNextPage
        ? collection.products
            .pageInfo.endCursor
        : null;
  } while (after);

  return products;
}

async function getTranslationState(
  product,
) {
  const data =
    await gql(
      TRANSLATION_QUERY,
      {
        resourceId:
          product.id,
      },
    );

  const resource =
    data?.translatableResource;

  if (!resource) {
    throw new Error(
      `Translatable resource missing: ${product.handle}`,
    );
  }

  const handleSources =
    (
      resource.translatableContent ||
      []
    ).filter(
      (item) =>
        item.key === 'handle',
    );

  if (
    handleSources.length !== 1
  ) {
    throw new Error(
      `Expected exactly one handle source on ${product.handle}; found ${handleSources.length}.`,
    );
  }

  const source =
    handleSources[0];

  if (
    source.value !==
    product.handle
  ) {
    throw new Error(
      `Handle translation source mismatch on ${product.handle}.`,
    );
  }

  if (!source.digest) {
    throw new Error(
      `Handle source digest missing on ${product.handle}.`,
    );
  }

  if (
    source.locale !== 'de'
  ) {
    throw new Error(
      `Expected source locale de on ${product.handle}; got ${source.locale}.`,
    );
  }

  const enHandleTranslations =
    (
      resource.translations ||
      []
    ).filter(
      (translation) =>
        translation.key ===
        'handle',
    );

  if (
    enHandleTranslations.length !== 0
  ) {
    throw new Error(
      `Test product ${product.handle} unexpectedly has EN handle translation(s).`,
    );
  }

  return {
    source,
    enHandleTranslations,
  };
}

function writeBackup(payload) {
  const dir =
    path.resolve(
      'migration-backups',
    );

  fs.mkdirSync(
    dir,
    {
      recursive: true,
    },
  );

  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

  const filePath =
    path.join(
      dir,
      `fototapeten-handle-test2-before-${stamp}.json`,
    );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      payload,
      null,
      2,
    ),
    'utf8',
  );

  return filePath;
}

async function precheck() {
  const collectionProducts =
    await getCollectionProducts();

  if (
    collectionProducts.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_COLLECTION_TOTAL} collection products, found ${collectionProducts.length}.`,
    );
  }

  const allStoreProducts =
    await getAllStoreProducts();

  if (
    allStoreProducts.length !==
    EXPECTED_STORE_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_STORE_TOTAL} store products, found ${allStoreProducts.length}.`,
    );
  }

  const collectionIds =
    new Set(
      collectionProducts.map(
        (product) =>
          product.id,
      ),
    );

  const prepared = [];

  for (
    const expected
    of TEST_PRODUCTS
  ) {
    const generated =
      generateSeoHandle(
        expected.title,
      );

    if (
      generated !==
      expected.targetHandle
    ) {
      throw new Error(
        `Algorithm target mismatch for ${expected.currentHandle}. Generated ${generated}, expected ${expected.targetHandle}.`,
      );
    }

    const currentMatches =
      allStoreProducts.filter(
        (product) =>
          product.handle ===
          expected.currentHandle,
      );

    if (
      currentMatches.length !== 1
    ) {
      throw new Error(
        `Expected exactly one product with current handle ${expected.currentHandle}; found ${currentMatches.length}.`,
      );
    }

    const product =
      currentMatches[0];

    if (
      product.title !==
      expected.title
    ) {
      throw new Error(
        `Title mismatch on ${expected.currentHandle}.\nExpected: ${expected.title}\nActual:   ${product.title}`,
      );
    }

    if (
      !collectionIds.has(
        product.id,
      )
    ) {
      throw new Error(
        `${expected.currentHandle} is not in collection ${COLLECTION_HANDLE}.`,
      );
    }

    const targetOwners =
      allStoreProducts.filter(
        (candidate) =>
          candidate.handle ===
          expected.targetHandle &&
          candidate.id !==
          product.id,
      );

    if (
      targetOwners.length !== 0
    ) {
      throw new Error(
        `Target handle collision: ${expected.targetHandle}`,
      );
    }

    const translationState =
      await getTranslationState(
        product,
      );

    prepared.push({
      expected,
      product,
      translationState,
    });
  }

  return {
    collectionProducts,
    allStoreProducts,
    prepared,
  };
}

async function verifyCurrentState(
  originalProduct,
  expectedHandle,
) {
  const products =
    await getAllStoreProducts();

  const sameProduct =
    products.find(
      (product) =>
        product.id ===
        originalProduct.id,
    );

  if (!sameProduct) {
    throw new Error(
      `Product disappeared after update: ${originalProduct.id}`,
    );
  }

  if (
    sameProduct.title !==
    originalProduct.title
  ) {
    throw new Error(
      `Title changed unexpectedly for ${originalProduct.id}.`,
    );
  }

  if (
    sameProduct.handle !==
    expectedHandle
  ) {
    throw new Error(
      `Handle verification failed for ${originalProduct.id}. Expected ${expectedHandle}, got ${sameProduct.handle}.`,
    );
  }

  const targetOwners =
    products.filter(
      (product) =>
        product.handle ===
        expectedHandle,
    );

  if (
    targetOwners.length !== 1 ||
    targetOwners[0].id !==
      originalProduct.id
  ) {
    throw new Error(
      `Target handle ownership verification failed: ${expectedHandle}`,
    );
  }

  return sameProduct;
}

async function main() {
  console.log(`
WANDINI
Fototapeten Handle TEST-2

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

THIS SCRIPT CAN CHANGE EXACTLY 2 PRODUCT HANDLES.

Product 1:
6-2
→ fototapete-schwarzer-marmor-mit-goldadern

Product 2:
3-3
→ fototapete-traumwal-ueber-den-wolken

For both:
redirectNewHandle = true

No title writes.
No translation writes.
No metafield writes.
No variant writes.
No price writes.
No SKU writes.
No image writes.
`);

  const {
    prepared,
  } =
    await precheck();

  console.log(`
PRECHECK CLEAN.

Collection total : ${EXPECTED_COLLECTION_TOTAL}
Store total      : ${EXPECTED_STORE_TOTAL}
Test products    : ${prepared.length}

No target collisions.
Both titles exact.
Both algorithm targets exact.
Both products belong to fototapeten.
Neither test product has an EN handle translation.
`);

  for (
    const entry
    of prepared
  ) {
    console.log(
      `${entry.product.title}`,
    );

    console.log(
      `CURRENT : ${entry.product.handle}`,
    );

    console.log(
      `TARGET  : ${entry.expected.targetHandle}`,
    );

    console.log('');
  }

  const backupPath =
    writeBackup({
      generatedAt:
        new Date().toISOString(),

      shop:
        SHOP,

      apiVersion:
        API_VERSION,

      products:
        prepared.map(
          (entry) => ({
            id:
              entry.product.id,

            title:
              entry.product.title,

            oldHandle:
              entry.product.handle,

            targetHandle:
              entry.expected.targetHandle,

            translationState:
              entry.translationState,
          }),
        ),
    });

  console.log(
    `Backup:\n${backupPath}\n`,
  );

  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE 2 HANDLES to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE 2 HANDLES'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  for (
    let i = 0;
    i < prepared.length;
    i += 1
  ) {
    const entry =
      prepared[i];

    /*
     * Last-second state check before each mutation.
     */
    const freshProducts =
      await getAllStoreProducts();

    const freshProduct =
      freshProducts.find(
        (product) =>
          product.id ===
          entry.product.id,
      );

    if (!freshProduct) {
      throw new Error(
        `Product missing immediately before write: ${entry.product.id}`,
      );
    }

    if (
      freshProduct.handle !==
      entry.expected.currentHandle
    ) {
      throw new Error(
        `Current handle changed before write for ${entry.product.title}. Expected ${entry.expected.currentHandle}, got ${freshProduct.handle}.`,
      );
    }

    if (
      freshProduct.title !==
      entry.expected.title
    ) {
      throw new Error(
        `Title changed before write for ${entry.expected.currentHandle}.`,
      );
    }

    const targetOwner =
      freshProducts.find(
        (product) =>
          product.handle ===
            entry.expected.targetHandle &&
          product.id !==
            entry.product.id,
      );

    if (targetOwner) {
      throw new Error(
        `Target became occupied before write: ${entry.expected.targetHandle}`,
      );
    }

    console.log(
      `\n[${i + 1}/2] Updating handle`,
    );

    console.log(
      `${entry.expected.currentHandle}`,
    );

    console.log('→');

    console.log(
      `${entry.expected.targetHandle}`,
    );

    const data =
      await gql(
        UPDATE_HANDLE_MUTATION,
        {
          product: {
            id:
              entry.product.id,

            handle:
              entry.expected.targetHandle,

            redirectNewHandle:
              true,
          },
        },
        {
          allowMutation:
            true,
        },
      );

    const result =
      data?.productUpdate;

    if (!result) {
      throw new Error(
        `productUpdate returned no payload for ${entry.expected.currentHandle}.`,
      );
    }

    if (
      result.userErrors?.length >
      0
    ) {
      throw new Error(
        `productUpdate failed:\n${JSON.stringify(
          result.userErrors,
          null,
          2,
        )}`,
      );
    }

    if (!result.product) {
      throw new Error(
        `Updated product missing from response for ${entry.expected.currentHandle}.`,
      );
    }

    if (
      result.product.id !==
      entry.product.id
    ) {
      throw new Error(
        'Shopify returned unexpected product ID.',
      );
    }

    if (
      result.product.title !==
      entry.product.title
    ) {
      throw new Error(
        `Title changed unexpectedly during update.`,
      );
    }

    if (
      result.product.handle !==
      entry.expected.targetHandle
    ) {
      throw new Error(
        `Shopify returned unexpected handle: ${result.product.handle}`,
      );
    }

    writesCompleted += 1;

    await sleep(500);

    await verifyCurrentState(
      entry.product,
      entry.expected.targetHandle,
    );

    console.log(
      `Verified Shopify handle: ${entry.expected.targetHandle}`,
    );
  }

  console.log(
    '\nRunning final TEST-2 verification...',
  );

  const finalProducts =
    await getAllStoreProducts();

  for (
    const entry
    of prepared
  ) {
    const product =
      finalProducts.find(
        (candidate) =>
          candidate.id ===
          entry.product.id,
      );

    if (!product) {
      throw new Error(
        `Final verification product missing: ${entry.product.id}`,
      );
    }

    if (
      product.handle !==
      entry.expected.targetHandle
    ) {
      throw new Error(
        `Final handle mismatch: ${entry.expected.targetHandle}`,
      );
    }

    if (
      product.title !==
      entry.product.title
    ) {
      throw new Error(
        `Final title mismatch: ${entry.expected.targetHandle}`,
      );
    }

    const oldOwner =
      finalProducts.find(
        (candidate) =>
          candidate.handle ===
          entry.expected.currentHandle,
      );

    if (oldOwner) {
      throw new Error(
        `Old handle is still owned by a product: ${entry.expected.currentHandle}`,
      );
    }
  }

  console.log(`
========================================
HANDLE TEST-2 COMPLETE
========================================

Successful handle writes : ${writesCompleted}/2

6-2
→ fototapete-schwarzer-marmor-mit-goldadern

3-3
→ fototapete-traumwal-ueber-den-wolken

Both product IDs unchanged.
Both titles unchanged.
Both new handles re-read from Shopify.
Both old handles are no longer active product handles.

redirectNewHandle=true was sent on both mutations.

IMPORTANT:
Now test the live Hydrogen redirects before changing
the remaining products.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nHANDLE TEST-2 FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(
      `\nSuccessful writes before failure: ${writesCompleted}/2`,
    );

    if (
      writesCompleted > 0
    ) {
      console.error(`
At least one product handle was changed.

DO NOT rerun blindly.
Inspect current Shopify state first.
`);
    } else {
      console.error(`
No handle writes completed.
`);
    }

    process.exitCode = 1;
  },
);