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

const NAMESPACE = 'custom';
const KEY = 'delivery_and_shipping';
const TYPE = 'rich_text_field';

const SOURCE_LOCALE = 'de';
const TARGET_LOCALE = 'en';

const EXPECTED_TOTAL = 104;
const EXPECTED_EXISTING_EN = 1;
const EXPECTED_MISSING_EN = 103;

const EXISTING_TRANSLATION_HANDLE =
  'fototapete-koi-mit-lotusbluten';

/*
 * This is the ACTUAL Shopify rich-text structure
 * confirmed by the source inspection.
 *
 * Important:
 * headings and their bodies live inside the
 * SAME paragraph, separated by "\n".
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
        {
          type: 'text',
          value:
            '\nDer Versand innerhalb Deutschlands ist kostenfrei. Die Lieferzeit beträgt in der Regel ',
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
        {
          type: 'text',
          value:
            '\nDer Versand nach Österreich und in die Schweiz ist ebenfalls kostenfrei. Die Lieferzeit beträgt ',
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
        {
          type: 'text',
          value:
            '\nEin Versand in weitere Länder der Europäischen Union ist grundsätzlich möglich. Bitte kontaktiere vor deiner Bestellung unseren Kundenservice, damit wir die Versandmöglichkeiten und Lieferzeiten für dein Zielland prüfen können.',
        },
      ],
    },
  ],
};

/*
 * APPROVED ENGLISH TRANSLATION
 *
 * Same rich-text structure as German:
 * - headings bold
 * - delivery times bold
 * - same paragraph/newline behavior
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
        {
          type: 'text',
          value:
            '\nShipping within Germany is free of charge. The delivery time is usually ',
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
        {
          type: 'text',
          value:
            '\nShipping to Austria and Switzerland is also free of charge. The delivery time is ',
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
        {
          type: 'text',
          value:
            '\nShipping to other countries within the European Union is generally possible. Please contact our customer service before placing your order so that we can check the available shipping options and delivery times for your destination country.',
        },
      ],
    },
  ],
};

const TARGET_ENGLISH_VALUE =
  JSON.stringify(TARGET_ENGLISH_RICH_TEXT);

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
let updatesCompleted = 0;
let createsCompleted = 0;

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms),
  );

function stable(value) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stable)
      .join(',')}]`;
  }

  const keys =
    Object.keys(value).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stable(
          value[key],
        )}`,
    )
    .join(',')}}`;
}

function richTextEqualsObject(
  rawValue,
  expectedObject,
) {
  try {
    return (
      stable(JSON.parse(rawValue)) ===
      stable(expectedObject)
    );
  } catch {
    return false;
  }
}

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
      'write_translations',
    )
  ) {
    throw new Error(
      `write_translations scope missing. Current scopes: ${grantedScopes.join(
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

const COLLECTION_QUERY = `#graphql
  query DeliveryShippingProducts(
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
  query DeliveryShippingTranslationState(
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
        type
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

const REGISTER_TRANSLATION_MUTATION = `#graphql
  mutation RegisterDeliveryShippingTranslation(
    $resourceId: ID!
    $translations: [TranslationInput!]!
  ) {
    translationsRegister(
      resourceId: $resourceId
      translations: $translations
    ) {
      translations {
        key
        locale
        value
        outdated
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

function validateProductMetafield(
  product,
) {
  const metafield =
    product.metafield;

  if (!metafield) {
    throw new Error(
      `Missing ${NAMESPACE}.${KEY}: ${product.handle}`,
    );
  }

  if (
    metafield.namespace !==
      NAMESPACE ||
    metafield.key !==
      KEY
  ) {
    throw new Error(
      `Metafield identity mismatch: ${product.handle}`,
    );
  }

  if (
    metafield.type !==
    TYPE
  ) {
    throw new Error(
      `Metafield type mismatch on ${product.handle}. Expected ${TYPE}, got ${metafield.type}`,
    );
  }

  if (!metafield.id) {
    throw new Error(
      `Metafield ID missing: ${product.handle}`,
    );
  }

  if (
    !richTextEqualsObject(
      metafield.value,
      EXPECTED_GERMAN_RICH_TEXT,
    )
  ) {
    throw new Error(
      `German Delivery & Shipping source mismatch on ${product.handle}.`,
    );
  }
}

async function getTranslationState(
  product,
) {
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
    data?.translatableResource;

  if (!resource) {
    throw new Error(
      `Translatable resource missing: ${product.handle}`,
    );
  }

  if (
    resource.resourceId !==
    product.metafield.id
  ) {
    throw new Error(
      `Translatable resource ID mismatch: ${product.handle}`,
    );
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

  if (
    valueSources.length !== 1
  ) {
    throw new Error(
      `Expected exactly one translatable source value on ${product.handle}; found ${valueSources.length}.`,
    );
  }

  const source =
    valueSources[0];

  if (!source.digest) {
    throw new Error(
      `Source digest missing: ${product.handle}`,
    );
  }

  if (
    source.locale !==
    SOURCE_LOCALE
  ) {
    throw new Error(
      `Unexpected source locale on ${product.handle}. Expected ${SOURCE_LOCALE}, got ${source.locale}`,
    );
  }

  if (
    source.type !==
    'RICH_TEXT_FIELD'
  ) {
    throw new Error(
      `Unexpected translatable source type on ${product.handle}: ${source.type}`,
    );
  }

  /*
   * Important:
   * Compare RAW metafield JSON string directly
   * with RAW translatable source JSON string.
   *
   * The previous audit's false positive came
   * from comparing a parsed object to a raw string.
   */
  if (
    source.value !==
    product.metafield.value
  ) {
    throw new Error(
      `RAW translatable source differs from metafield value on ${product.handle}.`,
    );
  }

  if (
    !richTextEqualsObject(
      source.value,
      EXPECTED_GERMAN_RICH_TEXT,
    )
  ) {
    throw new Error(
      `Translatable German source content mismatch on ${product.handle}.`,
    );
  }

  const translations =
    resource.translations || [];

  for (
    const translation
    of translations
  ) {
    if (
      translation.key !==
      'value'
    ) {
      throw new Error(
        `Unexpected EN translation key "${translation.key}" on ${product.handle}.`,
      );
    }

    if (
      translation.locale !==
      TARGET_LOCALE
    ) {
      throw new Error(
        `Unexpected translation locale on ${product.handle}: ${translation.locale}`,
      );
    }
  }

  return {
    resourceId:
      resource.resourceId,

    source,

    translations,
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

async function verifyTargetTranslation(
  product,
  expectedDigest,
) {
  const fresh =
    await getTranslationState(
      product,
    );

  if (
    fresh.source.digest !==
    expectedDigest
  ) {
    throw new Error(
      `German source digest changed unexpectedly for ${product.handle}.`,
    );
  }

  if (
    fresh.translations.length !==
    1
  ) {
    throw new Error(
      `Expected exactly one EN translation on ${product.handle}; found ${fresh.translations.length}.`,
    );
  }

  const translation =
    fresh.translations[0];

  if (
    translation.market
  ) {
    throw new Error(
      `Unexpected market-specific EN translation on ${product.handle}.`,
    );
  }

  if (
    translation.key !==
    'value'
  ) {
    throw new Error(
      `Unexpected translation key on ${product.handle}: ${translation.key}`,
    );
  }

  if (
    translation.locale !==
    TARGET_LOCALE
  ) {
    throw new Error(
      `Unexpected translation locale on ${product.handle}: ${translation.locale}`,
    );
  }

  if (
    translation.outdated !==
    false
  ) {
    throw new Error(
      `EN translation remains outdated on ${product.handle}.`,
    );
  }

  if (
    !richTextEqualsObject(
      translation.value,
      TARGET_ENGLISH_RICH_TEXT,
    )
  ) {
    throw new Error(
      `English Delivery & Shipping value mismatch on ${product.handle}.`,
    );
  }

  return fresh;
}

async function main() {
  console.log(`
WANDINI
Delivery & Shipping EN ALL-104 migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Metafield:
${NAMESPACE}.${KEY}
${TYPE}

Source:
locale = ${SOURCE_LOCALE}

Target:
locale = ${TARGET_LOCALE}
key = value
scope = GLOBAL

THIS SCRIPT CAN WRITE TRANSLATIONS.

Hard locks:
- collection total = 104
- metafield present = 104/104
- German source exact match = 104/104
- metafield RAW value = translation RAW source = 104/104
- single shared source digest
- existing GLOBAL EN = exactly 1
- missing EN = exactly 103
- existing EN owner = ${EXISTING_TRANSLATION_HANDLE}
- market-specific EN = 0
`);

  /*
   * STEP 1
   * Read all products.
   */
  const {
    collectionInfo,
    products,
  } =
    await getCollectionProducts();

  if (
    products.length !==
    EXPECTED_TOTAL
  ) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL} products, found ${products.length}.`,
    );
  }

  for (
    const product
    of products
  ) {
    validateProductMetafield(
      product,
    );
  }

  console.log(
    '104/104 German Delivery & Shipping metafields verified.',
  );

  /*
   * STEP 2
   * Re-read all translatable resources.
   */
  const states = [];

  for (
    let i = 0;
    i < products.length;
    i += 1
  ) {
    const product =
      products[i];

    process.stdout.write(
      `\rPrecheck translations ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${products.length}`,
    );

    const state =
      await getTranslationState(
        product,
      );

    states.push({
      product,
      state,
    });

    await sleep(50);
  }

  process.stdout.write('\n');

  /*
   * STEP 3
   * All 104 sources should currently be
   * identical, therefore all digests should match.
   */
  const digests =
    new Set(
      states.map(
        ({state}) =>
          state.source.digest,
      ),
    );

  if (
    digests.size !== 1
  ) {
    throw new Error(
      `Expected exactly 1 unique German source digest, found ${digests.size}.`,
    );
  }

  /*
   * Classify existing EN translations.
   */
  const existingGlobal = [];
  const missing = [];
  const marketSpecific = [];
  const unexpected = [];

  for (
    const entry
    of states
  ) {
    const {
      state,
    } = entry;

    if (
      state.translations.length ===
      0
    ) {
      missing.push(entry);

      continue;
    }

    const markets =
      state.translations.filter(
        (translation) =>
          Boolean(
            translation.market,
          ),
      );

    if (
      markets.length > 0
    ) {
      marketSpecific.push(
        entry,
      );

      continue;
    }

    if (
      state.translations.length !==
      1
    ) {
      unexpected.push({
        ...entry,
        reason:
          `Expected at most one GLOBAL EN translation; found ${state.translations.length}.`,
      });

      continue;
    }

    existingGlobal.push(
      entry,
    );
  }

  if (
    marketSpecific.length !==
    0
  ) {
    throw new Error(
      `Expected 0 market-specific EN translations, found ${marketSpecific.length}.`,
    );
  }

  if (
    unexpected.length !==
    0
  ) {
    throw new Error(
      `Unexpected EN translation states found: ${unexpected.length}.`,
    );
  }

  if (
    existingGlobal.length !==
    EXPECTED_EXISTING_EN
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_EXISTING_EN} existing GLOBAL EN translation, found ${existingGlobal.length}.`,
    );
  }

  if (
    missing.length !==
    EXPECTED_MISSING_EN
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_MISSING_EN} missing EN translations, found ${missing.length}.`,
    );
  }

  const existing =
    existingGlobal[0];

  if (
    existing.product.handle !==
    EXISTING_TRANSLATION_HANDLE
  ) {
    throw new Error(
      `Unexpected product owns the existing EN translation: ${existing.product.handle}`,
    );
  }

  if (
    existing.state
      .translations[0]
      .market
  ) {
    throw new Error(
      'Existing EN translation unexpectedly has a market.',
    );
  }

  /*
   * We know this existing translation is the
   * old text and should be replaced.
   */
  if (
    richTextEqualsObject(
      existing.state
        .translations[0]
        .value,
      TARGET_ENGLISH_RICH_TEXT,
    )
  ) {
    throw new Error(
      'Existing Koi EN translation already equals the new target. Current state changed since audit.',
    );
  }

  /*
   * STEP 4
   * Save ALL 104 current translation states
   * before any mutation.
   */
  const beforePath =
    writeJson(
      'delivery-shipping-en-all104-before',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        collection:
          collectionInfo,

        metafield: {
          namespace:
            NAMESPACE,

          key:
            KEY,

          type:
            TYPE,
        },

        sourceLocale:
          SOURCE_LOCALE,

        targetLocale:
          TARGET_LOCALE,

        targetScope:
          'GLOBAL',

        targetEnglish:
          TARGET_ENGLISH_RICH_TEXT,

        summary: {
          totalProducts:
            products.length,

          germanSourceCorrect:
            products.length,

          uniqueSourceDigests:
            digests.size,

          existingGlobalEn:
            existingGlobal.length,

          missingEn:
            missing.length,

          marketSpecificEn:
            marketSpecific.length,
        },

        products:
          states.map(
            ({product, state}) => ({
              productId:
                product.id,

              handle:
                product.handle,

              title:
                product.title,

              metafieldId:
                product.metafield.id,

              metafieldValue:
                product.metafield.value,

              source:
                state.source,

              translations:
                state.translations,
            }),
          ),
      },
    );

  console.log(`
