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
const KEY = 'product_info';
const TYPE = 'rich_text_field';

const SOURCE_LOCALE = 'de';
const TARGET_LOCALE = 'en';

const EXPECTED_TOTAL = 104;

const TEST_HANDLES = [
  'fototapete-koi-mit-lotusbluten',
  '6-2',
];

const EXPECTED_GERMAN_RICH_TEXT = {
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Jede Fototapete wird individuell für dich auf Maß gefertigt. Im Konfigurator kannst du zwischen vier hochwertigen Materialien wählen – passend zu deinem Raum, Untergrund und deinen Anforderungen.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Glatt',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' ist unsere preisgünstige Vliestapete mit glatter, matter Oberfläche und hochwertiger Druckqualität. Die Fototapete ist schwer entflammbar, wird klassisch mit Kleister verarbeitet und in passgenauen Bahnen geliefert.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Feinprägung',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' ist eine hochwertige Vliestapete mit fein geprägter, matter Oberfläche. Die dezente Struktur sorgt für eine besonders edle Optik und brillante Bildwirkung. Auch diese Fototapete ist schwer entflammbar und wird in passgenauen Bahnen geliefert.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Selbstklebend',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' eignet sich ideal für glatte Untergründe und kommt ganz ohne Kleister aus. Die selbstklebende Fototapete lässt sich einfach anbringen, rückstandslos entfernen und wird in passgenauen Bahnen geliefert.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Nahtlos',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' ist unsere hochwertige Textiltapete für eine besonders gleichmäßige Wandgestaltung. Sie wird aus einem Stück gefertigt und kommt vollständig ohne sichtbare Übergänge aus. Das textile, matte Finish sorgt besonders auf großen Wandflächen für eine beeindruckende und hochwertige Bildwirkung.',
        },
      ],
    },
  ],
};

