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

const EXPECTED_COLLECTION_TOTAL = 104;

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

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms),
  );

/*
 * Deterministic Wandini SEO handle algorithm.
 *
 * German SEO transliteration:
 *
 * ä -> ae
 * ö -> oe
 * ü -> ue
 * ß -> ss
 *
 * Other common Latin characters are reduced
 * to ASCII where possible.
 *
 * & becomes German "und".
 *
 * The result contains only:
 * a-z
 * 0-9
 * -
 */
function generateSeoHandle(title) {
  let value =
    String(title || '').trim();

  /*
   * German-specific conversions MUST happen
   * before Unicode normalization.
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
   * A few characters that don't reliably
   * reduce the way we want with NFKD.
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
   * & has semantic meaning.
   */
  value =
    value.replace(
      /&/g,
      ' und ',
    );

  /*
   * Remove accents / combining marks.
   *
   * Examples:
   * é -> e
   * á -> a
   * ç -> c
   * ñ -> n
   */
  value =
    value
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '');

  /*
   * Apostrophes should disappear rather than
   * create an unnecessary separator.
   */
  value =
    value.replace(
      /['’‘`´]/g,
      '',
    );

  /*
   * Lowercase.
   */
  value =
    value.toLowerCase();

  /*
   * Everything remaining outside a-z / 0-9
   * becomes a hyphen.
   */
  value =
    value.replace(
      /[^a-z0-9]+/g,
      '-',
    );

  /*
   * Collapse and trim hyphens.
   */
  value =
    value
      .replace(/-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');

  return value;
}

function hasGermanSpecialCharacters(
  value,
) {
  return /[äöüÄÖÜßẞ]/.test(
    String(value || ''),
  );
}

function looksSuspiciousCurrentHandle(
  handle,
) {
  const value =
    String(handle || '');

  return (
    /^\d+(?:-\d+)?$/.test(value) ||
    /(?:^|-)base(?:-|$)/i.test(value) ||
    /kopie/i.test(value)
  );
}

function csvEscape(value) {
  const string =
    value === null ||
    value === undefined
      ? ''
      : String(value);

  return `"${string.replace(
    /"/g,
    '""',
  )}"`;
}

function writeJson(
  prefix,
  payload,
) {
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

function writeCsv(
  prefix,
  rows,
) {
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

  const filePath =
    path.join(
      dir,
      `${prefix}-${timestamp}.csv`,
    );

  const headers = [
    'product_id',
    'title',
    'current_handle',
    'target_handle',
    'status',
    'needs_change',
    'suspicious_current_handle',
    'german_special_chars',
    'en_global_handle',
    'en_global_handle_outdated',
    'market_specific_en_handles',
    'target_collision_collection',
    'target_collision_store',
  ];

  const lines = [
    headers
      .map(csvEscape)
      .join(','),
  ];

  for (
    const row
    of rows
  ) {
    lines.push(
      [
        row.productId,
        row.title,
        row.currentHandle,
        row.targetHandle,
        row.status,
        row.needsChange,
        row.suspiciousCurrentHandle,
        row.germanSpecialCharacters,
        row.enGlobalHandle || '',
        row.enGlobalHandleOutdated ?? '',
        row.marketSpecificEnHandles
          .map(
            (item) =>
              `${item.marketName || item.marketId}:${item.value}`,
          )
          .join(' | '),
        row.targetCollisionCollection,
        row.targetCollisionStore,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  fs.writeFileSync(
    filePath,
    lines.join('\n'),
    'utf8',
  );

  return filePath;
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
    String(
      body.scope || '',
    )
      .split(',')
      .map(
        (scope) =>
          scope.trim(),
      )
      .filter(Boolean);

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope || 'not returned'
    }`,
  );

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

/*
 * HARD READ-ONLY GUARD.
 *
 * This file cannot execute GraphQL mutations.
 */
async function gql(
  query,
  variables = {},
  attempt = 1,
) {
  if (
    /\bmutation\b/i.test(query)
  ) {
    throw new Error(
      'READ-ONLY GUARD: GraphQL mutation blocked.',
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
      attempt + 1,
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

const COLLECTION_PRODUCTS_QUERY = `#graphql
  query FototapetenHandleAudit(
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

const ALL_STORE_PRODUCTS_QUERY = `#graphql
  query AllStoreProductHandles(
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

const TRANSLATABLE_PRODUCT_QUERY = `#graphql
  query ProductHandleTranslations(
    $resourceId: ID!
    $locale: String!
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
        locale: $locale
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

async function getCollectionProducts() {
  const products = [];

  let after = null;
  let collectionInfo = null;

  do {
    const data =
      await gql(
        COLLECTION_PRODUCTS_QUERY,
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
        ALL_STORE_PRODUCTS_QUERY,
        {
          after,
        },
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

async function getProductTranslationState(
  product,
) {
  const data =
    await gql(
      TRANSLATABLE_PRODUCT_QUERY,
      {
        resourceId:
          product.id,

        locale:
          TARGET_LOCALE,
      },
    );

  const resource =
    data?.translatableResource;

  if (!resource) {
    throw new Error(
      `Translatable PRODUCT resource missing: ${product.handle}`,
    );
  }

  if (
    resource.resourceId !==
    product.id
  ) {
    throw new Error(
      `Translatable resource ID mismatch: ${product.handle}`,
    );
  }

  const content =
    resource.translatableContent || [];

  const handleSources =
    content.filter(
      (item) =>
        item.key === 'handle',
    );

  const titleSources =
    content.filter(
      (item) =>
        item.key === 'title',
    );

  if (
    handleSources.length !== 1
  ) {
    throw new Error(
      `Expected exactly one handle source for ${product.handle}; found ${handleSources.length}.`,
    );
  }

  if (
    titleSources.length !== 1
  ) {
    throw new Error(
      `Expected exactly one title source for ${product.handle}; found ${titleSources.length}.`,
    );
  }

  const handleSource =
    handleSources[0];

  const titleSource =
    titleSources[0];

  const problems = [];

  if (
    handleSource.value !==
    product.handle
  ) {
    problems.push(
      `HANDLE_SOURCE_VALUE_MISMATCH`,
    );
  }

  if (
    titleSource.value !==
    product.title
  ) {
    problems.push(
      `TITLE_SOURCE_VALUE_MISMATCH`,
    );
  }

  if (
    !handleSource.digest
  ) {
    problems.push(
      `HANDLE_DIGEST_MISSING`,
    );
  }

  if (
    handleSource.locale !==
    SOURCE_LOCALE
  ) {
    problems.push(
      `HANDLE_SOURCE_LOCALE_${handleSource.locale}`,
    );
  }

  if (
    titleSource.locale !==
    SOURCE_LOCALE
  ) {
    problems.push(
      `TITLE_SOURCE_LOCALE_${titleSource.locale}`,
    );
  }

  const translations =
    resource.translations || [];

  const handleTranslations =
    translations.filter(
      (translation) =>
        translation.key ===
        'handle',
    );

  const globalHandleTranslations =
    handleTranslations.filter(
      (translation) =>
        !translation.market,
    );

  const marketSpecificHandleTranslations =
    handleTranslations.filter(
      (translation) =>
        Boolean(
          translation.market,
        ),
    );

  if (
    globalHandleTranslations.length >
    1
  ) {
    problems.push(
      `MULTIPLE_GLOBAL_EN_HANDLES`,
    );
  }

  return {
    handleSource,
    titleSource,
    translations,
    globalHandleTranslations,
    marketSpecificHandleTranslations,
    problems,
  };
}

async function main() {
  console.log(`
WANDINI
Fototapeten Product Handle SEO Audit

MODE: READ ONLY

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Source locale:
${SOURCE_LOCALE}

English locale inspected:
${TARGET_LOCALE}

SLUG RULE:

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

NO SHOPIFY DATA WILL BE CHANGED.
`);

  /*
   * STEP 1
   * Read collection products.
   */
  const {
    collectionInfo,
    products,
  } =
    await getCollectionProducts();

  console.log(
    `Collection products found: ${products.length}`,
  );

  if (
    products.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_COLLECTION_TOTAL} Fototapeten products, found ${products.length}.`,
    );
  }

  /*
   * Basic identity sanity.
   */
  const collectionIds =
    new Set();

  const collectionHandles =
    new Set();

  for (
    const product
    of products
  ) {
    if (
      !product.id ||
      !product.title ||
      !product.handle
    ) {
      throw new Error(
        `Missing basic product identity: ${JSON.stringify(
          product,
        )}`,
      );
    }

    if (
      collectionIds.has(
        product.id,
      )
    ) {
      throw new Error(
        `Duplicate product ID inside collection: ${product.id}`,
      );
    }

    collectionIds.add(
      product.id,
    );

    if (
      collectionHandles.has(
        product.handle,
      )
    ) {
      throw new Error(
        `Duplicate CURRENT handle inside collection: ${product.handle}`,
      );
    }

    collectionHandles.add(
      product.handle,
    );
  }

  /*
   * STEP 2
   * Read ALL products in store.
   *
   * Collision checks must not be limited to
   * the Fototapeten collection.
   */
  const allStoreProducts =
    await getAllStoreProducts();

  console.log(
    `All store products found: ${allStoreProducts.length}`,
  );

  const storeHandleOwners =
    new Map();

  for (
    const product
    of allStoreProducts
  ) {
    const owners =
      storeHandleOwners.get(
        product.handle,
      ) || [];

    owners.push(product);

    storeHandleOwners.set(
      product.handle,
      owners,
    );
  }

  /*
   * STEP 3
   * Generate deterministic targets.
   */
  const baseRows =
    products.map(
      (product) => {
        const targetHandle =
          generateSeoHandle(
            product.title,
          );

        return {
          product,
          targetHandle,
        };
      },
    );

  const emptyTargets =
    baseRows.filter(
      ({targetHandle}) =>
        !targetHandle,
    );

  if (
    emptyTargets.length > 0
  ) {
    console.log(
      '\nEMPTY GENERATED HANDLES:\n',
    );

    for (
      const entry
      of emptyTargets
    ) {
      console.log(
        `${entry.product.handle} | ${entry.product.title}`,
      );
    }
  }

  /*
   * STEP 4
   * Find target duplicates inside Fototapeten.
   */
  const targetGroups =
    new Map();

  for (
    const entry
    of baseRows
  ) {
    const list =
      targetGroups.get(
        entry.targetHandle,
      ) || [];

    list.push(entry);

    targetGroups.set(
      entry.targetHandle,
      list,
    );
  }

  const collectionTargetCollisions =
    [...targetGroups.entries()]
      .filter(
        ([target, entries]) =>
          target &&
          entries.length > 1,
      )
      .map(
        ([target, entries]) => ({
          target,
          entries,
        }),
      );

  const collisionTargets =
    new Set(
      collectionTargetCollisions.map(
        (item) =>
          item.target,
      ),
    );

  /*
   * STEP 5
   * Inspect PRODUCT translation resources.
   *
   * This tells us whether /en currently has
   * its own translated product handle.
   */
  const translationStates =
    new Map();

  const translationProblems =
    [];

  for (
    let i = 0;
    i < products.length;
    i += 1
  ) {
    const product =
      products[i];

    process.stdout.write(
      `\rTranslations ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${products.length}`,
    );

    const state =
      await getProductTranslationState(
        product,
      );

    translationStates.set(
      product.id,
      state,
    );

    if (
      state.problems.length >
      0
    ) {
      translationProblems.push({
        product,
        problems:
          state.problems,
      });
    }

    await sleep(50);
  }

  process.stdout.write('\n');

  /*
   * STEP 6
   * Build final per-product audit.
   */
  const rows = [];

  for (
    const entry
    of baseRows
  ) {
    const {
      product,
      targetHandle,
    } = entry;

    const state =
      translationStates.get(
        product.id,
      );

    const globalEn =
      state
        .globalHandleTranslations[0] ||
      null;

    const marketSpecificEnHandles =
      state
        .marketSpecificHandleTranslations
        .map(
          (translation) => ({
            value:
              translation.value,

            outdated:
              translation.outdated,

            marketId:
              translation.market?.id,

            marketName:
              translation.market?.name,
          }),
        );

    /*
     * Store-wide collision:
     *
     * target may already be owned by THIS product,
     * which is fine.
     *
     * A different product owning it is a blocker.
     */
    const currentTargetOwners =
      storeHandleOwners.get(
        targetHandle,
      ) || [];

    const otherTargetOwners =
      currentTargetOwners.filter(
        (owner) =>
          owner.id !==
          product.id,
      );

    const targetCollisionStore =
      otherTargetOwners.length >
      0;

    const targetCollisionCollection =
      collisionTargets.has(
        targetHandle,
      );

    const needsChange =
      product.handle !==
      targetHandle;

    let status =
      needsChange
        ? 'NEEDS_CHANGE'
        : 'CORRECT';

    if (!targetHandle) {
      status =
        'BLOCKED_EMPTY_TARGET';
    } else if (
      targetCollisionCollection
    ) {
      status =
        'BLOCKED_COLLECTION_COLLISION';
    } else if (
      targetCollisionStore
    ) {
      status =
        'BLOCKED_STORE_COLLISION';
    } else if (
      state.problems.length >
      0
    ) {
      status =
        'BLOCKED_TRANSLATION_SOURCE_PROBLEM';
    } else if (
      marketSpecificEnHandles.length >
      0
    ) {
      status =
        'REVIEW_MARKET_SPECIFIC_EN_HANDLE';
    } else if (globalEn) {
      status =
        needsChange
          ? 'REVIEW_GLOBAL_EN_HANDLE_AND_BASE'
          : 'REVIEW_GLOBAL_EN_HANDLE';
    }

    rows.push({
      productId:
        product.id,

      title:
        product.title,

      status:
        product.status,

      currentHandle:
        product.handle,

      targetHandle,

      needsChange,

      suspiciousCurrentHandle:
        looksSuspiciousCurrentHandle(
          product.handle,
        ),

      germanSpecialCharacters:
        hasGermanSpecialCharacters(
          product.title,
        ),

      handleSource:
        state.handleSource,

      titleSource:
        state.titleSource,

      translationProblems:
        state.problems,

      enGlobalHandle:
        globalEn?.value ||
        null,

      enGlobalHandleOutdated:
        globalEn?.outdated ??
        null,

      marketSpecificEnHandles,

      targetCollisionCollection,

      targetCollisionStore,

      targetStoreOwners:
        otherTargetOwners.map(
          (owner) => ({
            id:
              owner.id,

            title:
              owner.title,

            handle:
              owner.handle,

            status:
              owner.status,
          }),
        ),

      status,
    });
  }

  /*
   * STEP 7
   * Classification.
   */
  const correct =
    rows.filter(
      (row) =>
        row.currentHandle ===
        row.targetHandle,
    );

  const needsChange =
    rows.filter(
      (row) =>
        row.currentHandle !==
        row.targetHandle,
    );

  const suspicious =
    rows.filter(
      (row) =>
        row.suspiciousCurrentHandle,
    );

  const germanSpecial =
    rows.filter(
      (row) =>
        row.germanSpecialCharacters,
    );

  const globalEnHandles =
    rows.filter(
      (row) =>
        Boolean(
          row.enGlobalHandle,
        ),
    );

  const marketSpecificEn =
    rows.filter(
      (row) =>
        row.marketSpecificEnHandles.length >
        0,
    );

  const storeCollisionRows =
    rows.filter(
      (row) =>
        row.targetCollisionStore,
    );

  const collectionCollisionRows =
    rows.filter(
      (row) =>
        row.targetCollisionCollection,
    );

  const blocked =
    rows.filter(
      (row) =>
        row.status.startsWith(
          'BLOCKED_',
        ),
    );

  /*
   * STEP 8
   * Summary.
   */
  console.log(`
================ HANDLE AUDIT RESULT ================

COLLECTION PRODUCTS             : ${products.length}
ALL STORE PRODUCTS              : ${allStoreProducts.length}

CURRENT HANDLE ALREADY CORRECT  : ${correct.length}
CURRENT HANDLE NEEDS CHANGE     : ${needsChange.length}

SUSPICIOUS CURRENT HANDLES      : ${suspicious.length}
TITLES WITH Ä/Ö/Ü/SS CHARACTERS : ${germanSpecial.length}

EMPTY GENERATED TARGETS         : ${emptyTargets.length}

TARGET COLLISION GROUPS
INSIDE COLLECTION               : ${collectionTargetCollisions.length}

PRODUCTS AFFECTED BY
COLLECTION COLLISION            : ${collectionCollisionRows.length}

TARGET COLLISION WITH
OTHER STORE PRODUCT             : ${storeCollisionRows.length}

GLOBAL EN HANDLE TRANSLATIONS   : ${globalEnHandles.length}
MARKET-SPECIFIC EN HANDLES      : ${marketSpecificEn.length}

TRANSLATION SOURCE PROBLEMS     : ${translationProblems.length}

BLOCKED PRODUCTS                : ${blocked.length}
`);

  /*
   * STEP 9
   * Print all products needing changes.
   */
  console.log(
    '\n================ PROPOSED HANDLE CHANGES ================\n',
  );

  for (
    const row
    of needsChange
  ) {
    console.log(
      `${row.status}`,
    );

    console.log(
      `TITLE   : ${row.title}`,
    );

    console.log(
      `CURRENT : ${row.currentHandle}`,
    );

    console.log(
      `TARGET  : ${row.targetHandle}`,
    );

    if (
      row.enGlobalHandle
    ) {
      console.log(
        `EN HANDLE: ${row.enGlobalHandle} | outdated=${row.enGlobalHandleOutdated}`,
      );
    }

    if (
      row.marketSpecificEnHandles.length >
      0
    ) {
      for (
        const item
        of row.marketSpecificEnHandles
      ) {
        console.log(
          `MARKET EN: ${item.marketName || item.marketId} | ${item.value} | outdated=${item.outdated}`,
        );
      }
    }

    if (
      row.targetStoreOwners.length >
      0
    ) {
      for (
        const owner
        of row.targetStoreOwners
      ) {
        console.log(
          `COLLISION OWNER: ${owner.title} | ${owner.handle} | ${owner.id}`,
        );
      }
    }

    console.log('');
  }

  /*
   * STEP 10
   * Show products already correct.
   */
  console.log(
    '\n================ ALREADY CORRECT ================\n',
  );

  for (
    const row
    of correct
  ) {
    console.log(
      `${row.currentHandle} | ${row.title}`,
    );
  }

  /*
   * German special-character examples.
   */
  if (
    germanSpecial.length >
    0
  ) {
    console.log(
      '\n================ GERMAN CHARACTER CONVERSIONS ================\n',
    );

    for (
      const row
      of germanSpecial
    ) {
      console.log(
        `${row.title}`,
      );

      console.log(
        `→ ${row.targetHandle}\n`,
      );
    }
  }

  /*
   * Collision details.
   */
  if (
    collectionTargetCollisions.length >
    0
  ) {
    console.log(
      '\n================ COLLECTION TARGET COLLISIONS ================\n',
    );

    for (
      const collision
      of collectionTargetCollisions
    ) {
      console.log(
        `TARGET: ${collision.target}`,
      );

      for (
        const entry
        of collision.entries
      ) {
        console.log(
          `  ${entry.product.handle} | ${entry.product.title}`,
        );
      }

      console.log('');
    }
  }

  if (
    storeCollisionRows.length >
    0
  ) {
    console.log(
      '\n================ STORE-WIDE TARGET COLLISIONS ================\n',
    );

    for (
      const row
      of storeCollisionRows
    ) {
      console.log(
        `REQUESTED TARGET: ${row.targetHandle}`,
      );

      console.log(
        `SOURCE PRODUCT  : ${row.currentHandle} | ${row.title}`,
      );

      for (
        const owner
        of row.targetStoreOwners
      ) {
        console.log(
          `CURRENT OWNER   : ${owner.handle} | ${owner.title} | ${owner.productId || owner.id}`,
        );
      }

      console.log('');
    }
  }

  /*
   * EN translated handles are particularly
   * important because they can affect /en/products/...
   */
  if (
    globalEnHandles.length >
    0 ||
    marketSpecificEn.length >
    0
  ) {
    console.log(
      '\n================ ENGLISH HANDLE TRANSLATIONS ================\n',
    );

    for (
      const row
      of rows.filter(
        (item) =>
          item.enGlobalHandle ||
          item.marketSpecificEnHandles.length >
            0,
      )
    ) {
      console.log(
        `${row.currentHandle} | ${row.title}`,
      );

      if (
        row.enGlobalHandle
      ) {
        console.log(
          `GLOBAL EN: ${row.enGlobalHandle} | outdated=${row.enGlobalHandleOutdated}`,
        );
      }

      for (
        const item
        of row.marketSpecificEnHandles
      ) {
        console.log(
          `MARKET EN: ${item.marketName || item.marketId} | ${item.value} | outdated=${item.outdated}`,
        );
      }

      console.log('');
    }
  }

  /*
   * STEP 11
   * Write LOCAL audit artifacts only.
   */
  const jsonPath =
    writeJson(
      'fototapeten-handle-audit',
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

        collection:
          collectionInfo,

        sourceLocale:
          SOURCE_LOCALE,

        targetLocale:
          TARGET_LOCALE,

        grantedScopes,

        slugAlgorithm: {
          german: {
            ä: 'ae',
            ö: 'oe',
            ü: 'ue',
            ß: 'ss',
          },

          ampersand:
            'und',

          otherLatinDiacritics:
            'ASCII',

          lowercase:
            true,

          separator:
            '-',
        },

        summary: {
          collectionProducts:
            products.length,

          allStoreProducts:
            allStoreProducts.length,

          alreadyCorrect:
            correct.length,

          needsChange:
            needsChange.length,

          suspiciousCurrentHandles:
            suspicious.length,

          germanSpecialCharacterTitles:
            germanSpecial.length,

          emptyTargets:
            emptyTargets.length,

          collectionTargetCollisionGroups:
            collectionTargetCollisions.length,

          collectionCollisionProducts:
            collectionCollisionRows.length,

          storeWideCollisionProducts:
            storeCollisionRows.length,

          globalEnHandleTranslations:
            globalEnHandles.length,

          marketSpecificEnHandleProducts:
            marketSpecificEn.length,

          translationSourceProblems:
            translationProblems.length,

          blockedProducts:
            blocked.length,
        },

        collectionTargetCollisions:
          collectionTargetCollisions.map(
            (collision) => ({
              target:
                collision.target,

              products:
                collision.entries.map(
                  (entry) => ({
                    id:
                      entry.product.id,

                    title:
                      entry.product.title,

                    currentHandle:
                      entry.product.handle,
                  }),
                ),
            }),
          ),

        products:
          rows,
      },
    );

  const csvPath =
    writeCsv(
      'fototapeten-handle-audit',
      rows,
    );

  console.log(`
Audit JSON:
${jsonPath}

Audit CSV:
${csvPath}

NO SHOPIFY DATA WAS CHANGED.
`);

  /*
   * Final classification.
   */
  if (
    blocked.length >
      0 ||
    collectionTargetCollisions.length >
      0 ||
    storeCollisionRows.length >
      0 ||
    translationProblems.length >
      0
  ) {
    console.log(`
AUDIT FOUND BLOCKERS.

DO NOT CHANGE PRODUCT HANDLES YET.
`);

    process.exitCode = 2;

    return;
  }

  if (
    globalEnHandles.length >
      0 ||
    marketSpecificEn.length >
      0
  ) {
    console.log(`
AUDIT STRUCTURE IS CLEAN,
BUT ENGLISH HANDLE TRANSLATIONS EXIST.

REVIEW THEM BEFORE ANY WRITE.
`);

    return;
  }

  console.log(`
HANDLE AUDIT STRUCTURALLY CLEAN.

No Shopify data was changed.

Next step:
review the proposed current -> target handle map
before deciding on any write migration.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nHANDLE AUDIT FAILED:\n',
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