PRECHECK CLEAN.

TOTAL PRODUCTS             : ${products.length}
METAFIELD PRESENT          : ${products.length}
GERMAN SOURCE CORRECT      : ${products.length}
RAW SOURCE EXACT MATCH     : ${products.length}
UNIQUE SOURCE DIGESTS      : ${digests.size}

EXISTING GLOBAL EN         : ${existingGlobal.length}
MISSING EN                 : ${missing.length}
MARKET-SPECIFIC EN         : ${marketSpecific.length}
UNEXPECTED EN STATES       : ${unexpected.length}

Existing translation:
${existing.product.handle}
→ will be UPDATED

Remaining ${missing.length}:
→ GLOBAL EN translations will be CREATED

Backup of ALL 104 current translation states:
${beforePath}

Only English translation records for
${NAMESPACE}.${KEY}
will be written.

German metafields will NOT be written.
Product titles will NOT be written.
Handles will NOT be written.
Variants will NOT be written.
Prices will NOT be written.
SKUs will NOT be written.
Images will NOT be written.
Other metafields will NOT be written.
`);

  console.log(`
TARGET ENGLISH:

Each wall mural is individually produced to your desired dimensions and then carefully packaged. Since every order is custom-made, production begins only after your order has been placed.

Germany
Shipping within Germany is free of charge. The delivery time is usually 8–10 business days.

