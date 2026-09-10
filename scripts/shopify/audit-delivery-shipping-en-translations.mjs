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

const DEFINITION_NAME = 'Delivery And Shipping';

const EXPECTED_TYPE = 'rich_text_field';

const SOURCE_LOCALE = 'de';
const TARGET_LOCALE = 'en';

const EXPECTED_TOTAL = 104;

/*
 * APPROVED GERMAN SOURCE
 *
 * Rich-text structure:
 * - intro paragraph
 * - bold Germany heading
 * - Germany body + bold delivery time
 * - bold Austria & Switzerland heading
 * - body + bold delivery time
 * - bold Other EU Countries heading
 * - final paragraph
 */
const EXPECTED_GERMAN_RICH_TEXT = {
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Jede Fototapete wird individuell nach deinen Wunschmaßen produziert und anschließend sorgfältig verpackt. Da jede Bestellung eine Maßanfertigung ist, beginnt die Produktion erst nach Bestelleingang.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Deutschland',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Der Versand innerhalb Deutschlands ist kostenfrei. Die Lieferzeit beträgt in der Regel ',
        },
        {
          type: 'text',
          value: '8–10 Arbeitstage',
          bold: true,
        },
        {
          type: 'text',
          value: '.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Österreich & Schweiz',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Der Versand nach Österreich und in die Schweiz ist ebenfalls kostenfrei. Die Lieferzeit beträgt ',
        },
        {
          type: 'text',
          value: '10–16 Arbeitstage',
          bold: true,
        },
        {
          type: 'text',
          value: '.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Weitere EU-Länder',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Ein Versand in weitere Länder der Europäischen Union ist grundsätzlich möglich. Bitte kontaktiere vor deiner Bestellung unseren Kundenservice, damit wir die Versandmöglichkeiten und Lieferzeiten für dein Zielland prüfen können.',
        },
      ],
    },
  ],
};

/*
 * APPROVED ENGLISH TARGET
 *
 * Not written by this audit.
 *
 * Included only so the audit can tell us whether
 * any existing EN translation already equals
 * our approved target.
 */
const TARGET_ENGLISH_RICH_TEXT = {
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Each wall mural is individually produced to your desired dimensions and then carefully packaged. Since every order is custom-made, production begins only after your order has been placed.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Germany',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Shipping within Germany is free of charge. The delivery time is usually ',
        },
        {
          type: 'text',
          value: '8–10 business days',
          bold: true,
        },
        {
          type: 'text',
          value: '.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Austria & Switzerland',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Shipping to Austria and Switzerland is also free of charge. The delivery time is ',
        },
        {
          type: 'text',
          value: '10–16 business days',
          bold: true,
        },
        {
          type: 'text',
          value: '.',
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Other EU Countries',
          bold: true,
        },
      ],
    },

    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Shipping to other countries within the European Union is generally possible. Please contact our customer service before placing your order so that we can check the available shipping options and delivery times for your destination country.',
        },
      ],
    },
  ],
};

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

