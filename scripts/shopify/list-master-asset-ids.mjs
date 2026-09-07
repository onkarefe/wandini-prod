import fs from 'node:fs';
import path from 'node:path';

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

const NAMESPACE = 'custom';
const KEY = 'master_asset_id';

const EXPECTED_TOTAL = 104;
const EXCLUDED_HANDLE = '0-base';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Missing Shopify migration credentials.');
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

let accessToken = null;

async function getToken() {
  if (accessToken) {
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

  const text = await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid auth response: ${text}`,
    );
  }

  if (!response.ok || !body?.access_token) {
    throw new Error(
      `Authentication failed: ${text}`,
    );
  }

  accessToken = body.access_token;

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope || 'not returned'
    }`,
  );

  return accessToken;
}

async function gql(query, variables = {}) {
  if (/\bmutation\b/i.test(query)) {
    throw new Error(
      'READ-ONLY guard blocked mutation.',
    );
  }

  const token = await getToken();

  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    },
  );

  const text = await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Shopify response: ${text}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text}`,
    );
  }

  if (body?.errors?.length) {
    throw new Error(
      JSON.stringify(
        body.errors,
        null,
        2,
      ),
    );
  }

  return body.data;
}

const QUERY = `#graphql
  query MasterAssetIds(
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
          handle
          title

          metafield(
            namespace: "${NAMESPACE}"
            key: "${KEY}"
          ) {
            id
            type
            value
          }
        }

        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

async function main() {
  console.log(`
WANDINI
Shopify Master Asset ID export

MODE: READ ONLY
Shop: ${SHOP}
Collection: ${COLLECTION_HANDLE}
Metafield: ${NAMESPACE}.${KEY}
`);

  const products = [];

  let after = null;
  let collectionInfo = null;

  do {
    const data = await gql(
      QUERY,
      {
        handle: COLLECTION_HANDLE,
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
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
    };

    products.push(
      ...collection.products.nodes,
    );

    after =
      collection.products.pageInfo.hasNextPage
        ? collection.products.pageInfo.endCursor
        : null;
  } while (after);

  if (products.length !== EXPECTED_TOTAL) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL} products, found ${products.length}.`,
    );
  }

  const excluded =
    products.find(
      (product) =>
        product.handle === EXCLUDED_HANDLE,
    );

  if (!excluded) {
    throw new Error(
      `${EXCLUDED_HANDLE} not found.`,
    );
  }

  const targetProducts =
    products.filter(
      (product) =>
        product.handle !== EXCLUDED_HANDLE,
    );

  const missing =
    targetProducts.filter(
      (product) =>
        !product.metafield?.value,
    );

  if (missing.length > 0) {
    throw new Error(
      `Missing master_asset_id:\n${missing
        .map((p) => p.handle)
        .join('\n')}`,
    );
  }

  const values =
    targetProducts.map(
      (product) =>
        product.metafield.value,
    );

  const counts = new Map();

  for (const value of values) {
    counts.set(
      value,
      (counts.get(value) || 0) + 1,
    );
  }

  const duplicates = [
    ...counts.entries(),
  ].filter(
    ([, count]) =>
      count > 1,
  );

  const sorted =
    [...values].sort(
      (a, b) =>
        a.localeCompare(
          b,
          'en',
          {sensitivity: 'variant'},
        ),
    );

  console.log(`
================ RESULT ================

TOTAL COLLECTION : ${products.length}
EXCLUDED         : 1 (${EXCLUDED_HANDLE})
MASTER ASSET IDS : ${values.length}
UNIQUE IDS       : ${new Set(values).size}
DUPLICATES       : ${duplicates.length}

SHOPIFY MASTER ASSET IDS:
`);

  for (const value of sorted) {
    console.log(value);
  }

  console.log(`
EXCLUDED PRODUCT:
${excluded.handle} -> ${
    excluded.metafield?.value ?? '(empty)'
  }
`);

  if (duplicates.length > 0) {
    console.log(
      'DUPLICATES:',
    );

    for (
      const [value, count]
      of duplicates
    ) {
      console.log(
        `${value} x${count}`,
      );
    }
  }

  const dir =
    path.resolve(
      'migration-audits',
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

  const txtPath =
    path.join(
      dir,
      `shopify-master-asset-ids-${timestamp}.txt`,
    );

  const jsonPath =
    path.join(
      dir,
      `shopify-master-asset-ids-${timestamp}.json`,
    );

  fs.writeFileSync(
    txtPath,
    sorted.join('\n') + '\n',
    'utf8',
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        mode: 'READ_ONLY',

        shop: SHOP,

        collection:
          collectionInfo,

        excluded: {
          handle:
            excluded.handle,

          value:
            excluded.metafield?.value ??
            null,
        },

        summary: {
          totalCollection:
            products.length,

          exported:
            values.length,

          unique:
            new Set(values).size,

          duplicates:
            duplicates.length,
        },

        products:
          targetProducts.map(
            (product) => ({
              id:
                product.id,

              handle:
                product.handle,

              masterAssetId:
                product.metafield.value,
            }),
          ),

        sortedMasterAssetIds:
          sorted,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`
TXT:
${txtPath}

JSON:
${jsonPath}

NO SHOPIFY DATA WAS CHANGED.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nEXPORT FAILED:\n',
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(
      '\nNO SHOPIFY DATA WAS CHANGED.',
    );

    process.exitCode = 1;
  },
);