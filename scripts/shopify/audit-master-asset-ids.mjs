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

const MASTER_ASSET_NAMESPACE = 'custom';
const MASTER_ASSET_KEY = 'master_asset_id';

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
  console.error(`
PUBLIC_STORE_DOMAIN must be the *.myshopify.com domain.

Received:
${SHOP}
`);

  process.exit(1);
}

/**
 * READ-ONLY SAFETY
 */
const forbiddenArgs = process.argv
  .slice(2)
  .filter((arg) =>
    /apply|write|delete|mutat|set/i.test(arg),
  );

if (forbiddenArgs.length > 0) {
  throw new Error(
    `READ-ONLY guard rejected CLI argument(s): ${forbiddenArgs.join(
      ', ',
    )}`,
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

/**
 * READ-ONLY GRAPHQL
 */
async function gql(
  query,
  variables = {},
  attempt = 1,
) {
  if (/\bmutation\b/i.test(query)) {
    throw new Error(
      'READ-ONLY guard blocked a GraphQL mutation.',
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
      attempt + 1,
    );
  }

  const rawBody =
    await response.text();

  let body = null;

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

/**
 * CDN URL'den gerçek filename'i çıkar.
 *
 * Örnek:
 * https://cdn.shopify.com/.../WND_WLP_TIE_KI00055_WEB.jpg?v=123
 *
 * ->
 * WND_WLP_TIE_KI00055_WEB.jpg
 */
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

    if (!raw) {
      return null;
    }

    return decodeURIComponent(
      raw,
    );
  } catch {
    return null;
  }
}

/**
 * KURAL:
 *
 * WND_WLP_TIE_KI00055_WEB.jpg
 * ->
 * WND_WLP_TIE_KI00055_PRINT
 *
 * Sadece dosya stem'i TAM OLARAK
 * _WEB ile bitiyorsa kabul edilir.
 */
function deriveMasterAssetId(
  filename,
) {
  if (!filename) {
    return {
      ok: false,
      reason:
        'FIRST_IMAGE_FILENAME_MISSING',
      stem: null,
      expected: null,
    };
  }

  /**
   * Son uzantıyı kaldır.
   */
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
      stem,
      expected: null,
    };
  }

  /**
   * _WEB = 4 karakter
   */
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
      stem,
      expected: null,
    };
  }

  return {
    ok: true,
    reason: null,
    stem,
    expected:
      `${base}_PRINT`,
  };
}

function classifyProduct(
  product,
) {
  const firstImage =
    product.images
      ?.nodes?.[0] ||
    null;

  const imageUrl =
    firstImage?.url
      ? String(
          firstImage.url,
        )
      : null;

  const filename =
    filenameFromImageUrl(
      imageUrl,
    );

  const derived =
    deriveMasterAssetId(
      filename,
    );

  const current =
    product.metafield
      ?.value ??
    null;

  if (!firstImage) {
    return {
      status:
        'BLOCKED',

      reason:
        'NO_FIRST_IMAGE',

      firstImage:
        null,

      filename:
        null,

      currentMasterAssetId:
        current,

      expectedMasterAssetId:
        null,
    };
  }

  if (!derived.ok) {
    return {
      status:
        'BLOCKED',

      reason:
        derived.reason,

      firstImage: {
        id:
          firstImage.id,

        url:
          imageUrl,

        altText:
          firstImage
            .altText ??
          null,
      },

      filename,

      currentMasterAssetId:
        current,

      expectedMasterAssetId:
        null,
    };
  }

  const expected =
    derived.expected;

  return {
    status:
      current === expected
        ? 'ALREADY_CORRECT'
        : 'NEEDS_UPDATE',

    reason:
      null,

    firstImage: {
      id:
        firstImage.id,

      url:
        imageUrl,

      altText:
        firstImage
          .altText ??
        null,
    },

    filename,

    currentMasterAssetId:
      current,

    expectedMasterAssetId:
      expected,
  };
}

