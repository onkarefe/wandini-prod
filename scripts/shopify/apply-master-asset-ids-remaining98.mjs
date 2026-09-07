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

const EXPECTED_COLLECTION_TOTAL = 104;
const EXPECTED_VALID_TOTAL = 103;
const EXPECTED_REMAINING_TOTAL = 98;
const BLOCKED_HANDLE = '0-base';

const TEST5 = new Map([
  ['8-3', 'WND_WLP_TIE_KI00055_PRINT'],
  ['7-3', 'WND_WLP_TIE_KI00054_PRINT'],
  ['6-3', 'WND_WLP_TIE_KI00053_PRINT'],
  ['5-3', 'WND_WLP_TIE_KI00052_PRINT'],
  ['4-3', 'WND_WLP_TIE_KI00051_PRINT'],
]);

const MASTER_ASSET_DIR =
  process.env.WANDINI_MASTER_ASSET_DIR ||
  path.join(
    process.env.USERPROFILE || '',
    'Desktop',
    '__Upload',
  );

if (
  !SHOP ||
  !CLIENT_ID ||
  !CLIENT_SECRET
) {
  throw new Error(
    'Missing PUBLIC_STORE_DOMAIN / SHOPIFY_MIGRATION_CLIENT_ID / SHOPIFY_MIGRATION_CLIENT_SECRET.',
  );
}

if (
  !SHOP.endsWith(
    '.myshopify.com',
  )
) {
  throw new Error(
    `PUBLIC_STORE_DOMAIN must be *.myshopify.com. Received: ${SHOP}`,
  );
}

if (
  !MASTER_ASSET_DIR ||
  !fs.existsSync(
    MASTER_ASSET_DIR,
  )
) {
  throw new Error(
    `Master asset directory not found: ${MASTER_ASSET_DIR}`,
  );
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms,
      ),
  );

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

async function getAdminAccessToken() {
  if (
    accessToken &&
    Date.now() <
      accessTokenExpiresAt -
        60_000
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
          new URLSearchParams(
            {
              grant_type:
                'client_credentials',

              client_id:
                CLIENT_ID,

              client_secret:
                CLIENT_SECRET,
            },
          ),
      },
    );

  const rawBody =
    await response.text();

  let body = null;

  try {
    body =
      rawBody
        ? JSON.parse(
            rawBody,
          )
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
      ].join('\n'),
    );
  }

  accessToken =
    body.access_token;

  accessTokenExpiresAt =
    Date.now() +
    Number(
      body.expires_in ||
        0,
    ) *
      1000;

  grantedScopes =
    String(
      body.scope || '',
    )
      .split(',')
      .map(
        (scope) =>
          scope.trim(),
      )
      .filter(Boolean);

  if (
    !grantedScopes.includes(
      'write_products',
    )
  ) {
    throw new Error(
      `write_products scope missing. Scopes: ${grantedScopes.join(
        ',',
      )}`,
    );
  }

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope ||
      'not returned'
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
    /\bmutation\b/i.test(
      query,
    );

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
    response.status ===
      429 &&
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

    await sleep(
      waitMs,
    );

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
    body =
      rawBody
        ? JSON.parse(
            rawBody,
          )
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
    info,
    products,
  };
}

async function getProduct(
  id,
) {
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
        String(
          imageUrl,
        ),
      );

    const raw =
      url.pathname
        .split('/')
        .pop();

    return raw
      ? decodeURIComponent(
          raw,
        )
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

