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

const MASTER_ASSET_NAMESPACE = 'custom';
const MASTER_ASSET_KEY = 'master_asset_id';
const EXPECTED_PLACEHOLDER = 'efes-id';

const TARGETS = [
  {
    handle: '8-3',
    expected: 'WND_WLP_TIE_KI00055_PRINT',
  },
  {
    handle: '7-3',
    expected: 'WND_WLP_TIE_KI00054_PRINT',
  },
  {
    handle: '6-3',
    expected: 'WND_WLP_TIE_KI00053_PRINT',
  },
  {
    handle: '5-3',
    expected: 'WND_WLP_TIE_KI00052_PRINT',
  },
  {
    handle: '4-3',
    expected: 'WND_WLP_TIE_KI00051_PRINT',
  },
];

const EXPECTED_COLLECTION_TOTAL = 104;
const EXPECTED_VALID_DERIVATIONS = 103;
const EXPECTED_BLOCKED_HANDLE = '0-base';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Missing Shopify credentials.

Expected in .env:

PUBLIC_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_MIGRATION_CLIENT_ID=...
SHOPIFY_MIGRATION_CLIENT_SECRET=...
`);

  process.exit(1);
}

if (!SHOP.endsWith('.myshopify.com')) {
  throw new Error(
    `PUBLIC_STORE_DOMAIN must be *.myshopify.com. Received: ${SHOP}`,
  );
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

async function getAdminAccessToken() {
  if (
    accessToken &&
    Date.now() < accessTokenExpiresAt - 60_000
  ) {
    return accessToken;
  }

  const response = await fetch(
    `https://${SHOP}/admin/oauth/access_token`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },

      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    },
  );

  const rawBody = await response.text();

  let body = null;

  try {
    body = rawBody
      ? JSON.parse(rawBody)
      : null;
  } catch {
    body = null;
  }

  if (
    !response.ok ||
    !body?.access_token
  ) {
    throw new Error(
      [
        'Could not obtain Shopify Admin access token.',
        `HTTP: ${response.status} ${response.statusText}`,
        `Body: ${rawBody || '(empty)'}`,
        `X-Request-ID: ${
          response.headers.get('x-request-id') ||
          '(none)'
        }`,
      ].join('\n'),
    );
  }

  accessToken =
    body.access_token;

  accessTokenExpiresAt =
    Date.now() +
    Number(body.expires_in || 0) * 1000;

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

        body: JSON.stringify({
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
        1000 * attempt,
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

  const rawBody =
    await response.text();

  let body;

  try {
    body = rawBody
      ? JSON.parse(rawBody)
      : null;
  } catch {
    throw new Error(
      `Shopify returned non-JSON response. HTTP ${response.status}: ${rawBody}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify HTTP ${
        response.status
      }: ${JSON.stringify(
        body,
        null,
        2,
      )}`,
    );
  }

  if (
    body?.errors?.length
  ) {
    throw new Error(
      `Shopify GraphQL error: ${JSON.stringify(
        body.errors,
        null,
        2,
      )}`,
    );
  }

  return body.data;
}

const COLLECTION_QUERY = `#graphql
  query MasterAssetCollection(
    $handle: String!
    $after: String
  ) {
    collectionByIdentifier(
      identifier: {
        handle: $handle
      }
    ) {
      id
      title
      handle

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

const PRODUCT_QUERY = `#graphql
  query MasterAssetProduct(
    $id: ID!
  ) {
    product(id: $id) {
      id
      title
      handle

      images(
        first: 1
        sortKey: POSITION
      ) {
        nodes {
          id
          url
          altText
        }
      }

      metafield(
        namespace: "${MASTER_ASSET_NAMESPACE}"
        key: "${MASTER_ASSET_KEY}"
      ) {
        id
        namespace
        key
        type
        value
      }
    }
  }
`;

const SET_METAFIELDS_MUTATION = `#graphql
  mutation SetMasterAssetIds(
    $metafields: [MetafieldsSetInput!]!
  ) {
    metafieldsSet(
      metafields: $metafields
    ) {
      metafields {
        id
        namespace
        key
        type
        value
      }

      userErrors {
        field
        message
        code
      }
    }
  }
`;

async function getCollectionProducts() {
  const products = [];

  let after = null;
  let info = null;

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

    info ||= {
      id:
        collection.id,

      title:
        collection.title,

      handle:
        collection.handle,
    };

    products.push(
      ...collection.products.nodes,
    );

    after =
      collection.products
        .pageInfo
        .hasNextPage
        ? collection
            .products
            .pageInfo
            .endCursor
        : null;
  } while (after);

  return {
    info,
    products,
  };
}

async function getProduct(id) {
  const data =
    await gql(
      PRODUCT_QUERY,
      {id},
    );

  if (!data?.product) {
    throw new Error(
      `Product not found: ${id}`,
    );
  }

  return data.product;
}

function filenameFromImageUrl(
  imageUrl,
) {
  if (!imageUrl) {
    return null;
  }

  try {
    const url =
      new URL(
        String(imageUrl),
      );

    const raw =
      url.pathname
        .split('/')
        .pop();

    return raw
      ? decodeURIComponent(raw)
      : null;
  } catch {
    return null;
  }
}

function deriveMasterAssetId(
  filename,
) {
  if (!filename) {
    return {
      ok: false,
      reason:
        'FIRST_IMAGE_FILENAME_MISSING',
      expected: null,
    };
  }

  const stem =
    filename.replace(
      /\.[^.]+$/,
      '',
    );

  if (
    !stem.endsWith(
      '_WEB',
    )
  ) {
    return {
      ok: false,
      reason:
        'FIRST_IMAGE_DOES_NOT_END_WITH__WEB',
      expected: null,
    };
  }

  const base =
    stem.slice(
      0,
      -4,
    );

  if (!base) {
    return {
      ok: false,
      reason:
        'EMPTY_BASE_BEFORE__WEB',
      expected: null,
    };
  }

  return {
    ok: true,
    reason: null,
    expected:
      `${base}_PRINT`,
  };
}

function inspectProduct(
  product,
) {
  const firstImage =
    product.images
      ?.nodes?.[0] ||
    null;

  const filename =
    filenameFromImageUrl(
      firstImage?.url ||
        null,
    );

  const derived =
    deriveMasterAssetId(
      filename,
    );

  return {
    productId:
      product.id,

    handle:
      product.handle,

    title:
      product.title,

    firstImageId:
      firstImage?.id ||
      null,

    firstImageUrl:
      firstImage?.url ||
      null,

    filename,

    derived,

    metafield:
      product.metafield
        ? {
            id:
              product
                .metafield
                .id,

            namespace:
              product
                .metafield
                .namespace,

            key:
              product
                .metafield
                .key,

            type:
              product
                .metafield
                .type,

            value:
              product
                .metafield
                .value,
          }
        : null,
  };
}

async function fullPreflight() {
  const {
    info,
    products: stubs,
  } =
    await getCollectionProducts();

  if (
    stubs.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Collection size changed. Expected ${EXPECTED_COLLECTION_TOTAL}, found ${stubs.length}. Aborting.`,
    );
  }

  const inspected = [];

  for (
    let i = 0;
    i < stubs.length;
    i += 1
  ) {
    const product =
      await getProduct(
        stubs[i].id,
      );

    inspected.push(
      inspectProduct(
        product,
      ),
    );

    process.stdout.write(
      `\rPreflight ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${stubs.length}`,
    );

    await sleep(75);
  }

  process.stdout.write(
    '\n',
  );

  const valid =
    inspected.filter(
      (item) =>
        item.derived.ok,
    );

  const blocked =
    inspected.filter(
      (item) =>
        !item.derived.ok,
    );

  if (
    valid.length !==
    EXPECTED_VALID_DERIVATIONS
  ) {
    throw new Error(
      `Expected ${EXPECTED_VALID_DERIVATIONS} valid derivations, found ${valid.length}. Aborting.`,
    );
  }

  if (
    blocked.length !== 1 ||
    blocked[0].handle !==
      EXPECTED_BLOCKED_HANDLE ||
    blocked[0]
      .derived
      .reason !==
      'FIRST_IMAGE_FILENAME_MISSING'
  ) {
    throw new Error(
      `Unexpected blocked product set:\n${JSON.stringify(
        blocked.map(
          (item) => ({
            handle:
              item.handle,

            reason:
              item
                .derived
                .reason,

            filename:
              item.filename,
          }),
        ),
        null,
        2,
      )}`,
    );
  }

  const expectedOwners =
    new Map();

  for (
    const item
    of valid
  ) {
    const owners =
      expectedOwners.get(
        item
          .derived
          .expected,
      ) || [];

    owners.push(
      item.handle,
    );

    expectedOwners.set(
      item
        .derived
        .expected,
      owners,
    );
  }

  const duplicates =
    [
      ...expectedOwners
        .entries(),
    ].filter(
      ([, handles]) =>
        handles.length > 1,
    );

  if (
    duplicates.length >
    0
  ) {
    throw new Error(
      `Duplicate derived IDs found:\n${JSON.stringify(
        duplicates,
        null,
        2,
      )}`,
    );
  }

  return {
    info,
    inspected,
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

  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        '-',
      );

  const filePath =
    path.join(
      dir,
      `${prefix}-${timestamp}.json`,
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

async function main() {
  console.log(`
WANDINI
Master Asset ID TEST-5 migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}
Target metafield: ${MASTER_ASSET_NAMESPACE}.${MASTER_ASSET_KEY}

THIS SCRIPT CAN WRITE TO SHOPIFY.
It is hard-locked to exactly 5 products.
0-base is never a target.
`);

  const {
    info,
    inspected,
  } =
    await fullPreflight();

  const byHandle =
    new Map(
      inspected.map(
        (item) => [
          item.handle,
          item,
        ],
      ),
    );

  const targets =
    TARGETS.map(
      (target) => {
        const item =
          byHandle.get(
            target.handle,
          );

        if (!item) {
          throw new Error(
            `Target product missing from collection: ${target.handle}`,
          );
        }

        if (
          !item.derived.ok
        ) {
          throw new Error(
            `Target ${target.handle} has invalid image derivation: ${item.derived.reason}`,
          );
        }

        if (
          item
            .derived
            .expected !==
          target.expected
        ) {
          throw new Error(
            `Target ${target.handle} derived ID changed. Expected ${target.expected}, got ${item.derived.expected}`,
          );
        }

        if (
          !item.metafield
        ) {
          throw new Error(
            `Target ${target.handle} has no existing ${MASTER_ASSET_NAMESPACE}.${MASTER_ASSET_KEY} metafield.`,
          );
        }

        if (
          item
            .metafield
            .namespace !==
            MASTER_ASSET_NAMESPACE ||
          item
            .metafield
            .key !==
            MASTER_ASSET_KEY
        ) {
          throw new Error(
            `Target ${target.handle} metafield identity mismatch.`,
          );
        }

        if (
          item
            .metafield
            .value !==
          EXPECTED_PLACEHOLDER
        ) {
          throw new Error(
            `Target ${target.handle} current value is not ${EXPECTED_PLACEHOLDER}. Found: ${item.metafield.value}`,
          );
        }

        if (
          !item
            .metafield
            .id ||
          !item
            .metafield
            .type
        ) {
          throw new Error(
            `Target ${target.handle} metafield id/type missing.`,
          );
        }

        return {
          ...target,
          before:
            item,
        };
      },
    );

  const uniqueTypes =
    new Set(
      targets.map(
        (target) =>
          target
            .before
            .metafield
            .type,
      ),
    );

  if (
    uniqueTypes.size !==
    1
  ) {
    throw new Error(
      `TEST-5 metafield types differ: ${[
        ...uniqueTypes,
      ].join(', ')}`,
    );
  }

  const backupPath =
    writeJson(
      'master-asset-id-test5-before',
      {
        generatedAt:
          new Date()
            .toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        grantedScopes,

        collection:
          info,

        targets:
          targets.map(
            (target) => ({
              handle:
                target.handle,

              expected:
                target.expected,

              before:
                target.before,
            }),
          ),
      },
    );

  console.log(`
PRECHECK CLEAN.

Backup written:
${backupPath}

Exactly these 5 values will change:
`);

  for (
    const target
    of targets
  ) {
    console.log(
      `${target.handle}: ${target.before.metafield.value} -> ${target.expected}`,
    );
  }

  console.log(`
No variants, prices, SKUs, images, titles, handles or other metafields are written.
`);

  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE 5 MASTER ASSET IDS to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE 5 MASTER ASSET IDS'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  const metafields =
    targets.map(
      (target) => ({
        ownerId:
          target
            .before
            .productId,

        namespace:
          MASTER_ASSET_NAMESPACE,

        key:
          MASTER_ASSET_KEY,

        type:
          target
            .before
            .metafield
            .type,

        value:
          target.expected,
      }),
    );

  const mutationData =
    await gql(
      SET_METAFIELDS_MUTATION,
      {metafields},
      {
        allowMutation:
          true,
      },
    );

  const result =
    mutationData
      ?.metafieldsSet;

  if (!result) {
    throw new Error(
      'metafieldsSet returned no payload.',
    );
  }

  if (
    result
      .userErrors
      ?.length
  ) {
    throw new Error(
      `metafieldsSet userErrors:\n${JSON.stringify(
        result.userErrors,
        null,
        2,
      )}`,
    );
  }

  if (
    result
      .metafields
      ?.length !==
    TARGETS.length
  ) {
    throw new Error(
      `metafieldsSet returned ${
        result
          .metafields
          ?.length ?? 0
      } metafields; expected ${TARGETS.length}.`,
    );
  }

  await sleep(300);

  const after = [];

  for (
    const target
    of targets
  ) {
    const fresh =
      inspectProduct(
        await getProduct(
          target
            .before
            .productId,
        ),
      );

    if (
      fresh.handle !==
      target.handle
    ) {
      throw new Error(
        `Post-write handle mismatch for ${target.handle}.`,
      );
    }

    if (
      !fresh.derived.ok ||
      fresh
        .derived
        .expected !==
        target.expected
    ) {
      throw new Error(
        `Post-write image derivation mismatch for ${target.handle}.`,
      );
    }

    if (
      !fresh.metafield
    ) {
      throw new Error(
        `Post-write metafield missing for ${target.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .id !==
      target
        .before
        .metafield
        .id
    ) {
      throw new Error(
        `Metafield ID changed for ${target.handle}. Before ${target.before.metafield.id}, after ${fresh.metafield.id}`,
      );
    }

    if (
      fresh
        .metafield
        .type !==
      target
        .before
        .metafield
        .type
    ) {
      throw new Error(
        `Metafield type changed for ${target.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .value !==
      target.expected
    ) {
      throw new Error(
        `Verification failed for ${target.handle}. Expected ${target.expected}, got ${fresh.metafield.value}`,
      );
    }

    after.push(
      fresh,
    );
  }

  const afterPath =
    writeJson(
      'master-asset-id-test5-after',
      {
        generatedAt:
          new Date()
            .toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        collection:
          info,

        products:
          after,
      },
    );

  console.log(`
TEST-5 MASTER ASSET MIGRATION COMPLETE.

Verified exactly 5 products:
`);

  for (
    const target
    of targets
  ) {
    console.log(
      `${target.handle} -> ${target.expected}`,
    );
  }

  console.log(`
0-base untouched.
Metafield IDs unchanged.
Metafield types unchanged.
Post-write values verified from Shopify.

After snapshot:
${afterPath}

Now manually check these 5 products in Shopify before we touch the remaining 98.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nTEST-5 MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    process.exitCode = 1;
  },
);