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

const EXPECTED_ALREADY_CORRECT = 10;
const EXPECTED_TO_CHANGE = 94;

const EXPECTED_GLOBAL_EN_HANDLE_TRANSLATIONS = 1;
const EXPECTED_EN_HANDLE_OWNER_TITLE =
  'Fototapete Koi mit Lotusblüten';

const SOURCE_LOCALE = 'de';
const TARGET_LOCALE = 'en';

if (
  !SHOP ||
  !CLIENT_ID ||
  !CLIENT_SECRET
) {
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

/*
 * WANDINI GERMAN SEO HANDLE ALGORITHM
 *
 * ä -> ae
 * ö -> oe
 * ü -> ue
 * ß -> ss
 *
 * Other Latin accents -> ASCII
 * & -> und
 * apostrophes -> removed
 * separators/punctuation -> -
 * lowercase
 * repeated hyphens collapsed
 */
function generateSeoHandle(title) {
  let value =
    String(title || '').trim();

  /*
   * German-specific replacements first.
   */
  value = value
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ẞ/g, 'SS')
    .replace(/ß/g, 'ss');

  /*
   * Other useful Latin conversions.
   */
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

  /*
   * Semantic ampersand replacement.
   */
  value =
    value.replace(
      /&/g,
      ' und ',
    );

  /*
   * Strip remaining combining accents.
   */
  value =
    value
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '');

  /*
   * Apostrophes disappear.
   */
  value =
    value.replace(
      /['’‘`´]/g,
      '',
    );

  value =
    value.toLowerCase();

  /*
   * Everything outside a-z / 0-9 becomes -.
   */
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
    Number(
      body.expires_in || 0,
    ) *
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
      `write_products scope missing. Current scopes: ${grantedScopes.join(
        ',',
      )}`,
    );
  }

  const hasTranslationRead =
    grantedScopes.includes(
      'read_translations',
    ) ||
    grantedScopes.includes(
      'write_translations',
    );

  if (!hasTranslationRead) {
    throw new Error(
      `Translation read access missing. Current scopes: ${grantedScopes.join(
        ',',
      )}`,
    );
  }

  if (
    !grantedScopes.includes(
      'read_markets',
    )
  ) {
    throw new Error(
      `read_markets scope missing. Current scopes: ${grantedScopes.join(
        ',',
      )}`,
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
      `Shopify returned non-JSON response. HTTP ${response.status}: ${raw}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify HTTP ${response.status}: ${raw}`,
    );
  }

  if (
    body?.errors?.length
  ) {
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

const COLLECTION_QUERY = `#graphql
  query RemainingHandleCollection(
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
          status
        }

        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

const ALL_PRODUCTS_QUERY = `#graphql
  query RemainingHandleAllProducts(
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

const TRANSLATION_QUERY = `#graphql
  query RemainingHandleTranslationState(
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
        locale: "${TARGET_LOCALE}"
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
  mutation UpdateRemainingProductHandle(
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

async function getCollectionProducts() {
  const products = [];

  let after = null;
  let collectionInfo = null;

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

    collectionInfo ||= {
      id:
        collection.id,

      handle:
        collection.handle,

      title:
        collection.title,
    };

    products.push(
      ...collection
        .products
        .nodes,
    );

    after =
      collection
        .products
        .pageInfo
        .hasNextPage
        ? collection
            .products
            .pageInfo
            .endCursor
        : null;
  } while (after);

  return {
    collectionInfo,
    products,
  };
}

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
        'Could not read all store products.',
      );
    }

    products.push(
      ...connection.nodes,
    );

    after =
      connection
        .pageInfo
        .hasNextPage
        ? connection
            .pageInfo
            .endCursor
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
      `Translatable product resource missing: ${product.handle}`,
    );
  }

  if (
    resource.resourceId !==
    product.id
  ) {
    throw new Error(
      `Translation resource ID mismatch: ${product.handle}`,
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
      `Expected exactly one handle source for ${product.handle}; found ${handleSources.length}.`,
    );
  }

  const handleSource =
    handleSources[0];

  if (
    handleSource.value !==
    product.handle
  ) {
    throw new Error(
      `Handle source differs from product handle on ${product.handle}.`,
    );
  }

  if (
    handleSource.locale !==
    SOURCE_LOCALE
  ) {
    throw new Error(
      `Unexpected handle source locale on ${product.handle}: ${handleSource.locale}`,
    );
  }

  if (!handleSource.digest) {
    throw new Error(
      `Handle source digest missing: ${product.handle}`,
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

  for (
    const translation
    of enHandleTranslations
  ) {
    if (
      translation.locale !==
      TARGET_LOCALE
    ) {
      throw new Error(
        `Unexpected translated handle locale on ${product.handle}: ${translation.locale}`,
      );
    }
  }

  return {
    handleSource,
    enHandleTranslations,
  };
}

function writeJson(
  prefix,
  payload,
) {
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
      .replace(
        /[:.]/g,
        '-',
      );

  const filePath =
    path.join(
      dir,
      `${prefix}-${stamp}.json`,
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

function assertNoTargetCollisions(
  collectionProducts,
  allStoreProducts,
) {
  const targetGroups =
    new Map();

  for (
    const product
    of collectionProducts
  ) {
    const target =
      generateSeoHandle(
        product.title,
      );

    if (!target) {
      throw new Error(
        `Generated empty handle for ${product.title}`,
      );
    }

    const group =
      targetGroups.get(target) ||
      [];

    group.push(product);

    targetGroups.set(
      target,
      group,
    );
  }

  const duplicateTargets =
    [...targetGroups.entries()]
      .filter(
        ([, products]) =>
          products.length > 1,
      );

  if (
    duplicateTargets.length >
    0
  ) {
    const detail =
      duplicateTargets
        .map(
          ([target, products]) =>
            `${target}: ${products
              .map(
                (product) =>
                  `${product.title} (${product.handle})`,
              )
              .join(' | ')}`,
        )
        .join('\n');

    throw new Error(
      `Collection target collisions found:\n${detail}`,
    );
  }

  for (
    const product
    of collectionProducts
  ) {
    const target =
      generateSeoHandle(
        product.title,
      );

    const otherOwners =
      allStoreProducts.filter(
        (candidate) =>
          candidate.handle ===
            target &&
          candidate.id !==
            product.id,
      );

    if (
      otherOwners.length >
      0
    ) {
      throw new Error(
        `Store-wide target collision for ${target}. Source product: ${product.title}. Other owner(s): ${otherOwners
          .map(
            (owner) =>
              `${owner.title} (${owner.id})`,
          )
          .join(', ')}`,
      );
    }
  }
}

async function verifyProductHandle(
  original,
  expectedHandle,
) {
  const allProducts =
    await getAllStoreProducts();

  const fresh =
    allProducts.find(
      (product) =>
        product.id ===
        original.id,
    );

  if (!fresh) {
    throw new Error(
      `Product disappeared after handle update: ${original.id}`,
    );
  }

  if (
    fresh.title !==
    original.title
  ) {
    throw new Error(
      `Title changed unexpectedly for ${original.id}.`,
    );
  }

  if (
    fresh.handle !==
    expectedHandle
  ) {
    throw new Error(
      `Handle verification failed for ${original.title}. Expected ${expectedHandle}, got ${fresh.handle}.`,
    );
  }

  const owners =
    allProducts.filter(
      (product) =>
        product.handle ===
        expectedHandle,
    );

  if (
    owners.length !== 1 ||
    owners[0].id !==
      original.id
  ) {
    throw new Error(
      `Handle ownership verification failed for ${expectedHandle}.`,
    );
  }

  return fresh;
}

async function main() {
  console.log(`
WANDINI
Fototapeten German/Base Handle Migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

THIS SCRIPT CAN CHANGE PRODUCT HANDLES.

Expected state after successful TEST-2:

Collection total      : ${EXPECTED_COLLECTION_TOTAL}
Store total           : ${EXPECTED_STORE_TOTAL}

Already correct       : ${EXPECTED_ALREADY_CORRECT}
Remaining to change   : ${EXPECTED_TO_CHANGE}

Algorithm:

ä -> ae
ö -> oe
ü -> ue
ß -> ss

other Latin accents -> ASCII
& -> und
apostrophes -> removed
other separators -> -
lowercase
duplicate hyphens collapsed

Every changed product:
redirectNewHandle = true

NO title writes.
NO English translation writes.
NO metafield writes.
NO variant writes.
NO price writes.
NO SKU writes.
NO image writes.
`);

  /*
   * STEP 1
   * Fresh collection + store read.
   */
  const {
    collectionInfo,
    products:
      collectionProducts,
  } =
    await getCollectionProducts();

  const allStoreProducts =
    await getAllStoreProducts();

  if (
    collectionProducts.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_COLLECTION_TOTAL} collection products, found ${collectionProducts.length}.`,
    );
  }

  if (
    allStoreProducts.length !==
    EXPECTED_STORE_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_STORE_TOTAL} total store products, found ${allStoreProducts.length}.`,
    );
  }

  /*
   * Identity sanity.
   */
  const ids =
    new Set();

  const handles =
    new Set();

  for (
    const product
    of collectionProducts
  ) {
    if (
      !product.id ||
      !product.title ||
      !product.handle
    ) {
      throw new Error(
        `Product identity missing: ${JSON.stringify(
          product,
        )}`,
      );
    }

    if (
      ids.has(product.id)
    ) {
      throw new Error(
        `Duplicate collection product ID: ${product.id}`,
      );
    }

    ids.add(product.id);

    if (
      handles.has(
        product.handle,
      )
    ) {
      throw new Error(
        `Duplicate current collection handle: ${product.handle}`,
      );
    }

    handles.add(
      product.handle,
    );
  }

  /*
   * STEP 2
   * Generate targets.
   */
  const rows =
    collectionProducts.map(
      (product) => {
        const targetHandle =
          generateSeoHandle(
            product.title,
          );

        return {
          product,
          currentHandle:
            product.handle,

          targetHandle,

          needsChange:
            product.handle !==
            targetHandle,
        };
      },
    );

  const alreadyCorrect =
    rows.filter(
      (row) =>
        !row.needsChange,
    );

  const toChange =
    rows.filter(
      (row) =>
        row.needsChange,
    );

  if (
    alreadyCorrect.length !==
    EXPECTED_ALREADY_CORRECT
  ) {
    throw new Error(
      `Expected ${EXPECTED_ALREADY_CORRECT} already-correct products after TEST-2, found ${alreadyCorrect.length}.`,
    );
  }

  if (
    toChange.length !==
    EXPECTED_TO_CHANGE
  ) {
    throw new Error(
      `Expected ${EXPECTED_TO_CHANGE} remaining handle changes, found ${toChange.length}.`,
    );
  }

  /*
   * Ensure TEST-2 results are part of the
   * 10 already-correct products.
   */
  const expectedTestHandles = [
    'fototapete-schwarzer-marmor-mit-goldadern',
    'fototapete-traumwal-ueber-den-wolken',
  ];

  for (
    const handle
    of expectedTestHandles
  ) {
    const found =
      alreadyCorrect.some(
        (row) =>
          row.currentHandle ===
          handle &&
          row.targetHandle ===
          handle,
      );

    if (!found) {
      throw new Error(
        `Successful TEST-2 handle not found in already-correct state: ${handle}`,
      );
    }
  }

  /*
   * STEP 3
   * Collision safety.
   */
  assertNoTargetCollisions(
    collectionProducts,
    allStoreProducts,
  );

  /*
   * STEP 4
   * Translation audit.
   *
   * We do NOT write translations here.
   * We only make sure current state still
   * matches the audit.
   */
  const translationStates =
    [];

  for (
    let i = 0;
    i < collectionProducts.length;
    i += 1
  ) {
    const product =
      collectionProducts[i];

    process.stdout.write(
      `\rTranslation precheck ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${collectionProducts.length}`,
    );

    const state =
      await getTranslationState(
        product,
      );

    translationStates.push({
      product,
      state,
    });

    await sleep(40);
  }

  process.stdout.write('\n');

  const allEnHandleTranslations =
    translationStates.flatMap(
      ({product, state}) =>
        state.enHandleTranslations.map(
          (translation) => ({
            product,
            translation,
          }),
        ),
    );

  const globalEnHandleTranslations =
    allEnHandleTranslations.filter(
      ({translation}) =>
        !translation.market,
    );

  const marketSpecificEnHandleTranslations =
    allEnHandleTranslations.filter(
      ({translation}) =>
        Boolean(
          translation.market,
        ),
    );

  if (
    marketSpecificEnHandleTranslations.length !==
    0
  ) {
    throw new Error(
      `Expected 0 market-specific EN handle translations, found ${marketSpecificEnHandleTranslations.length}.`,
    );
  }

  if (
    globalEnHandleTranslations.length !==
    EXPECTED_GLOBAL_EN_HANDLE_TRANSLATIONS
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_GLOBAL_EN_HANDLE_TRANSLATIONS} GLOBAL EN handle translation, found ${globalEnHandleTranslations.length}.`,
    );
  }

  const existingEn =
    globalEnHandleTranslations[0];

  if (
    existingEn.product.title !==
    EXPECTED_EN_HANDLE_OWNER_TITLE
  ) {
    throw new Error(
      `Unexpected product owns the existing GLOBAL EN handle translation: ${existingEn.product.title}`,
    );
  }

  const existingEnValue =
    existingEn.translation.value;

  /*
   * STEP 5
   * Save full BEFORE state.
   */
  const beforePath =
    writeJson(
      'fototapeten-handles-remaining94-before',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        collection:
          collectionInfo,

        summary: {
          collectionProducts:
            collectionProducts.length,

          allStoreProducts:
            allStoreProducts.length,

          alreadyCorrect:
            alreadyCorrect.length,

          toChange:
            toChange.length,

          globalEnHandleTranslations:
            globalEnHandleTranslations.length,

          marketSpecificEnHandleTranslations:
            marketSpecificEnHandleTranslations.length,
        },

        products:
          rows.map(
            (row) => {
              const translation =
                translationStates.find(
                  (entry) =>
                    entry.product.id ===
                    row.product.id,
                );

              return {
                id:
                  row.product.id,

                title:
                  row.product.title,

                status:
                  row.product.status,

                currentHandle:
                  row.currentHandle,

                targetHandle:
                  row.targetHandle,

                needsChange:
                  row.needsChange,

                translationState:
                  translation?.state,
              };
            },
          ),
      },
    );

  console.log(`
================ PRECHECK CLEAN ================

COLLECTION PRODUCTS        : ${collectionProducts.length}
ALL STORE PRODUCTS         : ${allStoreProducts.length}

ALREADY CORRECT            : ${alreadyCorrect.length}
REMAINING TO CHANGE        : ${toChange.length}

EMPTY TARGETS              : 0
COLLECTION COLLISIONS      : 0
STORE-WIDE COLLISIONS      : 0

GLOBAL EN HANDLE RECORDS   : ${globalEnHandleTranslations.length}
MARKET-SPECIFIC EN HANDLES : ${marketSpecificEnHandleTranslations.length}

Existing GLOBAL EN handle:
${existingEn.product.title}
${existingEn.product.handle}
→ ${existingEn.translation.value}
outdated=${existingEn.translation.outdated}

THIS EN TRANSLATION WILL NOT BE WRITTEN.

Before snapshot:
${beforePath}
`);

  console.log(
    '\n================ 94 HANDLE CHANGES ================\n',
  );

  for (
    const row
    of toChange
  ) {
    console.log(
      `${row.currentHandle}`,
    );

    console.log(
      `→ ${row.targetHandle}`,
    );

    console.log(
      `${row.product.title}\n`,
    );
  }

  console.log(`
ONLY product.handle will be changed.

For every changed product:
redirectNewHandle = true

English translated handles are untouched.
Titles are untouched.
Metafields are untouched.
Variants are untouched.
Prices are untouched.
SKUs are untouched.
Images are untouched.
`);

  /*
   * STEP 6
   * Explicit human confirmation.
   */
  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE 94 HANDLES to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE 94 HANDLES'
  ) {
    console.log(
      '\nCancelled. NO HANDLE WRITES WERE PERFORMED.',
    );

    return;
  }

  /*
   * STEP 7
   * Write 94 individually.
   */
  for (
    let i = 0;
    i < toChange.length;
    i += 1
  ) {
    const row =
      toChange[i];

    /*
     * Last-second full store read before write.
     */
    const freshStore =
      await getAllStoreProducts();

    const freshProduct =
      freshStore.find(
        (product) =>
          product.id ===
          row.product.id,
      );

    if (!freshProduct) {
      throw new Error(
        `Product disappeared before write: ${row.product.id}`,
      );
    }

    if (
      freshProduct.title !==
      row.product.title
    ) {
      throw new Error(
        `Title changed before write: ${row.product.id}`,
      );
    }

    if (
      freshProduct.handle !==
      row.currentHandle
    ) {
      throw new Error(
        `Current handle changed before write for ${row.product.title}. Expected ${row.currentHandle}, got ${freshProduct.handle}.`,
      );
    }

    const recalculated =
      generateSeoHandle(
        freshProduct.title,
      );

    if (
      recalculated !==
      row.targetHandle
    ) {
      throw new Error(
        `Algorithm target changed before write for ${row.product.title}. Expected ${row.targetHandle}, got ${recalculated}.`,
      );
    }

    const targetOwner =
      freshStore.find(
        (product) =>
          product.handle ===
            row.targetHandle &&
          product.id !==
            row.product.id,
      );

    if (targetOwner) {
      throw new Error(
        `Target handle became occupied before write: ${row.targetHandle} by ${targetOwner.title}`,
      );
    }

    console.log(
      `\n[${i + 1}/${toChange.length}] Updating`,
    );

    console.log(
      `${row.currentHandle}`,
    );

    console.log('→');

    console.log(
      `${row.targetHandle}`,
    );

    const data =
      await gql(
        UPDATE_HANDLE_MUTATION,
        {
          product: {
            id:
              row.product.id,

            handle:
              row.targetHandle,

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
        `productUpdate returned no payload for ${row.currentHandle}.`,
      );
    }

    if (
      result.userErrors?.length >
      0
    ) {
      throw new Error(
        `productUpdate failed for ${row.currentHandle}:\n${JSON.stringify(
          result.userErrors,
          null,
          2,
        )}`,
      );
    }

    if (!result.product) {
      throw new Error(
        `Updated product missing from response for ${row.currentHandle}.`,
      );
    }

    if (
      result.product.id !==
      row.product.id
    ) {
      throw new Error(
        `Unexpected product ID returned for ${row.currentHandle}.`,
      );
    }

    if (
      result.product.title !==
      row.product.title
    ) {
      throw new Error(
        `Title changed during update for ${row.currentHandle}.`,
      );
    }

    if (
      result.product.handle !==
      row.targetHandle
    ) {
      throw new Error(
        `Shopify returned unexpected handle for ${row.product.title}: ${result.product.handle}`,
      );
    }

    writesCompleted += 1;

    /*
     * Immediate Shopify re-read.
     */
    await sleep(300);

    await verifyProductHandle(
      row.product,
      row.targetHandle,
    );

    console.log(
      `Verified: ${row.targetHandle}`,
    );

    await sleep(75);
  }

  /*
   * STEP 8
   * Final 104/104 verification.
   */
  console.log(
    '\nRunning FINAL 104/104 handle verification...',
  );

  const {
    products:
      finalCollectionProducts,
  } =
    await getCollectionProducts();

  const finalAllStoreProducts =
    await getAllStoreProducts();

  if (
    finalCollectionProducts.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Final collection total mismatch. Expected ${EXPECTED_COLLECTION_TOTAL}, got ${finalCollectionProducts.length}.`,
    );
  }

  if (
    finalAllStoreProducts.length !==
    EXPECTED_STORE_TOTAL
  ) {
    throw new Error(
      `Final store total mismatch. Expected ${EXPECTED_STORE_TOTAL}, got ${finalAllStoreProducts.length}.`,
    );
  }

  assertNoTargetCollisions(
    finalCollectionProducts,
    finalAllStoreProducts,
  );

  const beforeById =
    new Map(
      collectionProducts.map(
        (product) => [
          product.id,
          product,
        ],
      ),
    );

  for (
    let i = 0;
    i < finalCollectionProducts.length;
    i += 1
  ) {
    const product =
      finalCollectionProducts[i];

    process.stdout.write(
      `\rFinal handles ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${finalCollectionProducts.length}`,
    );

    const before =
      beforeById.get(
        product.id,
      );

    if (!before) {
      throw new Error(
        `Unexpected product appeared: ${product.id}`,
      );
    }

    if (
      product.title !==
      before.title
    ) {
      throw new Error(
        `Title changed unexpectedly: ${product.id}`,
      );
    }

    const expectedHandle =
      generateSeoHandle(
        product.title,
      );

    if (
      product.handle !==
      expectedHandle
    ) {
      throw new Error(
        `Final handle mismatch for ${product.title}.\nExpected: ${expectedHandle}\nActual:   ${product.handle}`,
      );
    }

    await sleep(10);
  }

  process.stdout.write('\n');

  /*
   * STEP 9
   * Verify English handle translation was
   * not replaced or deleted.
   */
  const finalTranslationStates =
    [];

  for (
    let i = 0;
    i < finalCollectionProducts.length;
    i += 1
  ) {
    const product =
      finalCollectionProducts[i];

    process.stdout.write(
      `\rFinal EN translation check ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${finalCollectionProducts.length}`,
    );

    const state =
      await getTranslationState(
        product,
      );

    finalTranslationStates.push({
      product,
      state,
    });

    await sleep(40);
  }

  process.stdout.write('\n');

  const finalEnHandles =
    finalTranslationStates.flatMap(
      ({product, state}) =>
        state.enHandleTranslations.map(
          (translation) => ({
            product,
            translation,
          }),
        ),
    );

  const finalGlobalEnHandles =
    finalEnHandles.filter(
      ({translation}) =>
        !translation.market,
    );

  const finalMarketEnHandles =
    finalEnHandles.filter(
      ({translation}) =>
        Boolean(
          translation.market,
        ),
    );

  if (
    finalGlobalEnHandles.length !==
    EXPECTED_GLOBAL_EN_HANDLE_TRANSLATIONS
  ) {
    throw new Error(
      `Final GLOBAL EN handle count changed unexpectedly. Expected ${EXPECTED_GLOBAL_EN_HANDLE_TRANSLATIONS}, got ${finalGlobalEnHandles.length}.`,
    );
  }

  if (
    finalMarketEnHandles.length !==
    0
  ) {
    throw new Error(
      `Unexpected market-specific EN handles after migration: ${finalMarketEnHandles.length}.`,
    );
  }

  const finalExistingEn =
    finalGlobalEnHandles[0];

  if (
    finalExistingEn.product.title !==
    EXPECTED_EN_HANDLE_OWNER_TITLE
  ) {
    throw new Error(
      `GLOBAL EN handle owner changed unexpectedly: ${finalExistingEn.product.title}`,
    );
  }

  if (
    finalExistingEn.translation.value !==
    existingEnValue
  ) {
    throw new Error(
      `Existing Koi EN handle translation value changed unexpectedly.\nBefore: ${existingEnValue}\nAfter: ${finalExistingEn.translation.value}`,
    );
  }

  /*
   * STEP 10
   * Save AFTER state.
   */
  const afterPath =
    writeJson(
      'fototapeten-handles-remaining94-after',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        summary: {
          collectionProducts:
            finalCollectionProducts.length,

          allStoreProducts:
            finalAllStoreProducts.length,

          writesCompleted,

          exactTitleDerivedHandles:
            finalCollectionProducts.length,

          globalEnHandleTranslations:
            finalGlobalEnHandles.length,

          marketSpecificEnHandleTranslations:
            finalMarketEnHandles.length,
        },

        products:
          finalCollectionProducts.map(
            (product) => ({
              id:
                product.id,

              title:
                product.title,

              handle:
                product.handle,

              expectedHandle:
                generateSeoHandle(
                  product.title,
                ),
            }),
          ),

        existingEnHandleTranslation: {
          productId:
            finalExistingEn.product.id,

          productTitle:
            finalExistingEn.product.title,

          baseHandle:
            finalExistingEn.product.handle,

          translation:
            finalExistingEn.translation,
        },
      },
    );

  console.log(`
================================================
GERMAN/BASE HANDLE MIGRATION COMPLETE
================================================

Changed this run       : ${writesCompleted}
Already correct before : ${alreadyCorrect.length}
Correct total          : ${finalCollectionProducts.length}

104/104 Fototapeten now use the exact
German-title-derived Wandini SEO handle algorithm.

Final guarantees:

- 94/94 remaining handle writes succeeded
- 104/104 final handles exact
- product IDs unchanged
- product titles unchanged
- collection membership unchanged
- no target collisions
- redirectNewHandle=true used for every changed product
- no English handle translation writes
- existing Koi EN handle translation preserved
- no metafield writes
- no variant writes
- no price writes
- no SKU writes
- no image writes

After snapshot:
${afterPath}

NEXT:
Audit English product titles + translated handles
before the English URL migration.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nGERMAN/BASE HANDLE MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(
      `\nSuccessful handle writes before failure: ${writesCompleted}/${EXPECTED_TO_CHANGE}`,
    );

    if (
      writesCompleted > 0
    ) {
      console.error(`
IMPORTANT:

At least one product handle was changed successfully.

DO NOT blindly rerun this script.

Run a fresh READ-ONLY handle audit first so we can
determine the exact remaining state safely.
`);
    } else {
      console.error(`
No handle writes completed.
`);
    }

    process.exitCode = 1;
  },
);