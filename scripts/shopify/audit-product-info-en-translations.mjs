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

const NAMESPACE = 'custom';
const KEY = 'product_info';
const TYPE = 'rich_text_field';

const SOURCE_LOCALE = 'de';
const TARGET_LOCALE = 'en';

const EXPECTED_TOTAL = 104;

const TEST2_HANDLES = [
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
  !SHOP.endsWith('.myshopify.com')
) {
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
      [
        'Could not obtain Shopify Admin access token.',
        `HTTP: ${response.status} ${response.statusText}`,
        `Body: ${raw || '(empty)'}`,
      ].join('\n'),
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

  /*
   * Shopify rule:
   * write permission includes read permission
   * for the same resource.
   *
   * Therefore either one is enough for
   * this READ-ONLY audit.
   */
  const hasTranslationReadAccess =
    grantedScopes.includes(
      'read_translations',
    ) ||
    grantedScopes.includes(
      'write_translations',
    );

  if (!hasTranslationReadAccess) {
    throw new Error(
      `Translation read access missing. Need read_translations or write_translations. Current scopes: ${grantedScopes.join(
        ',',
      )}`,
    );
  }

  return accessToken;
}

async function gql(
  query,
  variables = {},
  attempt = 1,
) {
  /*
   * HARD READ-ONLY GUARD
   *
   * Even though the token may have
   * write_translations, this file refuses
   * to execute any GraphQL mutation.
   */
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
  query ProductInfoTranslationAudit(
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

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map(stable)
      .join(',')}]`;
  }

  const keys =
    Object.keys(value).sort();

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
English Product Info translation audit

MODE: READ ONLY

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Metafield:
${NAMESPACE}.${KEY}

Source locale:
${SOURCE_LOCALE}

Target locale:
${TARGET_LOCALE}

NO SHOPIFY DATA WILL BE CHANGED.
`);

  /*
   * STEP 1
   * Read all products in Fototapeten.
   */
  const {
    info,
    products,
  } =
    await getCollectionProducts();

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

  /*
   * STEP 2
   * Verify every product still has exactly
   * the Product Info metafield we expect.
   *
   * Also verify German source value is
   * exactly the value we just migrated.
   */
  for (
    const product
    of products
  ) {
    if (
      !product.metafield
    ) {
      throw new Error(
        `Missing ${NAMESPACE}.${KEY}: ${product.handle}`,
      );
    }

    if (
      product
        .metafield
        .namespace !==
        NAMESPACE ||
      product
        .metafield
        .key !==
        KEY ||
      product
        .metafield
        .type !==
        TYPE ||
      !product
        .metafield
        .id
    ) {
      throw new Error(
        `Unexpected Product Info metafield identity/type on ${product.handle}.`,
      );
    }

    if (
      !richTextEquals(
        product
          .metafield
          .value,
        EXPECTED_GERMAN_RICH_TEXT,
      )
    ) {
      throw new Error(
        `German source Product Info does not match the approved value on ${product.handle}.`,
      );
    }
  }

  console.log(
    `104/104 German Product Info metafields match the approved source.\n`,
  );

  /*
   * STEP 3
   * Query Shopify's actual translation
   * resource for each metafield.
   */
  const results = [];

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

    const data =
      await gql(
        TRANSLATABLE_RESOURCE_QUERY,
        {
          resourceId:
            product
              .metafield
              .id,

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
          product
            .metafield
            .id,

        status:
          'RESOURCE_MISSING',

        sourceContent:
          [],

        translations:
          [],

        allTranslationKeys:
          [],
      });

      continue;
    }

    const sourceContent =
      resource
        .translatableContent ||
      [];

    const valueSources =
      sourceContent.filter(
        (item) =>
          item.key ===
          'value',
      );

    const allTranslations =
      resource
        .translations ||
      [];

    const valueTranslations =
      allTranslations.filter(
        (translation) =>
          translation.key ===
          'value',
      );

    const unexpectedKeys =
      allTranslations
        .filter(
          (translation) =>
            translation.key !==
            'value',
        )
        .map(
          (translation) =>
            translation.key,
        );

    let status =
      'OK';

    if (
      valueSources.length !== 1
    ) {
      status =
        'SOURCE_KEY_PROBLEM';
    } else if (
      !valueSources[0]
        .digest
    ) {
      status =
        'DIGEST_MISSING';
    } else if (
      valueSources[0]
        .locale !==
      SOURCE_LOCALE
    ) {
      status =
        'SOURCE_LOCALE_UNEXPECTED';
    } else if (
      !richTextEquals(
        valueSources[0]
          .value,
        EXPECTED_GERMAN_RICH_TEXT,
      )
    ) {
      status =
        'TRANSLATABLE_SOURCE_MISMATCH';
    }

    results.push({
      productId:
        product.id,

      handle:
        product.handle,

      title:
        product.title,

      metafieldId:
        product
          .metafield
          .id,

      status,

      sourceContent,

      translations:
        valueTranslations,

      allTranslationKeys:
        allTranslations.map(
          (translation) =>
            translation.key,
        ),

      unexpectedTranslationKeys:
        unexpectedKeys,
    });

    await sleep(75);
  }

  process.stdout.write(
    '\n',
  );

  /*
   * STEP 4
   * Classification.
   */

  const resourceMissing =
    results.filter(
      (item) =>
        item.status ===
        'RESOURCE_MISSING',
    );

  const sourceProblems =
    results.filter(
      (item) =>
        item.status !==
          'OK' &&
        item.status !==
          'RESOURCE_MISSING',
    );

  const foundAnyEnglish =
    results.filter(
      (item) =>
        item
          .translations
          .length > 0,
    );

  const missingEnglish =
    results.filter(
      (item) =>
        item
          .translations
          .length === 0,
    );

  const globalTranslations =
    results.flatMap(
      (item) =>
        item.translations
          .filter(
            (translation) =>
              !translation.market,
          )
          .map(
            (translation) => ({
              handle:
                item.handle,

              metafieldId:
                item.metafieldId,

              ...translation,
            }),
          ),
    );

  const marketSpecific =
    results.flatMap(
      (item) =>
        item.translations
          .filter(
            (translation) =>
              Boolean(
                translation.market,
              ),
          )
          .map(
            (translation) => ({
              handle:
                item.handle,

              metafieldId:
                item.metafieldId,

              ...translation,
            }),
          ),
    );

  const resourcesWithGlobal =
    results.filter(
      (item) =>
        item.translations.some(
          (translation) =>
            !translation.market,
        ),
    );

  const resourcesWithoutGlobal =
    results.filter(
      (item) =>
        !item.translations.some(
          (translation) =>
            !translation.market,
        ),
    );

  const globalCurrent =
    globalTranslations.filter(
      (translation) =>
        translation.outdated ===
        false,
    );

  const globalOutdated =
    globalTranslations.filter(
      (translation) =>
        translation.outdated ===
        true,
    );

  const wrongTranslationKeys =
    results.flatMap(
      (item) =>
        item
          .unexpectedTranslationKeys
          .map(
            (key) => ({
              handle:
                item.handle,
              metafieldId:
                item.metafieldId,
              key,
            }),
          ),
    );

  /*
   * STEP 5
   * Verify our two intended test products
   * actually exist in the current collection.
   */
  const test2 =
    TEST2_HANDLES.map(
      (handle) => {
        const item =
          results.find(
            (result) =>
              result.handle ===
              handle,
          );

        if (!item) {
          throw new Error(
            `TEST-2 product not found: ${handle}`,
          );
        }

        return item;
      },
    );

  /*
   * STEP 6
   * Print summary.
   */
  console.log(`
================ AUDIT RESULT ================

TOTAL PRODUCTS             : ${products.length}
TRANSLATABLE RESOURCES     : ${
    products.length -
    resourceMissing.length
  }
RESOURCE MISSING           : ${resourceMissing.length}
SOURCE PROBLEMS            : ${sourceProblems.length}

EN TRANSLATION FOUND       : ${foundAnyEnglish.length}
EN TRANSLATION MISSING     : ${missingEnglish.length}

GLOBAL EN FOUND            : ${resourcesWithGlobal.length}
GLOBAL EN MISSING          : ${resourcesWithoutGlobal.length}
GLOBAL EN CURRENT          : ${globalCurrent.length}
GLOBAL EN OUTDATED         : ${globalOutdated.length}

MARKET-SPECIFIC EN RECORDS : ${marketSpecific.length}
WRONG TRANSLATION KEYS     : ${wrongTranslationKeys.length}
`);

  if (
    resourceMissing.length >
    0
  ) {
    console.log(
      '\nRESOURCE MISSING:\n',
    );

    for (
      const item
      of resourceMissing
    ) {
      console.log(
        `${item.handle} | ${item.metafieldId}`,
      );
    }
  }

  if (
    sourceProblems.length >
    0
  ) {
    console.log(
      '\nSOURCE PROBLEMS:\n',
    );

    for (
      const item
      of sourceProblems
    ) {
      console.log(
        `${item.handle} | ${item.status}`,
      );
    }
  }

  if (
    marketSpecific.length >
    0
  ) {
    console.log(
      '\nMARKET-SPECIFIC EN TRANSLATIONS:\n',
    );

    for (
      const item
      of marketSpecific
    ) {
      console.log(
        `${item.handle} | ${
          item.market?.name ||
          item.market?.id
        } | outdated=${item.outdated}`,
      );
    }
  }

  if (
    wrongTranslationKeys.length >
    0
  ) {
    console.log(
      '\nUNEXPECTED TRANSLATION KEYS:\n',
    );

    for (
      const item
      of wrongTranslationKeys
    ) {
      console.log(
        `${item.handle} | key=${item.key}`,
      );
    }
  }

  /*
   * STEP 7
   * Show the exact two translations that
   * we'll later use for the write test.
   */
  console.log(
    '\n================ TEST-2 CURRENT EN VALUES ================\n',
  );

  for (
    const item
    of test2
  ) {
    console.log(
      `--- ${item.handle} ---`,
    );

    console.log(
      `Metafield GID: ${item.metafieldId}`,
    );

    const sourceValue =
      item.sourceContent.find(
        (entry) =>
          entry.key ===
          'value',
      );

    console.log(
      `Source locale: ${
        sourceValue?.locale ||
        '(missing)'
      }`,
    );

    console.log(
      `Digest: ${
        sourceValue?.digest ||
        '(missing)'
      }`,
    );

    if (
      item.translations.length ===
      0
    ) {
      console.log(
        'EN translation: (missing)',
      );
    } else {
      for (
        const translation
        of item.translations
      ) {
        console.log(
          `EN scope: ${
            translation.market
              ? `MARKET: ${
                  translation
                    .market
                    .name
                } (${
                  translation
                    .market
                    .id
                })`
              : 'GLOBAL'
          }`,
        );

        console.log(
          `Outdated: ${translation.outdated}`,
        );

        console.log(
          'Current EN value:',
        );

        console.log(
          translation.value,
        );
      }
    }

    console.log('');
  }

  /*
   * STEP 8
   * Save everything locally.
   */
  const auditPath =
    writeJson(
      'product-info-en-translation-audit',
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
          info,

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

        grantedScopes,

        summary: {
          totalProducts:
            products.length,

          translatableResources:
            products.length -
            resourceMissing.length,

          resourceMissing:
            resourceMissing.length,

          sourceProblems:
            sourceProblems.length,

          enTranslationFound:
            foundAnyEnglish.length,

          enTranslationMissing:
            missingEnglish.length,

          globalEnFound:
            resourcesWithGlobal.length,

          globalEnMissing:
            resourcesWithoutGlobal.length,

          globalEnCurrent:
            globalCurrent.length,

          globalEnOutdated:
            globalOutdated.length,

          marketSpecificRecords:
            marketSpecific.length,

          wrongTranslationKeys:
            wrongTranslationKeys.length,
        },

        test2Handles:
          TEST2_HANDLES,

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
   * Structural problems mean we do not
   * proceed to the write script.
   */
  if (
    resourceMissing.length >
      0 ||
    sourceProblems.length >
      0 ||
    wrongTranslationKeys.length >
      0
  ) {
    console.log(`
AUDIT HAS STRUCTURAL PROBLEMS.

DO NOT WRITE TRANSLATIONS YET.
`);

    process.exitCode = 2;

    return;
  }

  console.log(`
STRUCTURAL AUDIT CLEAN.

No translations were written.
Review current EN/global/market/outdated counts before proceeding.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nTRANSLATION AUDIT FAILED:\n',
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