Austria & Switzerland
Shipping to Austria and Switzerland is also free of charge. The delivery time is 10–16 business days.

Other EU Countries
Shipping to other countries within the European Union is generally possible. Please contact our customer service before placing your order so that we can check the available shipping options and delivery times for your destination country.

Bold:
Germany
8–10 business days
Austria & Switzerland
10–16 business days
Other EU Countries
`);

  /*
   * STEP 5
   * Explicit confirmation.
   */
  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE 104 EN DELIVERY SHIPPING to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE 104 EN DELIVERY SHIPPING'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  /*
   * STEP 6
   * Write all 104 individually.
   *
   * Existing Koi translation is UPDATE.
   * Other 103 are CREATE.
   *
   * Every request uses that product's
   * current source digest.
   */
  for (
    let i = 0;
    i < states.length;
    i += 1
  ) {
    const entry =
      states[i];

    const {
      product,
      state,
    } = entry;

    const existedBefore =
      state.translations.length ===
      1;

    console.log(
      `\n[${i + 1}/${states.length}] ${
        existedBefore
          ? 'Updating'
          : 'Creating'
      }: ${product.handle}`,
    );

    const mutationData =
      await gql(
        REGISTER_TRANSLATION_MUTATION,
        {
          resourceId:
            product.metafield.id,

          translations: [
            {
              locale:
                TARGET_LOCALE,

              key:
                'value',

              value:
                TARGET_ENGLISH_VALUE,

              translatableContentDigest:
                state.source.digest,
            },
          ],
        },
        {
          allowMutation:
            true,
        },
      );

    const result =
      mutationData
        ?.translationsRegister;

    if (!result) {
      throw new Error(
        `translationsRegister returned no payload for ${product.handle}.`,
      );
    }

    if (
      result.userErrors?.length >
      0
    ) {
      throw new Error(
        `Translation write failed for ${product.handle}:\n${JSON.stringify(
          result.userErrors,
          null,
          2,
        )}`,
      );
    }

    if (
      result.translations?.length !==
      1
    ) {
      throw new Error(
        `Expected exactly one returned translation for ${product.handle}; got ${result.translations?.length ?? 0}.`,
      );
    }

    writesCompleted += 1;

    if (existedBefore) {
      updatesCompleted += 1;
    } else {
      createsCompleted += 1;
    }

    /*
     * Immediate Shopify re-read.
     */
    await sleep(200);

    await verifyTargetTranslation(
      product,
      state.source.digest,
    );

    console.log(
      `Verified: ${product.handle}`,
    );

    await sleep(75);
  }

  /*
   * STEP 7
   * FINAL 104/104 verification.
   */
  console.log(
    '\nRunning FINAL 104/104 Delivery & Shipping verification...',
  );

  const {
    products:
      finalProducts,
  } =
    await getCollectionProducts();

  if (
    finalProducts.length !==
    EXPECTED_TOTAL
  ) {
    throw new Error(
      `Final collection total mismatch. Expected ${EXPECTED_TOTAL}, got ${finalProducts.length}.`,
    );
  }

  const beforeByProductId =
    new Map(
      states.map(
        (entry) => [
          entry.product.id,
          entry,
        ],
      ),
    );

  const finalStates = [];

  for (
    let i = 0;
    i < finalProducts.length;
    i += 1
  ) {
    const product =
      finalProducts[i];

    process.stdout.write(
      `\rFinal verification ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${finalProducts.length}`,
    );

    validateProductMetafield(
      product,
    );

    const before =
      beforeByProductId.get(
        product.id,
      );

    if (!before) {
      throw new Error(
        `Unexpected product appeared during final verification: ${product.handle}`,
      );
    }

    if (
      product.metafield.id !==
      before.product.metafield.id
    ) {
      throw new Error(
        `Delivery & Shipping metafield ID changed unexpectedly for ${product.handle}.`,
      );
    }

    /*
     * German source itself must remain
     * byte-for-byte unchanged.
     */
    if (
      product.metafield.value !==
      before.product.metafield.value
    ) {
      throw new Error(
        `German metafield value changed unexpectedly for ${product.handle}.`,
      );
    }

    const fresh =
      await verifyTargetTranslation(
        product,
        before.state.source.digest,
      );

    finalStates.push({
      productId:
        product.id,

      handle:
        product.handle,

      title:
        product.title,

      metafieldId:
        product.metafield.id,

      source:
        fresh.source,

      translation:
        fresh.translations[0],
    });

    await sleep(50);
  }

  process.stdout.write('\n');

  /*
   * STEP 8
   * After snapshot.
   */
  const afterPath =
    writeJson(
      'delivery-shipping-en-all104-after',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        sourceLocale:
          SOURCE_LOCALE,

        targetLocale:
          TARGET_LOCALE,

        targetScope:
          'GLOBAL',

        summary: {
          totalProducts:
            finalStates.length,

          updatedExisting:
            updatesCompleted,

          createdNew:
            createsCompleted,

          finalCorrect:
            finalStates.length,
        },

        products:
          finalStates,
      },
    );

  console.log(`
================================================
FINAL DELIVERY & SHIPPING EN MIGRATION COMPLETE
================================================

Updated existing : ${updatesCompleted}
Created new      : ${createsCompleted}
Correct total    : ${finalStates.length}

104/104 products now have the exact approved
GLOBAL English Delivery & Shipping translation.

Every translation was re-read directly from Shopify.

Final guarantees:

- locale = en
- key = value
- scope = GLOBAL
- outdated = false
- exact English rich-text match = 104/104
- German Delivery & Shipping unchanged = 104/104
- German source digests unchanged
- metafield IDs unchanged
- no market-specific EN translations created

After snapshot:
${afterPath}
`);
}

main().catch(
  (error) => {
    console.error(
      '\nDELIVERY & SHIPPING EN MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(`
Successful writes before failure: ${writesCompleted}/104
Updates completed: ${updatesCompleted}
Creates completed: ${createsCompleted}
`);

    if (
      writesCompleted === 0
    ) {
      console.error(`
No translation writes completed.
`);
    } else {
      console.error(`
IMPORTANT:

At least one translation was successfully written
before the failure.

DO NOT blindly rerun this script.

First inspect the current Shopify translation state
with a READ-ONLY audit.
`);
    }

    process.exitCode = 1;
  },
);