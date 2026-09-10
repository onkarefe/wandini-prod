const API_VERSION =
  process.env.SHOPIFY_ADMIN_API_VERSION || '2026-07';

const SHOP = (process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');

const CLIENT_ID =
  (process.env.SHOPIFY_MIGRATION_CLIENT_ID || '').trim();

const CLIENT_SECRET =
  (process.env.SHOPIFY_MIGRATION_CLIENT_SECRET || '').trim();

/*
 * Koi product's custom.delivery_and_shipping metafield,
 * confirmed by the previous read-only audit.
 */
const METAFIELD_ID =
  'gid://shopify/Metafield/71505823531346';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error(
    'Missing PUBLIC_STORE_DOMAIN / SHOPIFY_MIGRATION_CLIENT_ID / SHOPIFY_MIGRATION_CLIENT_SECRET.',
  );
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function getToken() {
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

  const raw =
    await response.text();

  const body =
    raw
      ? JSON.parse(raw)
      : null;

  if (
    !response.ok ||
    !body?.access_token
  ) {
    throw new Error(
      `Authentication failed. HTTP ${response.status}: ${raw}`,
    );
  }

  console.log(
    `Admin authentication OK. Scopes: ${body.scope || 'not returned'}`,
  );

  return body.access_token;
}

async function gql(
  query,
  variables,
) {
  if (
    /\bmutation\b/i.test(query)
  ) {
    throw new Error(
      'READ-ONLY GUARD: mutation blocked.',
    );
  }

  const token =
    await getToken();

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

  const raw =
    await response.text();

  const body =
    raw
      ? JSON.parse(raw)
      : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${raw}`,
    );
  }

  if (
    body?.errors?.length
  ) {
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
  query InspectDeliveryShipping(
    $resourceId: ID!
  ) {
    node(id: $resourceId) {
      ... on Metafield {
        id
        namespace
        key
        type
        value
      }
    }

    translatableResource(
      resourceId: $resourceId
    ) {
      resourceId

      translatableContent {
        key
        value
        digest
        locale
        type
      }
    }
  }
`;

function prettyJson(
  value,
) {
  try {
    return JSON.stringify(
      JSON.parse(value),
      null,
      2,
    );
  } catch {
    return value;
  }
}

function firstDifference(
  a,
  b,
) {
  const max =
    Math.max(
      a.length,
      b.length,
    );

  for (
    let i = 0;
    i < max;
    i += 1
  ) {
    if (
      a[i] !== b[i]
    ) {
      return i;
    }
  }

  return -1;
}

async function main() {
  console.log(`
WANDINI
Delivery & Shipping source inspection

MODE: READ ONLY

Metafield:
${METAFIELD_ID}

NO SHOPIFY DATA WILL BE CHANGED.
`);

  const data =
    await gql(
      QUERY,
      {
        resourceId:
          METAFIELD_ID,
      },
    );

  const metafield =
    data?.node;

  const resource =
    data?.translatableResource;

  if (!metafield) {
    throw new Error(
      'Metafield not found.',
    );
  }

  if (!resource) {
    throw new Error(
      'Translatable resource not found.',
    );
  }

  const source =
    (
      resource
        .translatableContent ||
      []
    ).find(
      (item) =>
        item.key ===
        'value',
    );

  if (!source) {
    throw new Error(
      'Translatable source key "value" not found.',
    );
  }

  console.log(`
================ METAFIELD =================

ID        : ${metafield.id}
Namespace : ${metafield.namespace}
Key       : ${metafield.key}
Type      : ${metafield.type}

RAW:
${metafield.value}

PRETTY:
${prettyJson(
    metafield.value,
  )}
`);

  console.log(`
================ TRANSLATABLE SOURCE =================

Resource ID : ${resource.resourceId}
Key         : ${source.key}
Locale      : ${source.locale}
Type        : ${source.type}
Digest      : ${source.digest}

RAW:
${source.value}

PRETTY:
${prettyJson(
    source.value,
  )}
`);

  const exact =
    metafield.value ===
    source.value;

  const firstDiff =
    firstDifference(
      metafield.value,
      source.value,
    );

  console.log(`
================ COMPARISON =================

Exact string equal : ${exact}
Metafield length   : ${metafield.value.length}
Source length      : ${source.value?.length ?? 0}
First difference   : ${firstDiff}

NO SHOPIFY DATA WAS CHANGED.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nINSPECTION FAILED:\n',
    );

    console.error(
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