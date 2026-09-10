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
const EXPECTED_STORE_TOTAL = 111;

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
 * WANDINI ENGLISH SEO HANDLE ALGORITHM
 *
 * This is intentionally different from
 * the German/base algorithm.
 *
 * English:
 * & -> and
 * accents -> ASCII
 * apostrophes -> removed
 * punctuation/separators -> -
 * lowercase
 * repeated hyphens collapsed
 */
function generateEnglishSeoHandle(title) {
  let value =
    String(title || '').trim();

  /*
   * Characters that Unicode normalization
   * does not always reduce as desired.
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
    .replace(/Þ/g, 'Th')
    .replace(/þ/g, 'th')
    .replace(/Ð/g, 'D')
    .replace(/ð/g, 'd')
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')
    .replace(/ı/g, 'i');

  /*
   * English semantic replacement.
   */
  value =
    value.replace(
      /&/g,
      ' and ',
    );

  /*
   * Strip accents / combining marks.
   *
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
   * Apostrophes disappear instead of
   * becoming separators.
   *
   * Children's -> childrens
   */
  value =
    value.replace(
      /['’‘`´]/g,
      '',
    );

  value =
    value.toLowerCase();

  /*
   * Everything outside ASCII letters/numbers
   * becomes a separator.
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
      `${prefix}-${stamp}.csv`,
    );

  const headers = [
    'product_id',
    'de_title',
    'base_handle',
    'en_title',
    'en_title_outdated',
    'current_en_handle',
    'current_en_handle_outdated',
    'target_en_handle',
    'status',
    'needs_en_handle_write',
    'collection_target_collision',
    'store_base_handle_collision',
    'store_en_handle_collision',
    'market_specific_en_title_count',
    'market_specific_en_handle_count',
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
        row.deTitle,
        row.baseHandle,
        row.enTitle || '',
        row.enTitleOutdated ?? '',
        row.currentEnHandle || '',
        row.currentEnHandleOutdated ?? '',
        row.targetEnHandle || '',
        row.status,
        row.needsEnHandleWrite,
        row.collectionTargetCollision,
        row.storeBaseHandleCollision,
        row.storeEnHandleCollision,
        row.marketSpecificEnTitles.length,
        row.marketSpecificEnHandles.length,
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
 * HARD READ-ONLY GraphQL wrapper.
 *
 * Even though the current app has write scopes,
 * this audit rejects every mutation.
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

const COLLECTION_QUERY = `#graphql
  query EnglishHandleCollection(
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

const ALL_PRODUCTS_QUERY = `#graphql
  query EnglishHandleAllProducts(
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
  query EnglishHandleTranslationAudit(
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

  const titleSources =
    content.filter(
      (item) =>
        item.key === 'title',
    );

  const handleSources =
    content.filter(
      (item) =>
        item.key === 'handle',
    );

  const problems = [];

  if (
    titleSources.length !== 1
  ) {
    problems.push(
      `TITLE_SOURCE_COUNT_${titleSources.length}`,
    );
  }

  if (
    handleSources.length !== 1
  ) {
    problems.push(
      `HANDLE_SOURCE_COUNT_${handleSources.length}`,
    );
  }

  const titleSource =
    titleSources.length === 1
      ? titleSources[0]
      : null;

  const handleSource =
    handleSources.length === 1
      ? handleSources[0]
      : null;

  if (
    titleSource &&
    titleSource.value !==
      product.title
  ) {
    problems.push(
      'TITLE_SOURCE_VALUE_MISMATCH',
    );
  }

  if (
    handleSource &&
    handleSource.value !==
      product.handle
  ) {
    problems.push(
      'HANDLE_SOURCE_VALUE_MISMATCH',
    );
  }

  if (
    titleSource &&
    titleSource.locale !==
      SOURCE_LOCALE
  ) {
    problems.push(
      `TITLE_SOURCE_LOCALE_${titleSource.locale}`,
    );
  }

  if (
    handleSource &&
    handleSource.locale !==
      SOURCE_LOCALE
  ) {
    problems.push(
      `HANDLE_SOURCE_LOCALE_${handleSource.locale}`,
    );
  }

  if (
    titleSource &&
    !titleSource.digest
  ) {
    problems.push(
      'TITLE_SOURCE_DIGEST_MISSING',
    );
  }

  if (
    handleSource &&
    !handleSource.digest
  ) {
    problems.push(
      'HANDLE_SOURCE_DIGEST_MISSING',
    );
  }

  const translations =
    resource.translations || [];

  const titleTranslations =
    translations.filter(
      (translation) =>
        translation.key ===
        'title',
    );

  const handleTranslations =
    translations.filter(
      (translation) =>
        translation.key ===
        'handle',
    );

  const globalTitleTranslations =
    titleTranslations.filter(
      (translation) =>
        !translation.market,
    );

  const marketSpecificTitleTranslations =
    titleTranslations.filter(
      (translation) =>
        Boolean(
          translation.market,
        ),
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
    globalTitleTranslations.length >
    1
  ) {
    problems.push(
      `MULTIPLE_GLOBAL_EN_TITLES_${globalTitleTranslations.length}`,
    );
  }

  if (
    globalHandleTranslations.length >
    1
  ) {
    problems.push(
      `MULTIPLE_GLOBAL_EN_HANDLES_${globalHandleTranslations.length}`,
    );
  }

  return {
    titleSource,
    handleSource,
    translations,

    globalTitleTranslations,
    marketSpecificTitleTranslations,

    globalHandleTranslations,
    marketSpecificHandleTranslations,

    problems,
  };
}

async function main() {
  console.log(`
WANDINI
Fototapeten English Handle SEO Audit

MODE: READ ONLY

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Source locale:
${SOURCE_LOCALE}

Target locale:
${TARGET_LOCALE}

TARGET RULE:

GLOBAL English product title
↓
deterministic English SEO handle

& -> and
apostrophes -> removed
Latin accents -> ASCII
lowercase
other separators -> -
duplicate hyphens collapsed

NO SHOPIFY DATA WILL BE CHANGED.
`);

  /*
   * STEP 1
   * Read collection and whole store.
   */
  const {
    collectionInfo,
    products:
      collectionProducts,
  } =
    await getCollectionProducts();

  const allStoreProducts =
    await getAllStoreProducts();

  console.log(
    `Collection products found: ${collectionProducts.length}`,
  );

  console.log(
    `All store products found: ${allStoreProducts.length}`,
  );

  if (
    collectionProducts.length !==
    EXPECTED_COLLECTION_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_COLLECTION_TOTAL} Fototapeten products, found ${collectionProducts.length}.`,
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
   * Make sure German/base migration really
   * left us with unique base handles.
   */
  const baseHandleOwners =
    new Map();

  for (
    const product
    of allStoreProducts
  ) {
    const owners =
      baseHandleOwners.get(
        product.handle,
      ) || [];

    owners.push(product);

    baseHandleOwners.set(
      product.handle,
      owners,
    );
  }

  const duplicateBaseHandles =
    [...baseHandleOwners.entries()]
      .filter(
        ([, owners]) =>
          owners.length > 1,
      );

  if (
    duplicateBaseHandles.length >
    0
  ) {
    throw new Error(
      `Unexpected duplicate base handles detected in store: ${duplicateBaseHandles.length}`,
    );
  }

  /*
   * STEP 2
   * Read EN translation state for ALL 111 products.
   *
   * Not just Fototapeten.
   *
   * This gives us store-wide translated-handle
   * collision visibility.
   */
  const translationStates =
    new Map();

  const translationSourceProblems =
    [];

  for (
    let i = 0;
    i < allStoreProducts.length;
    i += 1
  ) {
    const product =
      allStoreProducts[i];

    process.stdout.write(
      `\rTranslation scan ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${allStoreProducts.length}`,
    );

    const state =
      await getTranslationState(
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
      translationSourceProblems.push({
        product,
        problems:
          state.problems,
      });
    }

    await sleep(40);
  }

  process.stdout.write('\n');

  /*
   * STEP 3
   * Build store-wide EN handle ownership map.
   */
  const storeEnHandleOwners =
    new Map();

  const storeMarketSpecificEnHandles =
    [];

  for (
    const product
    of allStoreProducts
  ) {
    const state =
      translationStates.get(
        product.id,
      );

    for (
      const translation
      of state
        .globalHandleTranslations
    ) {
      const value =
        String(
          translation.value || '',
        ).trim();

      if (!value) {
        continue;
      }

      const owners =
        storeEnHandleOwners.get(
          value,
        ) || [];

      owners.push({
        product,
        translation,
        scope:
          'GLOBAL',
      });

      storeEnHandleOwners.set(
        value,
        owners,
      );
    }

    for (
      const translation
      of state
        .marketSpecificHandleTranslations
    ) {
      storeMarketSpecificEnHandles.push({
        product,
        translation,
      });

      const value =
        String(
          translation.value || '',
        ).trim();

      if (!value) {
        continue;
      }

      const owners =
        storeEnHandleOwners.get(
          value,
        ) || [];

      owners.push({
        product,
        translation,
        scope:
          `MARKET:${
            translation.market?.name ||
            translation.market?.id
          }`,
      });

      storeEnHandleOwners.set(
        value,
        owners,
      );
    }
  }

  /*
   * STEP 4
   * Build the 104 Fototapeten rows.
   */
  const rows = [];

  for (
    const product
    of collectionProducts
  ) {
    const state =
      translationStates.get(
        product.id,
      );

    if (!state) {
      throw new Error(
        `Translation state missing for collection product: ${product.handle}`,
      );
    }

    const globalEnTitle =
      state
        .globalTitleTranslations[0] ||
      null;

    const globalEnHandle =
      state
        .globalHandleTranslations[0] ||
      null;

    const enTitle =
      globalEnTitle?.value
        ? String(
            globalEnTitle.value,
          ).trim()
        : null;

    const currentEnHandle =
      globalEnHandle?.value
        ? String(
            globalEnHandle.value,
          ).trim()
        : null;

    const targetEnHandle =
      enTitle
        ? generateEnglishSeoHandle(
            enTitle,
          )
        : null;

    rows.push({
      productId:
        product.id,

      deTitle:
        product.title,

      baseHandle:
        product.handle,

      productStatus:
        product.status,

      translationSourceProblems:
        state.problems,

      enTitle,

      enTitleOutdated:
        globalEnTitle?.outdated ??
        null,

      currentEnHandle,

      currentEnHandleOutdated:
        globalEnHandle?.outdated ??
        null,

      targetEnHandle,

      marketSpecificEnTitles:
        state
          .marketSpecificTitleTranslations
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
          ),

      marketSpecificEnHandles:
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
          ),

      titleSource:
        state.titleSource,

      handleSource:
        state.handleSource,

      globalEnTitle,
      globalEnHandle,

      collectionTargetCollision:
        false,

      storeBaseHandleCollision:
        false,

      storeEnHandleCollision:
        false,

      collisionDetails:
        [],

      needsEnHandleWrite:
        false,

      status:
        'PENDING_CLASSIFICATION',
    });
  }

  /*
   * STEP 5
   * Detect duplicate generated English targets
   * inside the 104-product collection.
   */
  const targetGroups =
    new Map();

  for (
    const row
    of rows
  ) {
    if (!row.targetEnHandle) {
      continue;
    }

    const group =
      targetGroups.get(
        row.targetEnHandle,
      ) || [];

    group.push(row);

    targetGroups.set(
      row.targetEnHandle,
      group,
    );
  }

  const collectionTargetCollisions =
    [...targetGroups.entries()]
      .filter(
        ([, group]) =>
          group.length > 1,
      )
      .map(
        ([target, group]) => ({
          target,
          rows:
            group,
        }),
      );

  const collectionCollisionTargets =
    new Set(
      collectionTargetCollisions.map(
        (collision) =>
          collision.target,
      ),
    );

  /*
   * STEP 6
   * Store-wide collision checks.
   */
  for (
    const row
    of rows
  ) {
    if (!row.targetEnHandle) {
      continue;
    }

    row.collectionTargetCollision =
      collectionCollisionTargets.has(
        row.targetEnHandle,
      );

    /*
     * Conservative safety check:
     *
     * Does another product already use this
     * exact value as its BASE handle?
     */
    const baseOwners =
      (
        baseHandleOwners.get(
          row.targetEnHandle,
        ) || []
      ).filter(
        (owner) =>
          owner.id !==
          row.productId,
      );

    if (
      baseOwners.length > 0
    ) {
      row.storeBaseHandleCollision =
        true;

      row.collisionDetails.push({
        type:
          'BASE_HANDLE',

        owners:
          baseOwners.map(
            (owner) => ({
              id:
                owner.id,

              title:
                owner.title,

              handle:
                owner.handle,
            }),
          ),
      });
    }

    /*
     * Does another product already own this
     * value as an EN translated handle?
     */
    const enOwners =
      (
        storeEnHandleOwners.get(
          row.targetEnHandle,
        ) || []
      ).filter(
        (owner) =>
          owner.product.id !==
          row.productId,
      );

    if (
      enOwners.length > 0
    ) {
      row.storeEnHandleCollision =
        true;

      row.collisionDetails.push({
        type:
          'EN_TRANSLATED_HANDLE',

        owners:
          enOwners.map(
            (owner) => ({
              id:
                owner.product.id,

              title:
                owner.product.title,

              baseHandle:
                owner.product.handle,

              translatedHandle:
                owner.translation.value,

              scope:
                owner.scope,

              outdated:
                owner.translation.outdated,
            }),
          ),
      });
    }
  }

  /*
   * STEP 7
   * Classify every Fototapeten product.
   */
  for (
    const row
    of rows
  ) {
    if (
      row.translationSourceProblems.length >
      0
    ) {
      row.status =
        'BLOCKED_TRANSLATION_SOURCE_PROBLEM';

      continue;
    }

    if (!row.enTitle) {
      row.status =
        'BLOCKED_EN_TITLE_MISSING';

      continue;
    }

    if (
      row.enTitleOutdated === true
    ) {
      row.status =
        'BLOCKED_EN_TITLE_OUTDATED';

      continue;
    }

    if (!row.targetEnHandle) {
      row.status =
        'BLOCKED_EMPTY_TARGET';

      continue;
    }

    if (
      row.marketSpecificEnTitles.length >
      0
    ) {
      row.status =
        'REVIEW_MARKET_SPECIFIC_EN_TITLE';

      continue;
    }

    if (
      row.marketSpecificEnHandles.length >
      0
    ) {
      row.status =
        'REVIEW_MARKET_SPECIFIC_EN_HANDLE';

      continue;
    }

    if (
      row.collectionTargetCollision
    ) {
      row.status =
        'BLOCKED_COLLECTION_TARGET_COLLISION';

      continue;
    }

    if (
      row.storeBaseHandleCollision
    ) {
      row.status =
        'BLOCKED_STORE_BASE_HANDLE_COLLISION';

      continue;
    }

    if (
      row.storeEnHandleCollision
    ) {
      row.status =
        'BLOCKED_STORE_EN_HANDLE_COLLISION';

      continue;
    }

    /*
     * No EN handle exists yet.
     */
    if (!row.currentEnHandle) {
      row.status =
        'MISSING_EN_HANDLE';

      row.needsEnHandleWrite =
        true;

      continue;
    }

    /*
     * Existing EN handle equals exact target.
     */
    if (
      row.currentEnHandle ===
      row.targetEnHandle
    ) {
      if (
        row.currentEnHandleOutdated ===
        true
      ) {
        row.status =
          'EXACT_EN_HANDLE_BUT_OUTDATED';

        /*
         * Later write will need to re-register
         * the same handle with the current
         * translatable-content digest.
         */
        row.needsEnHandleWrite =
          true;
      } else {
        row.status =
          'EN_HANDLE_ALREADY_CORRECT';

        row.needsEnHandleWrite =
          false;
      }

      continue;
    }

    /*
     * Existing handle differs from generated
     * English-title-derived target.
     */
    row.status =
      'EN_HANDLE_NEEDS_UPDATE';

    row.needsEnHandleWrite =
      true;
  }

  /*
   * STEP 8
   * Summaries.
   */
  const enTitleFound =
    rows.filter(
      (row) =>
        Boolean(row.enTitle),
    );

  const enTitleMissing =
    rows.filter(
      (row) =>
        !row.enTitle,
    );

  const enTitleCurrent =
    rows.filter(
      (row) =>
        row.enTitle &&
        row.enTitleOutdated ===
          false,
    );

  const enTitleOutdated =
    rows.filter(
      (row) =>
        row.enTitle &&
        row.enTitleOutdated ===
          true,
    );

  const globalEnHandleFound =
    rows.filter(
      (row) =>
        Boolean(
          row.currentEnHandle,
        ),
    );

  const globalEnHandleMissing =
    rows.filter(
      (row) =>
        !row.currentEnHandle,
    );

  const exactCurrentHandle =
    rows.filter(
      (row) =>
        row.currentEnHandle &&
        row.targetEnHandle &&
        row.currentEnHandle ===
          row.targetEnHandle,
    );

  const exactButOutdated =
    rows.filter(
      (row) =>
        row.status ===
        'EXACT_EN_HANDLE_BUT_OUTDATED',
    );

  const alreadyCorrect =
    rows.filter(
      (row) =>
        row.status ===
        'EN_HANDLE_ALREADY_CORRECT',
    );

  const missingHandle =
    rows.filter(
      (row) =>
        row.status ===
        'MISSING_EN_HANDLE',
    );

  const needsUpdate =
    rows.filter(
      (row) =>
        row.status ===
        'EN_HANDLE_NEEDS_UPDATE',
    );

  const needsWrite =
    rows.filter(
      (row) =>
        row.needsEnHandleWrite,
    );

  const blocked =
    rows.filter(
      (row) =>
        row.status.startsWith(
          'BLOCKED_',
        ),
    );

  const review =
    rows.filter(
      (row) =>
        row.status.startsWith(
          'REVIEW_',
        ),
    );

  const marketSpecificTitleProducts =
    rows.filter(
      (row) =>
        row.marketSpecificEnTitles.length >
        0,
    );

  const marketSpecificHandleProducts =
    rows.filter(
      (row) =>
        row.marketSpecificEnHandles.length >
        0,
    );

  const collectionCollisionRows =
    rows.filter(
      (row) =>
        row.collectionTargetCollision,
    );

  const baseCollisionRows =
    rows.filter(
      (row) =>
        row.storeBaseHandleCollision,
    );

  const enCollisionRows =
    rows.filter(
      (row) =>
        row.storeEnHandleCollision,
    );

  console.log(`
================ EN HANDLE AUDIT RESULT ================

COLLECTION PRODUCTS             : ${collectionProducts.length}
ALL STORE PRODUCTS              : ${allStoreProducts.length}

GLOBAL EN TITLE FOUND           : ${enTitleFound.length}
GLOBAL EN TITLE MISSING         : ${enTitleMissing.length}

GLOBAL EN TITLE CURRENT         : ${enTitleCurrent.length}
GLOBAL EN TITLE OUTDATED        : ${enTitleOutdated.length}

GLOBAL EN HANDLE FOUND          : ${globalEnHandleFound.length}
GLOBAL EN HANDLE MISSING        : ${globalEnHandleMissing.length}

CURRENT EN HANDLE = TARGET      : ${exactCurrentHandle.length}
EXACT BUT OUTDATED              : ${exactButOutdated.length}
ALREADY CORRECT                 : ${alreadyCorrect.length}

MISSING EN HANDLE / CREATE      : ${missingHandle.length}
EN HANDLE NEEDS UPDATE          : ${needsUpdate.length}

TOTAL EN HANDLE WRITES NEEDED   : ${needsWrite.length}

MARKET-SPECIFIC EN TITLES       : ${marketSpecificTitleProducts.length}
MARKET-SPECIFIC EN HANDLES      : ${marketSpecificHandleProducts.length}

EMPTY GENERATED TARGETS         : ${
    rows.filter(
      (row) =>
        row.enTitle &&
        !row.targetEnHandle,
    ).length
  }

COLLECTION TARGET COLLISIONS    : ${collectionTargetCollisions.length}
PRODUCTS IN COLLECTION COLLISION: ${collectionCollisionRows.length}

STORE BASE-HANDLE COLLISIONS    : ${baseCollisionRows.length}
STORE EN-HANDLE COLLISIONS      : ${enCollisionRows.length}

TRANSLATION SOURCE PROBLEMS     : ${
    rows.filter(
      (row) =>
        row.translationSourceProblems.length >
        0,
    ).length
  }

BLOCKED PRODUCTS                : ${blocked.length}
REVIEW PRODUCTS                 : ${review.length}
`);

  /*
   * STEP 9
   * Print exact proposed mapping.
   */
  console.log(
    '\n================ PROPOSED ENGLISH URL MAP ================\n',
  );

  for (
    const row
    of rows
  ) {
    console.log(
      row.status,
    );

    console.log(
      `DE TITLE : ${row.deTitle}`,
    );

    console.log(
      `BASE     : ${row.baseHandle}`,
    );

    console.log(
      `EN TITLE : ${row.enTitle || '(missing)'}`,
    );

    console.log(
      `CURRENT  : ${row.currentEnHandle || '(missing)'}`,
    );

    console.log(
      `TARGET   : ${row.targetEnHandle || '(none)'}`,
    );

    if (
      row.enTitleOutdated !==
      null
    ) {
      console.log(
        `EN TITLE OUTDATED  : ${row.enTitleOutdated}`,
      );
    }

    if (
      row.currentEnHandleOutdated !==
      null
    ) {
      console.log(
        `EN HANDLE OUTDATED : ${row.currentEnHandleOutdated}`,
      );
    }

    if (
      row.marketSpecificEnTitles.length >
      0
    ) {
      for (
        const item
        of row.marketSpecificEnTitles
      ) {
        console.log(
          `MARKET EN TITLE: ${item.marketName || item.marketId} | ${item.value} | outdated=${item.outdated}`,
        );
      }
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
          `MARKET EN HANDLE: ${item.marketName || item.marketId} | ${item.value} | outdated=${item.outdated}`,
        );
      }
    }

    if (
      row.collisionDetails.length >
      0
    ) {
      console.log(
        `COLLISIONS: ${JSON.stringify(
          row.collisionDetails,
          null,
          2,
        )}`,
      );
    }

    console.log('');
  }

  /*
   * STEP 10
   * Print blockers separately for easy review.
   */
  if (
    blocked.length > 0
  ) {
    console.log(
      '\n================ BLOCKED PRODUCTS ================\n',
    );

    for (
      const row
      of blocked
    ) {
      console.log(
        `${row.status}`,
      );

      console.log(
        `${row.baseHandle}`,
      );

      console.log(
        `DE: ${row.deTitle}`,
      );

      console.log(
        `EN: ${row.enTitle || '(missing)'}`,
      );

      console.log(
        `TARGET: ${row.targetEnHandle || '(none)'}\n`,
      );
    }
  }

  if (
    review.length > 0
  ) {
    console.log(
      '\n================ REVIEW PRODUCTS ================\n',
    );

    for (
      const row
      of review
    ) {
      console.log(
        `${row.status}`,
      );

      console.log(
        `${row.baseHandle}`,
      );

      console.log(
        `DE: ${row.deTitle}`,
      );

      console.log(
        `EN: ${row.enTitle || '(missing)'}`,
      );

      console.log(
        `TARGET: ${row.targetEnHandle || '(none)'}\n`,
      );
    }
  }

  if (
    collectionTargetCollisions.length >
    0
  ) {
    console.log(
      '\n================ COLLECTION EN TARGET COLLISIONS ================\n',
    );

    for (
      const collision
      of collectionTargetCollisions
    ) {
      console.log(
        `TARGET: ${collision.target}`,
      );

      for (
        const row
        of collision.rows
      ) {
        console.log(
          `  ${row.baseHandle} | ${row.enTitle}`,
        );
      }

      console.log('');
    }
  }

  /*
   * STEP 11
   * Print current store-wide EN translated handles.
   *
   * Useful because we currently expect very few.
   */
  console.log(
    '\n================ EXISTING STORE EN HANDLES ================\n',
  );

  let existingStoreEnHandleCount =
    0;

  for (
    const product
    of allStoreProducts
  ) {
    const state =
      translationStates.get(
        product.id,
      );

    for (
      const translation
      of state
        .globalHandleTranslations
    ) {
      existingStoreEnHandleCount +=
        1;

      console.log(
        `${product.title}`,
      );

      console.log(
        `BASE : ${product.handle}`,
      );

      console.log(
        `EN   : ${translation.value}`,
      );

      console.log(
        `outdated=${translation.outdated}\n`,
      );
    }

    for (
      const translation
      of state
        .marketSpecificHandleTranslations
    ) {
      existingStoreEnHandleCount +=
        1;

      console.log(
        `${product.title}`,
      );

      console.log(
        `BASE   : ${product.handle}`,
      );

      console.log(
        `MARKET : ${translation.market?.name || translation.market?.id}`,
      );

      console.log(
        `EN     : ${translation.value}`,
      );

      console.log(
        `outdated=${translation.outdated}\n`,
      );
    }
  }

  if (
    existingStoreEnHandleCount ===
    0
  ) {
    console.log(
      '(none)\n',
    );
  }

  /*
   * STEP 12
   * Local audit artifacts only.
   */
  const jsonPath =
    writeJson(
      'fototapeten-en-handle-audit',
      {
        generatedAt:
          new Date().toISOString(),

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

        algorithm: {
          source:
            'GLOBAL English product title',

          ampersand:
            'and',

          apostrophes:
            'removed',

          latinDiacritics:
            'ASCII',

          lowercase:
            true,

          separator:
            '-',

          collapseSeparators:
            true,
        },

        summary: {
          collectionProducts:
            collectionProducts.length,

          allStoreProducts:
            allStoreProducts.length,

          globalEnTitleFound:
            enTitleFound.length,

          globalEnTitleMissing:
            enTitleMissing.length,

          globalEnTitleCurrent:
            enTitleCurrent.length,

          globalEnTitleOutdated:
            enTitleOutdated.length,

          globalEnHandleFound:
            globalEnHandleFound.length,

          globalEnHandleMissing:
            globalEnHandleMissing.length,

          currentEnHandleEqualsTarget:
            exactCurrentHandle.length,

          exactButOutdated:
            exactButOutdated.length,

          alreadyCorrect:
            alreadyCorrect.length,

          missingEnHandle:
            missingHandle.length,

          enHandleNeedsUpdate:
            needsUpdate.length,

          totalWritesNeeded:
            needsWrite.length,

          marketSpecificEnTitles:
            marketSpecificTitleProducts.length,

          marketSpecificEnHandles:
            marketSpecificHandleProducts.length,

          collectionTargetCollisionGroups:
            collectionTargetCollisions.length,

          collectionCollisionProducts:
            collectionCollisionRows.length,

          storeBaseHandleCollisionProducts:
            baseCollisionRows.length,

          storeEnHandleCollisionProducts:
            enCollisionRows.length,

          translationSourceProblems:
            rows.filter(
              (row) =>
                row.translationSourceProblems.length >
                0,
            ).length,

          blockedProducts:
            blocked.length,

          reviewProducts:
            review.length,
        },

        collectionTargetCollisions:
          collectionTargetCollisions.map(
            (collision) => ({
              target:
                collision.target,

              products:
                collision.rows.map(
                  (row) => ({
                    productId:
                      row.productId,

                    baseHandle:
                      row.baseHandle,

                    deTitle:
                      row.deTitle,

                    enTitle:
                      row.enTitle,
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
      'fototapeten-en-handle-audit',
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
   * Final recommendation classification.
   */
  if (
    blocked.length >
      0 ||
    review.length >
      0
  ) {
    console.log(`
EN HANDLE AUDIT FOUND ITEMS THAT REQUIRE REVIEW.

DO NOT WRITE ENGLISH HANDLES YET.
`);

    process.exitCode = 2;

    return;
  }

  console.log(`
EN HANDLE AUDIT STRUCTURALLY CLEAN.

No Shopify data was changed.

The proposed English handles can now be reviewed
before any Translate & Adapt handle writes.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nEN HANDLE AUDIT FAILED:\n',
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