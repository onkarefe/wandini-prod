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
const EXPECTED_ALREADY_CORRECT = 2;
const EXPECTED_REMAINING = 102;

const TEST_HANDLES = new Set([
  'fototapete-koi-mit-lotusbluten',
  '6-2',
]);

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

  const sourceValues =
    (
      resource.translatableContent ||
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

  const translations =
    resource.translations || [];

  const unexpectedKeys =
    translations.filter(
      (translation) =>
        translation.key !==
        'value',
    );

  if (
    unexpectedKeys.length > 0
  ) {
    throw new Error(
      `Unexpected translation key on ${product.handle}.`,
    );
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

async function verifyExactTargetTranslation(
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
      `Expected exactly one EN translation for ${product.handle}, found ${fresh.translations.length}.`,
    );
  }

  const translation =
    fresh.translations[0];

  if (
    translation.key !==
    'value'
  ) {
    throw new Error(
      `Unexpected EN translation key on ${product.handle}: ${translation.key}`,
    );
  }

  if (
    translation.locale !==
    TARGET_LOCALE
  ) {
    throw new Error(
      `Unexpected EN locale on ${product.handle}: ${translation.locale}`,
    );
  }

  if (
    translation.market
  ) {
    throw new Error(
      `Unexpected market-specific EN translation on ${product.handle}.`,
    );
  }

  if (
    translation.outdated !==
    false
  ) {
    throw new Error(
      `EN translation is marked outdated on ${product.handle}.`,
    );
  }

  if (
    !richTextEquals(
      translation.value,
      TARGET_ENGLISH_RICH_TEXT,
    )
  ) {
    throw new Error(
      `EN translation value mismatch on ${product.handle}.`,
    );
  }

  return fresh;
}