async function getAdminAccessToken() {
  if (
    accessToken &&
    Date.now() <
      accessTokenExpiresAt - 60_000
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

  const raw = await response.text();

  let body;

  try {
    body = raw
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
      .map((scope) =>
        scope.trim(),
      )
      .filter(Boolean);

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope || 'not returned'
    }`,
  );

  const hasTranslationReadAccess =
    grantedScopes.includes(
      'read_translations',
    ) ||
    grantedScopes.includes(
      'write_translations',
    );

  if (!hasTranslationReadAccess) {
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
 * This audit cannot execute mutations even though
 * the access token currently has write scopes.
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
    body = raw
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

const DEFINITIONS_QUERY = `#graphql
  query DeliveryShippingDefinitions(
    $after: String
  ) {
    metafieldDefinitions(
      ownerType: PRODUCT
      first: 100
      after: $after
    ) {
      nodes {
        id
        name
        namespace
        key

        type {
          name
        }
      }

      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const COLLECTION_QUERY = `#graphql
  query DeliveryShippingProducts(
    $handle: String!
    $after: String
    $namespace: String!
    $key: String!
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
            namespace: $namespace
            key: $key
          ) {
            id
            namespace
            key
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

const TRANSLATABLE_RESOURCE_QUERY = `#graphql
  query DeliveryShippingTranslationAudit(
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

async function getProductMetafieldDefinitions() {
  const definitions = [];

  let after = null;

  do {
    const data =
      await gql(
        DEFINITIONS_QUERY,
        {
          after,
        },
      );

    const connection =
      data?.metafieldDefinitions;

    if (!connection) {
      throw new Error(
        'metafieldDefinitions returned no data.',
      );
    }

    definitions.push(
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

  return definitions;
}

async function getCollectionProducts(
  namespace,
  key,
) {
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

          namespace,
          key,
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

function stable(value) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return JSON.stringify(value);
  }

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map(stable)
      .join(',')}]`;
  }

  const keys =
    Object.keys(value)
      .sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stable(
          value[key],
        )}`,
    )
    .join(',')}}`;
}

function richTextEquals(
  actual,
  expected,
) {
  try {
    return (
      stable(
        JSON.parse(actual),
      ) ===
      stable(expected)
    );
  } catch {
    return false;
  }
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

async function main() {
  console.log(`
WANDINI
Delivery & Shipping English translation audit

MODE: READ ONLY

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Metafield definition name:
${DEFINITION_NAME}

Source locale:
${SOURCE_LOCALE}

Target locale:
${TARGET_LOCALE}

NO SHOPIFY DATA WILL BE CHANGED.
`);

  /*
   * STEP 1
   * Discover the actual metafield definition.
   *
   * We intentionally do NOT guess:
   * custom.delivery_and_shipping
   * or any other namespace/key.
   */
  const definitions =
    await getProductMetafieldDefinitions();

  const matchingDefinitions =
    definitions.filter(
      (definition) =>
        definition
          .name
          .trim()
          .toLowerCase() ===
        DEFINITION_NAME.toLowerCase(),
    );

  if (
    matchingDefinitions.length !== 1
  ) {
    console.log(
      '\nMatching definitions:\n',
    );

    for (
      const definition
      of matchingDefinitions
    ) {
      console.log(
        `${definition.name} | ${definition.namespace}.${definition.key} | ${definition.type?.name}`,
      );
    }

    throw new Error(
      `Expected exactly one PRODUCT metafield definition named "${DEFINITION_NAME}", found ${matchingDefinitions.length}.`,
    );
  }

  const definition =
    matchingDefinitions[0];

  const namespace =
    definition.namespace;

  const key =
    definition.key;

  const type =
    definition.type?.name;

  console.log(`
Metafield definition found:

Name      : ${definition.name}
Definition: ${definition.id}
Namespace : ${namespace}
Key       : ${key}
Full key  : ${namespace}.${key}
Type      : ${type}
`);

  if (
    type !== EXPECTED_TYPE
  ) {
    throw new Error(
      `Expected "${DEFINITION_NAME}" to be ${EXPECTED_TYPE}, but Shopify reports ${type}. Do not proceed until this is reviewed.`,
    );
  }

  /*
   * STEP 2
   * Read the 104 products and this exact
   * metafield using the discovered namespace/key.
   */
  const {
    info,
    products,
  } =
    await getCollectionProducts(
      namespace,
      key,
    );

  console.log(
    `Products found: ${products.length}`,
  );

  if (
    products.length !==
    EXPECTED_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL} products, found ${products.length}.`,
    );
  }

  const missingMetafields =
    [];

  const wrongType =
    [];

  const germanExact =
    [];

  const germanMismatch =
    [];

  for (
    const product
    of products
  ) {
    const metafield =
      product.metafield;

    if (!metafield) {
      missingMetafields.push(
        product,
      );

      continue;
    }

    if (
      metafield.namespace !==
        namespace ||
      metafield.key !== key ||
      !metafield.id
    ) {
      throw new Error(
        `Metafield identity problem on ${product.handle}.`,
      );
    }

    if (
      metafield.type !== type
    ) {
      wrongType.push({
        handle:
          product.handle,

        type:
          metafield.type,
      });

      continue;
    }

    if (
      richTextEquals(
        metafield.value,
        EXPECTED_GERMAN_RICH_TEXT,
      )
    ) {
      germanExact.push(
        product,
      );
    } else {
      germanMismatch.push(
        product,
      );
    }
  }

  console.log(`
German metafield precheck:

METAFIELD PRESENT        : ${products.length - missingMetafields.length}/${products.length}
METAFIELD MISSING        : ${missingMetafields.length}
CORRECT TYPE             : ${products.length - missingMetafields.length - wrongType.length}
WRONG TYPE               : ${wrongType.length}
GERMAN EXACT MATCH       : ${germanExact.length}
GERMAN MISMATCH          : ${germanMismatch.length}
`);

  if (
    missingMetafields.length >
    0
  ) {
    console.log(
      '\nMISSING METAFIELD:\n',
    );

    for (
      const product
      of missingMetafields
    ) {
      console.log(
        product.handle,
      );
    }
  }

  if (
    wrongType.length >
    0
  ) {
    console.log(
      '\nWRONG TYPE:\n',
    );

    for (
      const item
      of wrongType
    ) {
      console.log(
        `${item.handle} | ${item.type}`,
      );
    }
  }

  if (
    germanMismatch.length >
    0
  ) {
    console.log(
      '\nGERMAN SOURCE MISMATCH:\n',
    );

    for (
      const product
      of germanMismatch
    ) {
      console.log(
        product.handle,
      );
    }

    /*
     * Print one actual mismatch to make
     * structure differences easy to diagnose.
     */
    const sample =
      germanMismatch[0];

    console.log(
      `\nFIRST MISMATCH RAW SHOPIFY VALUE (${sample.handle}):\n`,
    );

    console.log(
      sample.metafield.value,
    );
  }

  /*
   * Do not attempt translation audit for
   * products where the source metafield itself
   * is missing or invalid.
   */
  const validProducts =
    products.filter(
      (product) =>
        product.metafield &&
        product.metafield.type ===
          type,
    );

  /*
   * STEP 3
   * Read Shopify translation resources.
   */
  const results = [];

  for (
    let i = 0;
    i < validProducts.length;
    i += 1
  ) {
    const product =
      validProducts[i];

    process.stdout.write(
      `\rTranslations ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${validProducts.length}`,
    );

    const data =
      await gql(
        TRANSLATABLE_RESOURCE_QUERY,
        {
          resourceId:
            product.metafield.id,

          locale:
            TARGET_LOCALE,
        },
      );

    const resource =
      data
        ?.translatableResource;

    if (!resource) {
      results.push({
        productId:
          product.id,

        handle:
          product.handle,

        title:
          product.title,

        metafieldId:
          product.metafield.id,

        status:
          'RESOURCE_MISSING',

        source:
          null,

        translations:
          [],
      });

      continue;
    }

    if (
      resource.resourceId !==
      product.metafield.id
    ) {
      results.push({
        productId:
          product.id,

        handle:
          product.handle,

        title:
          product.title,

        metafieldId:
          product.metafield.id,

        status:
          'RESOURCE_ID_MISMATCH',

        source:
          null,

        translations:
          [],
      });

      continue;
    }

    const valueSources =
      (
        resource
          .translatableContent ||
        []
      ).filter(
        (item) =>
          item.key ===
          'value',
      );

    let status =
      'OK';

    let source =
      null;

    if (
      valueSources.length !== 1
    ) {
      status =
        'SOURCE_KEY_PROBLEM';
    } else {
      source =
        valueSources[0];

      if (!source.digest) {
        status =
          'DIGEST_MISSING';
      } else if (
        source.locale !==
        SOURCE_LOCALE
      ) {
        status =
          'SOURCE_LOCALE_UNEXPECTED';
      } else if (
        !richTextEquals(
          source.value,
          product.metafield.value,
        )
      ) {
        status =
          'TRANSLATABLE_SOURCE_DIFFERS_FROM_METAFIELD';
      }
    }

    const translations =
      resource.translations ||
      [];

    results.push({
      productId:
        product.id,

      handle:
        product.handle,

      title:
        product.title,

      metafieldId:
        product.metafield.id,

      status,

      source,

      translations,
    });

    await sleep(50);
  }

  process.stdout.write('\n');

  /*
   * STEP 4
   * Classify EN translation state.
   */
  const resourceProblems =
    results.filter(
      (item) =>
        item.status !==
        'OK',
    );

  const wrongTranslationKeys =
    [];

  const marketSpecificRecords =
    [];

  const globalRecords =
    [];

  for (
    const result
    of results
  ) {
    for (
      const translation
      of result.translations
    ) {
      if (
        translation.key !==
        'value'
      ) {
        wrongTranslationKeys.push({
          handle:
            result.handle,

          metafieldId:
            result.metafieldId,

          translation,
        });

        continue;
      }

      if (
        translation.market
      ) {
        marketSpecificRecords.push({
          handle:
            result.handle,

          metafieldId:
            result.metafieldId,

          translation,
        });
      } else {
        globalRecords.push({
          handle:
            result.handle,

          metafieldId:
            result.metafieldId,

          translation,
        });
      }
    }
  }

  const productsWithAnyEn =
    results.filter(
      (result) =>
        result.translations.length >
        0,
    );

  const productsWithoutAnyEn =
    results.filter(
      (result) =>
        result.translations.length ===
        0,
    );

  const productsWithGlobalEn =
    results.filter(
      (result) =>
        result.translations.some(
          (translation) =>
            translation.key ===
              'value' &&
            !translation.market,
        ),
    );

  const productsWithoutGlobalEn =
    results.filter(
      (result) =>
        !result.translations.some(
          (translation) =>
            translation.key ===
              'value' &&
            !translation.market,
        ),
    );

  const globalCurrent =
    globalRecords.filter(
      ({translation}) =>
        translation.outdated ===
        false,
    );

  const globalOutdated =
    globalRecords.filter(
      ({translation}) =>
        translation.outdated ===
        true,
    );

  const globalExactTarget =
    globalRecords.filter(
      ({translation}) =>
        richTextEquals(
          translation.value,
          TARGET_ENGLISH_RICH_TEXT,
        ),
    );

  const globalNotTarget =
    globalRecords.filter(
      ({translation}) =>
        !richTextEquals(
          translation.value,
          TARGET_ENGLISH_RICH_TEXT,
        ),
    );

  const sourceDigests =
    new Set(
      results
        .map(
          (result) =>
            result.source?.digest,
        )
        .filter(Boolean),
    );

  /*
   * STEP 5
   * Main summary.
   */
  console.log(`
================ AUDIT RESULT ================

DEFINITION NAME              : ${definition.name}
METAFIELD                    : ${namespace}.${key}
METAFIELD TYPE               : ${type}

TOTAL PRODUCTS               : ${products.length}

METAFIELD PRESENT            : ${products.length - missingMetafields.length}
METAFIELD MISSING            : ${missingMetafields.length}

GERMAN EXACT MATCH           : ${germanExact.length}
GERMAN MISMATCH              : ${germanMismatch.length}

TRANSLATABLE RESOURCES       : ${results.length - resourceProblems.length}
RESOURCE / SOURCE PROBLEMS   : ${resourceProblems.length}
UNIQUE SOURCE DIGESTS        : ${sourceDigests.size}

EN TRANSLATION FOUND         : ${productsWithAnyEn.length}
EN TRANSLATION MISSING       : ${productsWithoutAnyEn.length}

GLOBAL EN FOUND              : ${productsWithGlobalEn.length}
GLOBAL EN MISSING            : ${productsWithoutGlobalEn.length}

GLOBAL EN CURRENT            : ${globalCurrent.length}
GLOBAL EN OUTDATED           : ${globalOutdated.length}

GLOBAL EN EXACT NEW TARGET   : ${globalExactTarget.length}
GLOBAL EN NOT NEW TARGET     : ${globalNotTarget.length}

MARKET-SPECIFIC EN RECORDS   : ${marketSpecificRecords.length}
WRONG TRANSLATION KEYS       : ${wrongTranslationKeys.length}
`);

  if (
    resourceProblems.length >
    0
  ) {
    console.log(
      '\nRESOURCE / SOURCE PROBLEMS:\n',
    );

    for (
      const item
      of resourceProblems
    ) {
      console.log(
        `${item.handle} | ${item.status}`,
      );
    }
  }

  if (
    marketSpecificRecords.length >
    0
  ) {
    console.log(
      '\nMARKET-SPECIFIC EN:\n',
    );

    for (
      const item
      of marketSpecificRecords
    ) {
      const market =
        item.translation.market;

      console.log(
        `${item.handle} | ${market?.name || market?.id} | outdated=${item.translation.outdated}`,
      );
    }
  }

  if (
    wrongTranslationKeys.length >
    0
  ) {
    console.log(
      '\nWRONG TRANSLATION KEYS:\n',
    );

    for (
      const item
      of wrongTranslationKeys
    ) {
      console.log(
        `${item.handle} | key=${item.translation.key}`,
      );
    }
  }

  /*
   * Existing GLOBAL EN values.
   *
   * We expect the user-described current state
   * to contain exactly one.
   */
  console.log(
    '\n================ EXISTING GLOBAL EN VALUES ================\n',
  );

  if (
    globalRecords.length === 0
  ) {
    console.log(
      '(none)',
    );
  }

  for (
    const item
    of globalRecords
  ) {
    console.log(
      `--- ${item.handle} ---`,
    );

    console.log(
      `Metafield GID: ${item.metafieldId}`,
    );

    console.log(
      `Locale: ${item.translation.locale}`,
    );

    console.log(
      `Scope: GLOBAL`,
    );

    console.log(
      `Outdated: ${item.translation.outdated}`,
    );

    console.log(
      `Matches new target: ${richTextEquals(
        item.translation.value,
        TARGET_ENGLISH_RICH_TEXT,
      )}`,
    );

    console.log(
      'Current EN value:',
    );

    console.log(
      item.translation.value,
    );

    console.log('');
  }

  /*
   * Print one exact German source and digest
   * so we can visually confirm the rich-text
   * structure before writing anything.
   */
  const sampleResult =
    results.find(
      (result) =>
        result.status ===
        'OK',
    );

  if (sampleResult) {
    console.log(
      '\n================ SOURCE SAMPLE ================\n',
    );

    console.log(
      `Handle: ${sampleResult.handle}`,
    );

    console.log(
      `Metafield GID: ${sampleResult.metafieldId}`,
    );

    console.log(
      `Source locale: ${sampleResult.source.locale}`,
    );

    console.log(
      `Digest: ${sampleResult.source.digest}`,
    );

    console.log(
      'Source value:',
    );

    console.log(
      sampleResult.source.value,
    );

    console.log('');
  }

  /*
   * STEP 6
   * Save full audit locally.
   */
  const auditPath =
    writeJson(
      'delivery-shipping-en-translation-audit',
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
          info,

        definition,

        sourceLocale:
          SOURCE_LOCALE,

        targetLocale:
          TARGET_LOCALE,

        grantedScopes,

        approvedGerman:
          EXPECTED_GERMAN_RICH_TEXT,

        approvedEnglish:
          TARGET_ENGLISH_RICH_TEXT,

        summary: {
          totalProducts:
            products.length,

          metafieldPresent:
            products.length -
            missingMetafields.length,

          metafieldMissing:
            missingMetafields.length,

          germanExact:
            germanExact.length,

          germanMismatch:
            germanMismatch.length,

          translatableResources:
            results.length -
            resourceProblems.length,

          resourceProblems:
            resourceProblems.length,

          uniqueSourceDigests:
            sourceDigests.size,

          enTranslationFound:
            productsWithAnyEn.length,

          enTranslationMissing:
            productsWithoutAnyEn.length,

          globalEnFound:
            productsWithGlobalEn.length,

          globalEnMissing:
            productsWithoutGlobalEn.length,

          globalEnCurrent:
            globalCurrent.length,

          globalEnOutdated:
            globalOutdated.length,

          globalEnExactNewTarget:
            globalExactTarget.length,

          globalEnNotNewTarget:
            globalNotTarget.length,

          marketSpecificEn:
            marketSpecificRecords.length,

          wrongTranslationKeys:
            wrongTranslationKeys.length,
        },

        missingMetafields:
          missingMetafields.map(
            (product) => ({
              id:
                product.id,

              handle:
                product.handle,

              title:
                product.title,
            }),
          ),

        germanMismatch:
          germanMismatch.map(
            (product) => ({
              id:
                product.id,

              handle:
                product.handle,

              title:
                product.title,

              actualValue:
                product.metafield?.value,
            }),
          ),

        products:
          results,
      },
    );

  console.log(`
Audit JSON:
${auditPath}

NO SHOPIFY DATA WAS CHANGED.
`);

  /*
   * Structural safety result.
   *
   * We are NOT hard-coding "1 existing / 103 missing"
   * here as a structural requirement because this is
   * the audit whose job is to prove that current state.
   */
  const structuralProblems =
    missingMetafields.length +
    wrongType.length +
    germanMismatch.length +
    resourceProblems.length +
    marketSpecificRecords.length +
    wrongTranslationKeys.length;

  if (
    structuralProblems >
    0
  ) {
    console.log(`
AUDIT HAS PROBLEMS.

DO NOT WRITE DELIVERY & SHIPPING TRANSLATIONS YET.
`);

    process.exitCode = 2;

    return;
  }

  console.log(`
STRUCTURAL AUDIT CLEAN.

No Shopify data was changed.

Now review the translation counts.
For the expected migration state we want:

TOTAL PRODUCTS             = 104
GERMAN EXACT MATCH         = 104
RESOURCE / SOURCE PROBLEMS = 0
EN TRANSLATION FOUND       = 1
EN TRANSLATION MISSING     = 103
GLOBAL EN FOUND            = 1
GLOBAL EN MISSING          = 103
MARKET-SPECIFIC EN         = 0
WRONG TRANSLATION KEYS     = 0
`);
}

main().catch(
  (error) => {
    console.error(
      '\nDELIVERY & SHIPPING TRANSLATION AUDIT FAILED:\n',
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