function validateLocalMasterAssets(
  expectedIds,
) {
  const files =
    fs
      .readdirSync(
        MASTER_ASSET_DIR,
        {
          withFileTypes:
            true,
        },
      )
      .filter(
        (entry) =>
          entry.isFile(),
      )
      .map(
        (entry) =>
          entry.name,
      );

  const baseNames =
    files.map(
      (name) =>
        path.parse(
          name,
        ).name,
    );

  const counts =
    new Map();

  for (
    const baseName
    of baseNames
  ) {
    counts.set(
      baseName,
      (counts.get(
        baseName,
      ) || 0) + 1,
    );
  }

  const duplicates =
    [
      ...counts.entries(),
    ]
      .filter(
        ([, count]) =>
          count > 1,
      )
      .map(
        ([
          baseName,
          count,
        ]) => ({
          baseName,
          count,
        }),
      );

  const actual =
    new Set(
      baseNames,
    );

  const expected =
    new Set(
      expectedIds,
    );

  const missing =
    [...expected].filter(
      (id) =>
        !actual.has(id),
    );

  const extra =
    [...actual].filter(
      (id) =>
        !expected.has(id),
    );

  if (
    baseNames.length !==
      EXPECTED_VALID_TOTAL ||
    missing.length > 0 ||
    extra.length > 0 ||
    duplicates.length > 0
  ) {
    throw new Error(
      [
        'Local master asset set does not exactly match Shopify-derived IDs.',
        `Directory: ${MASTER_ASSET_DIR}`,
        `Files: ${baseNames.length} (expected ${EXPECTED_VALID_TOTAL})`,
        `Missing: ${JSON.stringify(missing)}`,
        `Extra: ${JSON.stringify(extra)}`,
        `Duplicates: ${JSON.stringify(duplicates)}`,
      ].join('\n'),
    );
  }

  return {
    files,
    baseNames,
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
      `Collection size changed. Expected ${EXPECTED_COLLECTION_TOTAL}, found ${stubs.length}.`,
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
    EXPECTED_VALID_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_VALID_TOTAL} valid products, found ${valid.length}.`,
    );
  }

  if (
    blocked.length !== 1 ||
    blocked[0].handle !==
      BLOCKED_HANDLE ||
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

  const blockedBefore =
    structuredClone(
      blocked[0],
    );

  const expectedIds =
    valid.map(
      (item) =>
        item
          .derived
          .expected,
    );

  const uniqueExpectedIds =
    new Set(
      expectedIds,
    );

  if (
    uniqueExpectedIds.size !==
    EXPECTED_VALID_TOTAL
  ) {
    throw new Error(
      `Derived master asset IDs are not unique. Expected ${EXPECTED_VALID_TOTAL}, got ${uniqueExpectedIds.size}.`,
    );
  }

  validateLocalMasterAssets(
    expectedIds,
  );

  for (
    const item
    of valid
  ) {
    if (!item.metafield) {
      throw new Error(
        `Missing ${MASTER_ASSET_NAMESPACE}.${MASTER_ASSET_KEY} on ${item.handle}.`,
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
        MASTER_ASSET_KEY ||
      !item
        .metafield
        .id ||
      !item
        .metafield
        .type
    ) {
      throw new Error(
        `Invalid metafield identity/id/type on ${item.handle}.`,
      );
    }
  }

  const types =
    new Set(
      valid.map(
        (item) =>
          item
            .metafield
            .type,
      ),
    );

  if (
    types.size !== 1
  ) {
    throw new Error(
      `Master asset metafield types differ: ${[
        ...types,
      ].join(', ')}`,
    );
  }

  for (
    const [
      handle,
      expected,
    ]
    of TEST5.entries()
  ) {
    const item =
      valid.find(
        (candidate) =>
          candidate.handle ===
          handle,
      );

    if (!item) {
      throw new Error(
        `Previously migrated TEST-5 product missing: ${handle}`,
      );
    }

    if (
      item
        .derived
        .expected !==
      expected
    ) {
      throw new Error(
        `TEST-5 derived ID changed for ${handle}. Expected ${expected}, got ${item.derived.expected}.`,
      );
    }

    if (
      item
        .metafield
        .value !==
      expected
    ) {
      throw new Error(
        `TEST-5 product ${handle} is no longer correct. Expected ${expected}, got ${item.metafield.value}.`,
      );
    }
  }

  const remaining =
    valid.filter(
      (item) =>
        !TEST5.has(
          item.handle,
        ),
    );

  if (
    remaining.length !==
    EXPECTED_REMAINING_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_REMAINING_TOTAL} remaining products, found ${remaining.length}.`,
    );
  }

  for (
    const item
    of remaining
  ) {
    if (
      item
        .metafield
        .value !==
      EXPECTED_PLACEHOLDER
    ) {
      throw new Error(
        `Remaining product ${item.handle} is not placeholder '${EXPECTED_PLACEHOLDER}'. Found: ${item.metafield.value}`,
      );
    }
  }

  return {
    info,
    inspected,
    valid,
    remaining,
    blockedBefore,
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

function chunk(
  items,
  size,
) {
  const chunks = [];

  for (
    let i = 0;
    i < items.length;
    i += size
  ) {
    chunks.push(
      items.slice(
        i,
        i + size,
      ),
    );
  }

  return chunks;
}

async function verifyBatch(
  batch,
) {
  for (
    const before
    of batch
  ) {
    const fresh =
      inspectProduct(
        await getProduct(
          before.productId,
        ),
      );

    if (
      fresh.handle !==
      before.handle
    ) {
      throw new Error(
        `Post-write handle mismatch for ${before.handle}.`,
      );
    }

    if (
      !fresh.derived.ok ||
      fresh
        .derived
        .expected !==
        before
          .derived
          .expected
    ) {
      throw new Error(
        `Post-write image derivation mismatch for ${before.handle}.`,
      );
    }

    if (
      !fresh.metafield
    ) {
      throw new Error(
        `Post-write metafield missing for ${before.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .id !==
      before
        .metafield
        .id
    ) {
      throw new Error(
        `Metafield ID changed for ${before.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .type !==
      before
        .metafield
        .type
    ) {
      throw new Error(
        `Metafield type changed for ${before.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .value !==
      before
        .derived
        .expected
    ) {
      throw new Error(
        `Verification failed for ${before.handle}. Expected ${before.derived.expected}, got ${fresh.metafield.value}.`,
      );
    }
  }
}

async function main() {
  console.log(`
WANDINI
Master Asset ID REMAINING-98 migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}
Target metafield: ${MASTER_ASSET_NAMESPACE}.${MASTER_ASSET_KEY}
Local master assets: ${MASTER_ASSET_DIR}

THIS SCRIPT CAN WRITE TO SHOPIFY.

Hard locks:
- collection total = 104
- valid image-derived products = 103
- TEST-5 already correct = 5
- remaining placeholders = 98
- 0-base excluded
- local master files must exactly match all 103 derived IDs
`);

  const {
    info,
    inspected,
    valid,
    remaining,
    blockedBefore,
  } =
    await fullPreflight();

  const backupPath =
    writeJson(
      'master-asset-id-remaining98-before',
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

        masterAssetDir:
          MASTER_ASSET_DIR,

        summary: {
          collectionTotal:
            inspected.length,

          validTotal:
            valid.length,

          alreadyCorrectTest5:
            TEST5.size,

          remainingToWrite:
            remaining.length,

          blockedHandle:
            blockedBefore.handle,
        },

        products:
          inspected,
      },
    );

  console.log(`
PRECHECK CLEAN.

103/103 Shopify-derived master asset IDs exist exactly in the local master folder.
5 TEST products are still correct.
98 remaining products are still exactly '${EXPECTED_PLACEHOLDER}'.
0-base remains excluded.

Backup written:
${backupPath}

Exactly 98 values will change.
No variants, prices, SKUs, images, titles, handles, or other metafields are written.
`);

  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE REMAINING 98 MASTER ASSET IDS to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE REMAINING 98 MASTER ASSET IDS'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  const batches =
    chunk(
      remaining,
      25,
    );

  for (
    let i = 0;
    i < batches.length;
    i += 1
  ) {
    const batch =
      batches[i];

    console.log(
      `\nWriting batch ${i + 1}/${batches.length} (${batch.length} products)...`,
    );

    const metafields =
      batch.map(
        (item) => ({
          ownerId:
            item.productId,

          namespace:
            MASTER_ASSET_NAMESPACE,

          key:
            MASTER_ASSET_KEY,

          type:
            item
              .metafield
              .type,

          value:
            item
              .derived
              .expected,
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
        `Batch ${i + 1}: metafieldsSet returned no payload.`,
      );
    }

    if (
      result
        .userErrors
        ?.length
    ) {
      throw new Error(
        `Batch ${i + 1}: metafieldsSet userErrors:\n${JSON.stringify(
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
      batch.length
    ) {
      throw new Error(
        `Batch ${i + 1}: returned ${
          result
            .metafields
            ?.length ?? 0
        } metafields; expected ${batch.length}.`,
      );
    }

    await sleep(300);

    await verifyBatch(
      batch,
    );

    console.log(
      `Batch ${i + 1}/${batches.length} verified.`,
    );
  }

  console.log(
    '\nRunning final full verification...',
  );

  const {
    products:
      finalStubs,
  } =
    await getCollectionProducts();

  const finalInspected =
    [];

  for (
    let i = 0;
    i < finalStubs.length;
    i += 1
  ) {
    const fresh =
      inspectProduct(
        await getProduct(
          finalStubs[i].id,
        ),
      );

    finalInspected.push(
      fresh,
    );

    process.stdout.write(
      `\rFinal verify ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${finalStubs.length}`,
    );

    await sleep(75);
  }

  process.stdout.write(
    '\n',
  );

  if (
    finalInspected.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      'Final collection total changed unexpectedly.',
    );
  }

  const finalBlocked =
    finalInspected.filter(
      (item) =>
        !item.derived.ok,
    );

  if (
    finalBlocked.length !==
      1 ||
    finalBlocked[0]
      .handle !==
      BLOCKED_HANDLE ||
    finalBlocked[0]
      .derived
      .reason !==
      'FIRST_IMAGE_FILENAME_MISSING'
  ) {
    throw new Error(
      'Final blocked-product invariant failed.',
    );
  }

  if (
    finalBlocked[0]
      .metafield?.id !==
      blockedBefore
        .metafield?.id ||
    finalBlocked[0]
      .metafield?.type !==
      blockedBefore
        .metafield?.type ||
    finalBlocked[0]
      .metafield?.value !==
      blockedBefore
        .metafield?.value
  ) {
    throw new Error(
      '0-base metafield changed unexpectedly.',
    );
  }

  const beforeByHandle =
    new Map(
      valid.map(
        (item) => [
          item.handle,
          item,
        ],
      ),
    );

  const finalValid =
    finalInspected.filter(
      (item) =>
        item.derived.ok,
    );

  if (
    finalValid.length !==
    EXPECTED_VALID_TOTAL
  ) {
    throw new Error(
      `Final valid count mismatch: ${finalValid.length}.`,
    );
  }

  for (
    const fresh
    of finalValid
  ) {
    const before =
      beforeByHandle.get(
        fresh.handle,
      );

    if (!before) {
      throw new Error(
        `Unexpected final valid product: ${fresh.handle}`,
      );
    }

    if (
      !fresh.metafield
    ) {
      throw new Error(
        `Final metafield missing for ${fresh.handle}.`,
      );
    }

    if (
      fresh
        .derived
        .expected !==
      before
        .derived
        .expected
    ) {
      throw new Error(
        `Final derived ID changed for ${fresh.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .value !==
      fresh
        .derived
        .expected
    ) {
      throw new Error(
        `Final value mismatch for ${fresh.handle}: ${fresh.metafield.value}`,
      );
    }

    if (
      fresh
        .metafield
        .id !==
      before
        .metafield
        .id
    ) {
      throw new Error(
        `Final metafield ID changed for ${fresh.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .type !==
      before
        .metafield
        .type
    ) {
      throw new Error(
        `Final metafield type changed for ${fresh.handle}.`,
      );
    }
  }

  validateLocalMasterAssets(
    finalValid.map(
      (item) =>
        item
          .derived
          .expected,
    ),
  );

  const afterPath =
    writeJson(
      'master-asset-id-remaining98-after',
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

        summary: {
          collectionTotal:
            finalInspected.length,

          correctMasterAssetIds:
            finalValid.length,

          migratedThisRun:
            remaining.length,

          untouchedBlockedHandle:
            BLOCKED_HANDLE,
        },

        products:
          finalInspected,
      },
    );

  console.log(`
FINAL MASTER ASSET MIGRATION COMPLETE.

Migrated this run : 98
Previously correct: 5
Correct total     : 103
Untouched         : 0-base
Local exact match : 103/103

Metafield IDs unchanged.
Metafield types unchanged.
All 103 Shopify values re-read and verified against their first-image-derived IDs.
0-base verified untouched.

After snapshot:
${afterPath}
`);
}

main().catch(
  (error) => {
    console.error(
      '\nREMAINING-98 MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(`
IMPORTANT:
If failure happened after a batch was written,
DO NOT blindly rerun.
Run the read-only audit first and inspect current state.
`);

    process.exitCode = 1;
  },
);