async function main() {
  console.log(`
WANDINI
English Product Info REMAINING-102 migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Source:
${NAMESPACE}.${KEY}
locale = ${SOURCE_LOCALE}

Target:
locale = ${TARGET_LOCALE}
key = value
scope = GLOBAL

THIS SCRIPT CAN WRITE TRANSLATIONS.

Hard locks:
- collection total = 104
- German source exact match = 104/104
- already-correct GLOBAL EN = exactly 2
- remaining without EN = exactly 102
- market-specific EN = 0
- no unexpected EN values
`);

  /*
   * STEP 1
   * Read all 104 products and lock
   * the German source.
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
   * Re-read ALL translation states.
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
   * Classify every translation.
   */
  const marketSpecific =
    [];

  const alreadyCorrect =
    [];

  const missing =
    [];

  const unexpected =
    [];

  for (
    const entry
    of states
  ) {
    const {
      product,
      state,
    } = entry;

    const translations =
      state.translations;

    const marketTranslations =
      translations.filter(
        (translation) =>
          Boolean(
            translation.market,
          ),
      );

    if (
      marketTranslations.length >
      0
    ) {
      marketSpecific.push(
        entry,
      );

      continue;
    }

    if (
      translations.length ===
      0
    ) {
      missing.push(entry);

      continue;
    }

    if (
      translations.length !==
      1
    ) {
      unexpected.push({
        ...entry,
        reason:
          `Expected max one global EN translation, found ${translations.length}`,
      });

      continue;
    }

    const translation =
      translations[0];

    const exactTarget =
      translation.key ===
        'value' &&
      translation.locale ===
        TARGET_LOCALE &&
      !translation.market &&
      translation.outdated ===
        false &&
      richTextEquals(
        translation.value,
        TARGET_ENGLISH_RICH_TEXT,
      );

    if (exactTarget) {
      alreadyCorrect.push(
        entry,
      );
    } else {
      unexpected.push({
        ...entry,
        reason:
          'Existing EN translation does not equal approved target state.',
      });
    }
  }

  /*
   * Absolute state locks.
   */
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
    console.error(
      '\nUNEXPECTED EN STATES:\n',
    );

    for (
      const item
      of unexpected
    ) {
      console.error(
        `${item.product.handle} | ${item.reason}`,
      );
    }

    throw new Error(
      `Expected 0 unexpected EN translation states, found ${unexpected.length}.`,
    );
  }

  if (
    alreadyCorrect.length !==
    EXPECTED_ALREADY_CORRECT
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_ALREADY_CORRECT} already-correct GLOBAL EN translations, found ${alreadyCorrect.length}.`,
    );
  }

  if (
    missing.length !==
    EXPECTED_REMAINING
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_REMAINING} missing EN translations, found ${missing.length}.`,
    );
  }

  /*
   * Strong lock:
   * the 2 already-correct translations must
   * be exactly our manually verified test products.
   */
  const actualCorrectHandles =
    new Set(
      alreadyCorrect.map(
        ({product}) =>
          product.handle,
      ),
    );

  if (
    actualCorrectHandles.size !==
    TEST_HANDLES.size ||
    [...TEST_HANDLES].some(
      (handle) =>
        !actualCorrectHandles.has(
          handle,
        ),
    )
  ) {
    throw new Error(
      `Already-correct products are not exactly the verified TEST-2 handles.\nActual: ${[
        ...actualCorrectHandles,
      ].join(', ')}`,
    );
  }

  /*
   * STEP 4
   * Backup ALL current states before write.
   */
  const backupPath =
    writeJson(
      'product-info-en-remaining102-before',
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

          germanCorrect:
            products.length,

          alreadyCorrect:
            alreadyCorrect.length,

          remaining:
            missing.length,

          marketSpecific:
            marketSpecific.length,

          unexpected:
            unexpected.length,
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

TOTAL PRODUCTS          : ${products.length}
GERMAN SOURCE CORRECT   : ${products.length}
ALREADY CORRECT EN      : ${alreadyCorrect.length}
REMAINING TO CREATE     : ${missing.length}
MARKET-SPECIFIC EN      : ${marketSpecific.length}
UNEXPECTED EN STATES    : ${unexpected.length}

Already-correct TEST-2:
fototapete-koi-mit-lotusbluten
6-2

The remaining ${missing.length} products currently have NO English Product Info translation.

Backup of ALL 104 current translation states:
${backupPath}

Only GLOBAL English translation key "value"
for the remaining ${missing.length} custom.product_info metafields
will be created.

German source will not be written.
Products will not be written.
Variants will not be written.
Prices will not be written.
SKUs will not be written.
Titles will not be written.
Handles will not be written.
Images will not be written.
Other metafields will not be written.
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
      'Type exactly WRITE REMAINING 102 EN PRODUCT INFO to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE REMAINING 102 EN PRODUCT INFO'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  /*
   * STEP 6
   * Write 102 translations individually.
   *
   * Each product gets:
   * - its own resourceId
   * - its own live source digest
   *
   * No marketId = GLOBAL translation.
   */
  for (
    let i = 0;
    i < missing.length;
    i += 1
  ) {
    const entry =
      missing[i];

    const {
      product,
      state,
    } = entry;

    console.log(
      `\n[${i + 1}/${missing.length}] Writing: ${product.handle}`,
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
        `Expected exactly one returned translation for ${product.handle}, got ${result.translations?.length ?? 0}.`,
      );
    }

    writesCompleted += 1;

    /*
     * Immediate verification from Shopify.
     */
    await sleep(200);

    await verifyExactTargetTranslation(
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
   * Final full 104/104 verification.
   */
  console.log(
    '\nRunning FINAL 104/104 translation verification...',
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

    validateProduct(product);

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
        `Product Info metafield ID changed unexpectedly for ${product.handle}.`,
      );
    }

    const fresh =
      await verifyExactTargetTranslation(
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
      'product-info-en-remaining102-after',
      {
        generatedAt:
          new Date()
            .toISOString(),

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

          migratedThisRun:
            missing.length,

          previouslyCorrect:
            alreadyCorrect.length,

          finalCorrect:
            finalStates.length,
        },

        products:
          finalStates,
      },
    );

  console.log(`
================================================
FINAL EN PRODUCT INFO MIGRATION COMPLETE
================================================

Migrated this run : ${missing.length}
Previously correct: ${alreadyCorrect.length}
Correct total     : ${finalStates.length}

104/104 products now have the exact approved
GLOBAL English Product Info translation.

Every translation was re-read from Shopify.

Final guarantees:

- locale = en
- key = value
- scope = GLOBAL
- outdated = false
- exact English rich-text match = 104/104
- German Product Info unchanged = 104/104
- German source digests unchanged
- Product Info metafield IDs unchanged
- no market-specific EN translations created

After snapshot:
${afterPath}
`);
}

main().catch(
  (error) => {
    console.error(
      '\nREMAINING-102 EN TRANSLATION MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(
      `\nSuccessful translation writes before failure: ${writesCompleted}/${EXPECTED_REMAINING}`,
    );

    if (
      writesCompleted === 0
    ) {
      console.error(`
No English translation writes completed.
`);
    } else {
      console.error(`
IMPORTANT:

At least one translation was successfully written
before this failure.

DO NOT blindly rerun this script.

The hard locks are intentionally designed so a
partial migration will fail precheck on rerun.

Run the READ-ONLY translation audit first and
inspect the new current state before doing anything else.
`);
    }

    process.exitCode = 1;
  },
);