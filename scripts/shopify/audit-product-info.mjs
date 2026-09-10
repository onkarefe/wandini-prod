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

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error(
    'Missing PUBLIC_STORE_DOMAIN / SHOPIFY_MIGRATION_CLIENT_ID / SHOPIFY_MIGRATION_CLIENT_SECRET.',
  );
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

  const raw = await response.text();

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid auth response: ${raw}`,
    );
  }

  if (!response.ok || !body?.access_token) {
    throw new Error(
      `Authentication failed: ${raw}`,
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

  const raw = await response.text();

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid Shopify response: ${raw}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${raw}`,
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
  query ProductInfoAudit(
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

          metafields(
            first: 100
            namespace: "custom"
          ) {
            nodes {
              id
              namespace
              key
              type
              value

              definition {
                id
                name
                namespace
                key
              }
            }
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

function looksLikeProductInfo(metafield) {
  const key =
    String(
      metafield?.key || '',
    ).toLowerCase();

  const name =
    String(
      metafield?.definition?.name || '',
    ).toLowerCase();

  return (
    key === 'product_info' ||
    key === 'product-info' ||
    key.includes('product_info') ||
    name === 'product info' ||
    name.includes('product info')
  );
}

async function main() {
  console.log(`
WANDINI
Product Info metafield audit

MODE: READ ONLY
Shop: ${SHOP}
Collection: ${COLLECTION_HANDLE}

NO SHOPIFY DATA WILL BE CHANGED.
`);

  const products = [];

  let after = null;

  do {
    const data = await gql(
      QUERY,
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
      collection.products.pageInfo.hasNextPage
        ? collection.products.pageInfo.endCursor
        : null;
  } while (after);

  console.log(
    `Products found: ${products.length}`,
  );

  if (
    products.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_COLLECTION_TOTAL} products, found ${products.length}.`,
    );
  }

  const results = [];

  for (const product of products) {
    const candidates =
      product.metafields.nodes.filter(
        looksLikeProductInfo,
      );

    results.push({
      handle:
        product.handle,

      title:
        product.title,

      candidates,
    });
  }

  const missing =
    results.filter(
      (item) =>
        item.candidates.length === 0,
    );

  const multiple =
    results.filter(
      (item) =>
        item.candidates.length > 1,
    );

  const exactOne =
    results.filter(
      (item) =>
        item.candidates.length === 1,
    );

  const identities =
    new Map();

  for (const item of exactOne) {
    const metafield =
      item.candidates[0];

    const identity =
      `${metafield.namespace}.${metafield.key} | ${metafield.type}`;

    identities.set(
      identity,
      (identities.get(identity) || 0) + 1,
    );
  }

  console.log(`
================ RESULT ================

TOTAL PRODUCTS       : ${products.length}
EXACTLY ONE MATCH    : ${exactOne.length}
MISSING PRODUCT INFO : ${missing.length}
MULTIPLE CANDIDATES  : ${multiple.length}

IDENTITIES / TYPES:
`);

  for (
    const [identity, count]
    of identities.entries()
  ) {
    console.log(
      `${count} x ${identity}`,
    );
  }

  if (missing.length > 0) {
    console.log(
      '\nMISSING:\n',
    );

    for (const item of missing) {
      console.log(
        `${item.handle} | ${item.title}`,
      );
    }
  }

  if (multiple.length > 0) {
    console.log(
      '\nMULTIPLE CANDIDATES:\n',
    );

    for (const item of multiple) {
      console.log(
        `\n${item.handle}`,
      );

      for (
        const metafield
        of item.candidates
      ) {
        console.log(
          `  ${metafield.namespace}.${metafield.key} | ${metafield.type} | definition="${metafield.definition?.name || ''}"`,
        );
      }
    }
  }

  console.log(
    '\nSAMPLE VALUES:\n',
  );

  for (
    const item
    of exactOne.slice(0, 5)
  ) {
    const metafield =
      item.candidates[0];

    console.log(
      `--- ${item.handle} ---`,
    );

    console.log(
      `Definition: ${
        metafield.definition?.name ||
        '(none)'
      }`,
    );

    console.log(
      `Identity: ${metafield.namespace}.${metafield.key}`,
    );

    console.log(
      `Type: ${metafield.type}`,
    );

    console.log(
      'Current value:',
    );

    console.log(
      metafield.value,
    );

    console.log('');
  }

  console.log(`
NO SHOPIFY DATA WAS CHANGED.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nAUDIT FAILED:\n',
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