async function main() {
  console.log(`
WANDINI
Master Asset ID preflight

MODE: READ ONLY
Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Rule:
first image filename
*_WEB.ext
->
*_PRINT
`);

  const {
    info,
    products: stubs,
  } =
    await getCollectionProducts();

  console.log(
    `Collection: ${info.title} (${info.handle})`,
  );

  console.log(
    `Products found: ${stubs.length}\n`,
  );

  const results = [];

  for (
    let i = 0;
    i < stubs.length;
    i += 1
  ) {
    const stub =
      stubs[i];

    process.stdout.write(
      `Reading ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${stubs.length}: ${stub.handle} ... `,
    );

    const product =
      await getProduct(
        stub.id,
      );

    const audit =
      classifyProduct(
        product,
      );

    results.push({
      product: {
        id:
          product.id,

        title:
          product.title,

        handle:
          product.handle,
      },

      metafield:
        product.metafield
          ? {
              id:
                product
                  .metafield
                  .id,

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

      ...audit,
    });

    console.log(
      audit.status,
    );

    await sleep(100);
  }

  /**
   * Beklenen master_asset_id
   * değerleri benzersiz mi?
   *
   * Sen 103 farklı data olacağını
   * söylediğin için duplicate olursa
   * write'a geçmeyeceğiz.
   */
  const expectedOwners =
    new Map();

  for (
    const result
    of results
  ) {
    if (
      !result
        .expectedMasterAssetId
    ) {
      continue;
    }

    const owners =
      expectedOwners.get(
        result
          .expectedMasterAssetId,
      ) || [];

    owners.push(
      result.product.handle,
    );

    expectedOwners.set(
      result
        .expectedMasterAssetId,
      owners,
    );
  }

  const duplicateExpected =
    [
      ...expectedOwners
        .entries(),
    ]
      .filter(
        ([, handles]) =>
          handles.length > 1,
      )
      .map(
        ([
          expectedMasterAssetId,
          handles,
        ]) => ({
          expectedMasterAssetId,
          handles,
        }),
      );

  const needsUpdate =
    results.filter(
      (result) =>
        result.status ===
        'NEEDS_UPDATE',
    );

  const alreadyCorrect =
    results.filter(
      (result) =>
        result.status ===
        'ALREADY_CORRECT',
    );

  const blocked =
    results.filter(
      (result) =>
        result.status ===
        'BLOCKED',
    );

  console.log(`
================ PREFLIGHT RESULT ================

TOTAL IN COLLECTION   : ${results.length}
VALID DERIVATIONS      : ${
    results.length -
    blocked.length
  }
NEEDS UPDATE           : ${needsUpdate.length}
ALREADY CORRECT        : ${alreadyCorrect.length}
BLOCKED                : ${blocked.length}
DUPLICATE EXPECTED IDs : ${duplicateExpected.length}
`);

  console.log(
    'PRODUCT RESULTS:\n',
  );

  for (
    const result
    of results
  ) {
    if (
      result.status ===
      'BLOCKED'
    ) {
      console.log(
        `[BLOCKED] ${result.product.handle}\n` +
          `  reason   : ${result.reason}\n` +
          `  filename : ${
            result.filename ??
            '(none)'
          }\n` +
          `  current  : ${
            result
              .currentMasterAssetId ??
            '(empty)'
          }\n`,
      );

      continue;
    }

    console.log(
      `[${result.status}] ${result.product.handle}\n` +
        `  image     : ${result.filename}\n` +
        `  current   : ${
          result
            .currentMasterAssetId ??
          '(empty)'
        }\n` +
        `  expected  : ${result.expectedMasterAssetId}\n`,
    );
  }

  if (
    duplicateExpected.length >
    0
  ) {
    console.log(
      'DUPLICATE EXPECTED MASTER ASSET IDS:\n',
    );

    for (
      const duplicate
      of duplicateExpected
    ) {
      console.log(
        `  ${duplicate.expectedMasterAssetId}\n` +
          `    ${duplicate.handles.join(
            '\n    ',
          )}\n`,
      );
    }
  }

  /**
   * LOCAL AUDIT JSON
   */
  const auditDir =
    path.resolve(
      'migration-audits',
    );

  fs.mkdirSync(
    auditDir,
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

  const auditPath =
    path.join(
      auditDir,
      `master-asset-id-preflight-${timestamp}.json`,
    );

  fs.writeFileSync(
    auditPath,

    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        mode:
          'READ_ONLY',

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        grantedScopes,

        collection:
          info,

        rule: {
          source:
            'first product image filename',

          sourceSuffix:
            '_WEB',

          targetSuffix:
            '_PRINT',

          targetMetafield:
            `${MASTER_ASSET_NAMESPACE}.${MASTER_ASSET_KEY}`,
        },

        summary: {
          total:
            results.length,

          validDerivations:
            results.length -
            blocked.length,

          needsUpdate:
            needsUpdate.length,

          alreadyCorrect:
            alreadyCorrect.length,

          blocked:
            blocked.length,

          duplicateExpectedIds:
            duplicateExpected.length,
        },

        duplicateExpected,

        products:
          results,
      },

      null,
      2,
    ),

    'utf8',
  );

  console.log(`
Audit JSON written locally:
${auditPath}

NO SHOPIFY DATA WAS CHANGED.
`);

  if (
    blocked.length > 0 ||
    duplicateExpected.length >
      0
  ) {
    console.log(`
PRECHECK NOT CLEAN.

DO NOT RUN A WRITE MIGRATION.
`);

    process.exitCode = 2;

    return;
  }

  console.log(`
PRECHECK CLEAN.

Do not run any write migration yet.
Review the derived IDs first.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nPRECHECK FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(`
NO SHOPIFY DATA WAS CHANGED.
`);

    process.exitCode = 1;
  },
);