const TARGET_ENGLISH_RICH_TEXT = {
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            'Each wall mural is custom-made to your exact dimensions. In the configurator, you can choose from four high-quality materials – to suit your room, wall surface, and requirements.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Smooth',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' is our affordable non-woven wallpaper with a smooth, matte surface and high-quality print reproduction. The wall mural is flame-retardant, installed traditionally using wallpaper paste, and supplied in precisely fitted panels.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Fine Embossing',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' is a high-quality non-woven wallpaper with a finely embossed, matte surface. The subtle texture creates an especially elegant appearance and brilliant image reproduction. This wall mural is also flame-retardant and supplied in precisely fitted panels.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Self-Adhesive',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' is ideal for smooth surfaces and requires no wallpaper paste. The self-adhesive wall mural is easy to install, can be removed without leaving residue, and is supplied in precisely fitted panels.',
        },
      ],
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Seamless',
          bold: true,
        },
        {
          type: 'text',
          value:
            ' is our high-quality textile wallpaper for a particularly uniform wall finish. It is produced in one piece and has no visible joins. The textile, matte finish creates an impressive, premium visual impact, especially on large wall surfaces.',
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
    Number(body.expires_in || 0) *
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
  query ProductInfoTranslationProducts(
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
  query ProductInfoTranslationState(
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

const REGISTER_TRANSLATION_MUTATION = `#graphql
  mutation RegisterProductInfoTranslation(
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

  const sourceValues =
    (
      resource
        .translatableContent ||
      []
    ).filter(
      (item) =>
        item.key === 'value',
    );

  if (
    sourceValues.length !== 1
  ) {
    throw new Error(
      `Expected exactly one source value for ${product.handle}, found ${sourceValues.length}.`,
    );
  }

  const source =
    sourceValues[0];

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
    !richTextEquals(
      source.value,
      EXPECTED_GERMAN_RICH_TEXT,
    )
  ) {
    throw new Error(
      `Translatable German source mismatch on ${product.handle}.`,
    );
  }

  const allTranslations =
    resource.translations || [];

  const unexpected =
    allTranslations.filter(
      (translation) =>
        translation.key !==
        'value',
    );

  if (
    unexpected.length > 0
  ) {
    throw new Error(
      `Unexpected translation key on ${product.handle}.`,
    );
  }

  return {
    resourceId:
      resource.resourceId,

    source,

    translations:
      allTranslations,
  };
}

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

function validateProduct(
  product,
) {
  if (!product.metafield) {
    throw new Error(
      `Missing ${NAMESPACE}.${KEY}: ${product.handle}`,
    );
  }

  if (
    product.metafield.namespace !==
      NAMESPACE ||
    product.metafield.key !==
      KEY ||
    product.metafield.type !==
      TYPE ||
    !product.metafield.id
  ) {
    throw new Error(
      `Unexpected Product Info metafield identity/type on ${product.handle}.`,
    );
  }

  if (
    !richTextEquals(
      product.metafield.value,
      EXPECTED_GERMAN_RICH_TEXT,
    )
  ) {
    throw new Error(
      `German Product Info mismatch on ${product.handle}.`,
    );
  }
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
English Product Info TEST-2 translation migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Source:
${NAMESPACE}.${KEY}
${SOURCE_LOCALE}

Target translation:
locale = ${TARGET_LOCALE}
key = value
scope = GLOBAL

THIS SCRIPT CAN WRITE TRANSLATIONS.

Hard locks:
- collection total = 104
- German source exact match = 104/104
- existing global EN = exactly 1
- missing EN = exactly 103
- market-specific EN = 0
- test products = exactly 2
`);

  /*
   * STEP 1
   * Read all 104 products.
   */
  const {
    info,
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
    validateProduct(product);
  }

  console.log(
    '104/104 German Product Info values verified.',
  );

  /*
   * STEP 2
   * Re-read all translation resources.
   * This protects us against anything changing
   * since the previous audit.
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

  const globalRecords =
    states.flatMap(
      ({product, state}) =>
        state.translations
          .filter(
            (translation) =>
              !translation.market,
          )
          .map(
            (translation) => ({
              product,
              translation,
            }),
          ),
    );

  const marketSpecificRecords =
    states.flatMap(
      ({product, state}) =>
        state.translations
          .filter(
            (translation) =>
              Boolean(
                translation.market,
              ),
          )
          .map(
            (translation) => ({
              product,
              translation,
            }),
          ),
    );

  const productsWithAnyEn =
    states.filter(
      ({state}) =>
        state.translations.length >
        0,
    );

  const productsMissingEn =
    states.filter(
      ({state}) =>
        state.translations.length ===
        0,
    );

  if (
    globalRecords.length !== 1
  ) {
    throw new Error(
      `Expected exactly 1 existing GLOBAL EN translation, found ${globalRecords.length}.`,
    );
  }

  if (
    productsWithAnyEn.length !== 1
  ) {
    throw new Error(
      `Expected exactly 1 product with an EN translation, found ${productsWithAnyEn.length}.`,
    );
  }

  if (
    productsMissingEn.length !== 103
  ) {
    throw new Error(
      `Expected exactly 103 products without EN Product Info, found ${productsMissingEn.length}.`,
    );
  }

  if (
    marketSpecificRecords.length !==
    0
  ) {
    throw new Error(
      `Expected zero market-specific EN translations, found ${marketSpecificRecords.length}.`,
    );
  }

  /*
   * Lock existing translation to the exact
   * product found in the read-only audit.
   */
  const existingGlobal =
    globalRecords[0];

  if (
    existingGlobal.product.handle !==
    'fototapete-koi-mit-lotusbluten'
  ) {
    throw new Error(
      `Unexpected product owns existing EN translation: ${existingGlobal.product.handle}`,
    );
  }

  if (
    existingGlobal.translation.outdated !==
    true
  ) {
    throw new Error(
      'Existing Koi EN translation is no longer outdated. State changed since audit.',
    );
  }

  /*
   * STEP 3
   * Resolve the exact two test products.
   */
  const testEntries =
    TEST_HANDLES.map(
      (handle) => {
        const entry =
          states.find(
            ({product}) =>
              product.handle ===
              handle,
          );

        if (!entry) {
          throw new Error(
            `TEST-2 product not found: ${handle}`,
          );
        }

        return entry;
      },
    );

  const koiEntry =
    testEntries.find(
      ({product}) =>
        product.handle ===
        'fototapete-koi-mit-lotusbluten',
    );

  const sixTwoEntry =
    testEntries.find(
      ({product}) =>
        product.handle ===
        '6-2',
    );

  if (
    !koiEntry ||
    !sixTwoEntry
  ) {
    throw new Error(
      'TEST-2 identity lock failed.',
    );
  }

  if (
    koiEntry.state.translations.length !==
    1
  ) {
    throw new Error(
      'Koi must have exactly one existing EN translation before test write.',
    );
  }

  if (
    koiEntry.state.translations[0].market
  ) {
    throw new Error(
      'Koi existing EN translation is unexpectedly market-specific.',
    );
  }

  if (
    koiEntry.state.translations[0].outdated !==
    true
  ) {
    throw new Error(
      'Koi existing EN translation must be outdated before test write.',
    );
  }

  if (
    sixTwoEntry.state.translations.length !==
    0
  ) {
    throw new Error(
      '6-2 must have no EN Product Info translation before test write.',
    );
  }

  /*
   * STEP 4
   * Back up ALL 104 current translation states.
   */
  const backupPath =
    writeJson(
      'product-info-en-test2-before',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        collection:
          info,

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

          existingGlobalEn:
            globalRecords.length,

          missingEn:
            productsMissingEn.length,

          marketSpecificEn:
            marketSpecificRecords.length,
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

TOTAL PRODUCTS         : 104
GERMAN SOURCE CORRECT  : 104
EXISTING GLOBAL EN     : 1
MISSING EN             : 103
MARKET-SPECIFIC EN     : 0

Exactly these 2 translations will change:

1. fototapete-koi-mit-lotusbluten
   Existing outdated GLOBAL EN will be updated.

2. 6-2
   Missing GLOBAL EN will be created.

Backup of ALL 104 current translation states:
${backupPath}

No German metafield value will be changed.
No product, variant, price, SKU, title, handle or image will be changed.
Only GLOBAL English translation key "value" for these 2 metafields will be written.
`);

  console.log(
    '\nTARGET ENGLISH PRODUCT INFO:\n',
  );

  console.log(
    'Each wall mural is custom-made to your exact dimensions. In the configurator, you can choose from four high-quality materials – to suit your room, wall surface, and requirements.\n',
  );

  console.log(
    'Smooth — is our affordable non-woven wallpaper with a smooth, matte surface and high-quality print reproduction...',
  );

  console.log(
    'Fine Embossing — is a high-quality non-woven wallpaper with a finely embossed, matte surface...',
  );

  console.log(
    'Self-Adhesive — is ideal for smooth surfaces and requires no wallpaper paste...',
  );

  console.log(
    'Seamless — is our high-quality textile wallpaper for a particularly uniform wall finish...\n',
  );

  /*
   * STEP 5
   * Explicit human confirmation.
   */
  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE 2 EN PRODUCT INFO to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE 2 EN PRODUCT INFO'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  /*
   * STEP 6
   * Write each product individually.
   *
   * No marketId is supplied:
   * these are GLOBAL translations.
   *
   * Each write uses the current source digest
   * returned immediately above.
   */
  for (
    const entry
    of testEntries
  ) {
    const {
      product,
      state,
    } = entry;

    console.log(
      `\nWriting EN translation: ${product.handle}`,
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
        `Expected exactly 1 returned translation for ${product.handle}, got ${result.translations?.length ?? 0}.`,
      );
    }

    writesCompleted += 1;

    /*
     * STEP 7
     * Immediately re-read Shopify.
     */
    await sleep(250);

    const fresh =
      await getTranslationState(
        product,
      );

    /*
     * German source must not have changed.
     */
    if (
      fresh.source.digest !==
      state.source.digest
    ) {
      throw new Error(
        `German source digest changed unexpectedly for ${product.handle}.`,
      );
    }

    if (
      !richTextEquals(
        fresh.source.value,
        EXPECTED_GERMAN_RICH_TEXT,
      )
    ) {
      throw new Error(
        `German source changed unexpectedly for ${product.handle}.`,
      );
    }

    /*
     * We expect exactly one EN translation,
     * global, current and equal to target.
     */
    if (
      fresh.translations.length !==
      1
    ) {
      throw new Error(
        `Expected exactly one EN translation after write for ${product.handle}, found ${fresh.translations.length}.`,
      );
    }

    const translation =
      fresh.translations[0];

    if (
      translation.key !==
      'value'
    ) {
      throw new Error(
        `Unexpected translation key after write for ${product.handle}: ${translation.key}`,
      );
    }

    if (
      translation.locale !==
      TARGET_LOCALE
    ) {
      throw new Error(
        `Unexpected translation locale after write for ${product.handle}: ${translation.locale}`,
      );
    }

    if (
      translation.market
    ) {
      throw new Error(
        `Translation became market-specific unexpectedly for ${product.handle}.`,
      );
    }

    if (
      translation.outdated !==
      false
    ) {
      throw new Error(
        `Translation is still marked outdated after write for ${product.handle}.`,
      );
    }

    if (
      !richTextEquals(
        translation.value,
        TARGET_ENGLISH_RICH_TEXT,
      )
    ) {
      throw new Error(
        `English translation value verification failed for ${product.handle}.`,
      );
    }

    console.log(
      `Verified: ${product.handle}`,
    );
  }

  /*
   * STEP 8
   * Final read of both test products.
   */
  const finalTestStates = [];

  for (
    const entry
    of testEntries
  ) {
    const fresh =
      await getTranslationState(
        entry.product,
      );

    if (
      fresh.translations.length !==
      1
    ) {
      throw new Error(
        `Final verification failed: ${entry.product.handle} does not have exactly one EN translation.`,
      );
    }

    const translation =
      fresh.translations[0];

    if (
      translation.market ||
      translation.outdated !==
        false ||
      !richTextEquals(
        translation.value,
        TARGET_ENGLISH_RICH_TEXT,
      )
    ) {
      throw new Error(
        `Final verification failed for ${entry.product.handle}.`,
      );
    }

    finalTestStates.push({
      productId:
        entry.product.id,

      handle:
        entry.product.handle,

      metafieldId:
        entry.product.metafield.id,

      source:
        fresh.source,

      translation,
    });
  }

  const afterPath =
    writeJson(
      'product-info-en-test2-after',
      {
        generatedAt:
          new Date().toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        targetLocale:
          TARGET_LOCALE,

        targetScope:
          'GLOBAL',

        testProducts:
          finalTestStates,
      },
    );

  console.log(`
TEST-2 EN TRANSLATION MIGRATION COMPLETE.

Written and verified:

fototapete-koi-mit-lotusbluten
6-2

2/2 GLOBAL English Product Info translations match the exact target rich-text value.

Both translations:
- locale = en
- key = value
- GLOBAL
- outdated = false
- German source unchanged
- source digest unchanged

After snapshot:
${afterPath}

NOW STOP.

Manually verify BOTH products in:

1. Shopify Translate & Adapt
2. Live /en storefront

Check:
- paragraph spacing
- Smooth is bold
- Fine Embossing is bold
- Self-Adhesive is bold
- Seamless is bold
- only four materials appear
- no old Standard / Premium / Premium Vinyl / Airtex Exclusive text remains

Do not run a remaining-102 migration until these two are visually confirmed.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nTEST-2 EN TRANSLATION MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(
      `\nSuccessful translation writes before failure: ${writesCompleted}/2`,
    );

    if (
      writesCompleted === 0
    ) {
      console.error(
        '\nNo translation writes completed.',
      );
    } else {
      console.error(`
IMPORTANT:
At least one translation was successfully written before the failure.

DO NOT blindly rerun this script.
First run the read-only audit again and inspect current state.
`);
    }

    process.exitCode = 1;
  },
);