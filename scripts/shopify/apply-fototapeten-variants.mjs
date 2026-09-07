import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const API_VERSION =
  process.env.SHOPIFY_ADMIN_API_VERSION || '2026-07';

const COLLECTION_HANDLE =
  process.env.SHOPIFY_FOTOTAPETEN_COLLECTION_HANDLE ||
  'fototapeten';

const REFERENCE_HANDLE = '8-3';

/**
 * İLK TESTTE SADECE BU 5 ÜRÜN DEĞİŞİR.
 */
const TEST_HANDLES = [
  '0-base',
  '7-3',
  '6-3',
  '5-3',
  '4-3',
];

const SHOP = (
  process.env.PUBLIC_STORE_DOMAIN || ''
)
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');

const CLIENT_ID = (
  process.env.SHOPIFY_MIGRATION_CLIENT_ID || ''
).trim();

const CLIENT_SECRET = (
  process.env.SHOPIFY_MIGRATION_CLIENT_SECRET || ''
).trim();

const OLD_VARIANTS = [
  'Standard',
  'Premium',
  'Premium Vinyl',
  'Selbstklebend',
  'Airtex Exklusiv',
];

const TARGET_ORDER = [
  'Glatt',
  'Feinprägung',
  'Selbstklebend',
  'Nahtlos',
];

const MIGRATION = {
  Standard: {
    newName: 'Glatt',
    price: '23.00',
    sku: '20-234.1-3',
  },

  Premium: {
    newName: 'Feinprägung',
    price: '34.00',
    sku: '20-139.1-3',
  },

  Selbstklebend: {
    newName: 'Selbstklebend',
    price: '39.00',
    sku: '20-140.1-3',
  },

  'Airtex Exklusiv': {
    newName: 'Nahtlos',
    price: '45.00',
    sku: '20-331.1-3',
  },
};

const DELETE_NAME = 'Premium Vinyl';

const START_CONFIRM =
  'MIGRATE-5-WANDINI';

const DELETE_CONFIRM =
  'DELETE-PREMIUM-VINYL-5';

/**
 * ENV SAFETY
 */
if (
  !SHOP ||
  !CLIENT_ID ||
  !CLIENT_SECRET
) {
  console.error(`
Missing Shopify credentials.

Expected in .env:

PUBLIC_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_MIGRATION_CLIENT_ID=...
SHOPIFY_MIGRATION_CLIENT_SECRET=...
`);

  process.exit(1);
}

if (
  !SHOP.endsWith(
    '.myshopify.com',
  )
) {
  console.error(
    `PUBLIC_STORE_DOMAIN must be *.myshopify.com. Received: ${SHOP}`,
  );

  process.exit(1);
}

if (
  new Set(TEST_HANDLES).size !==
  TEST_HANDLES.length
) {
  throw new Error(
    'TEST_HANDLES contains duplicates.',
  );
}

if (
  TEST_HANDLES.includes(
    REFERENCE_HANDLE,
  )
) {
  throw new Error(
    'REFERENCE_HANDLE must never be in TEST_HANDLES.',
  );
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

let deletePhaseStarted =
  false;

/**
 * AUTH
 */
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

        body: new URLSearchParams(
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

        `Body: ${
          rawBody ||
          '(empty)'
        }`,
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

  /**
   * HARD WRITE SCOPE LOCK
   */
  if (
    !grantedScopes.includes(
      'write_products',
    )
  ) {
    throw new Error(
      `write_products scope is required. Granted: ${grantedScopes.join(
        ', ',
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

/**
 * GRAPHQL
 */
async function graphql(
  query,
  variables = {},
  attempt = 1,
) {
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

        body: JSON.stringify(
          {
            query,
            variables,
          },
        ),
      },
    );

  if (
    response.status ===
      429 &&
    attempt <= 5
  ) {
    const waitMs =
      Math.min(
        1000 * attempt,
        5000,
      );

    await sleep(waitMs);

    return graphql(
      query,
      variables,
      attempt + 1,
    );
  }

  const rawBody =
    await response.text();

  let body;

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

/**
 * COLLECTION QUERY
 */
const COLLECTION_QUERY = `#graphql
  query TestCollection(
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

/**
 * PRODUCT QUERY
 */
const PRODUCT_QUERY = `#graphql
  query ProductForMigration(
    $id: ID!
  ) {
    product(id: $id) {
      id
      title
      handle

      options {
        id
        name
        values
      }

      variants(
        first: 20
        sortKey: POSITION
      ) {
        nodes {
          id
          title
          price
          sku

          selectedOptions {
            name
            value
          }

          metafield(
            namespace: "custom"
            key: "print_quality"
          ) {
            id
            type
            value
          }
        }
      }
    }
  }
`;

/**
 * UPDATE:
 *
 * SADECE
 * - option value
 * - price
 * - SKU
 *
 * metafields INPUT'A DAHİ GİRMİYOR.
 */
const UPDATE_MUTATION = `#graphql
  mutation UpdateWallpaperVariants(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId
      variants: $variants
      allowPartialUpdates: false
    ) {
      productVariants {
        id
        title
        price
        sku
      }

      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * PREMIUM VINYL DELETE
 */
const DELETE_MUTATION = `#graphql
  mutation DeletePremiumVinyl(
    $productId: ID!
    $variantsIds: [ID!]!
  ) {
    productVariantsBulkDelete(
      productId: $productId
      variantsIds: $variantsIds
    ) {
      product {
        id
        title
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
      await graphql(
        COLLECTION_QUERY,
        {
          handle:
            COLLECTION_HANDLE,

          after,
        },
      );

    const collection =
      data
        ?.collectionByIdentifier;

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
      ...collection.products
        .nodes,
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

async function getProduct(
  id,
) {
  const data =
    await graphql(
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

function qualityValue(
  variant,
) {
  return variant
    .selectedOptions
    ?.find(
      (option) =>
        option.name
          .toLowerCase() ===
        'quality',
    )
    ?.value;
}

function variantByQuality(
  product,
  value,
) {
  return product
    .variants
    .nodes
    .find(
      (variant) =>
        qualityValue(
          variant,
        ) === value,
    );
}

function exactOrder(
  product,
) {
  return product
    .variants
    .nodes
    .map(qualityValue);
}

function exactOldStructure(
  product,
) {
  return (
    product.options
      ?.length === 1 &&

    product.options[0]
      ?.name ===
      'Quality' &&

    JSON.stringify(
      exactOrder(product),
    ) ===
      JSON.stringify(
        OLD_VARIANTS,
      )
  );
}

function normalizePrice(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number.toFixed(2)
    : String(value ?? '');
}

function isTargetCorrect(
  product,
) {
  if (
    product.options
      ?.length !== 1 ||
    product.options[0]
      ?.name !==
      'Quality'
  ) {
    return false;
  }

  /**
   * VARIANT ORDER
   */
  if (
    JSON.stringify(
      exactOrder(product),
    ) !==
    JSON.stringify(
      TARGET_ORDER,
    )
  ) {
    return false;
  }

  /**
   * OPTION VALUES ORDER
   */
  if (
    JSON.stringify(
      product.options[0]
        ?.values || [],
    ) !==
    JSON.stringify(
      TARGET_ORDER,
    )
  ) {
    return false;
  }

  return TARGET_ORDER.every(
    (name) => {
      const variant =
        variantByQuality(
          product,
          name,
        );

      const expected =
        Object.values(
          MIGRATION,
        ).find(
          (item) =>
            item.newName ===
            name,
        );

      return (
        variant &&

        normalizePrice(
          variant.price,
        ) ===
          expected.price &&

        String(
          variant.sku ??
            '',
        ) ===
          expected.sku
      );
    },
  );
}

function referenceMap(
  reference,
) {
  return Object.fromEntries(
    TARGET_ORDER.map(
      (name) => {
        const variant =
          variantByQuality(
            reference,
            name,
          );

        return [
          name,

          variant
            ?.metafield
            ?.value ??
            null,
        ];
      },
    ),
  );
}

function validateOldMetafields(
  product,
  refMap,
) {
  for (
    const [
      oldName,
      target,
    ]
    of Object.entries(
      MIGRATION,
    )
  ) {
    const variant =
      variantByQuality(
        product,
        oldName,
      );

    if (
      !variant
        ?.metafield
        ?.value
    ) {
      throw new Error(
        `${product.handle}: ${oldName} has no custom.print_quality metafield.`,
      );
    }

    if (
      variant
        .metafield
        .value !==
      refMap[
        target.newName
      ]
    ) {
      throw new Error(
        `${product.handle}: ${oldName} metafield does not match reference ${target.newName}.`,
      );
    }
  }
}

function snapshotProduct(
  product,
) {
  return {
    id:
      product.id,

    title:
      product.title,

    handle:
      product.handle,

    options:
      product.options,

    variants:
      product
        .variants
        .nodes
        .map(
          (variant) => ({
            id:
              variant.id,

            quality:
              qualityValue(
                variant,
              ),

            title:
              variant.title,

            price:
              normalizePrice(
                variant.price,
              ),

            sku:
              variant.sku ??
              '',

            metafield:
              variant.metafield
                ? {
                    id:
                      variant
                        .metafield
                        .id,

                    type:
                      variant
                        .metafield
                        .type,

                    value:
                      variant
                        .metafield
                        .value,
                  }
                : null,
          }),
        ),
  };
}

function oldVariantSnapshot(
  snapshot,
  oldName,
) {
  return snapshot
    .variants
    .find(
      (variant) =>
        variant.quality ===
        oldName,
    );
}

/**
 * UPDATE SONRASI,
 * DELETE ÖNCESİ KONTROL.
 *
 * 5 VARIANT HALA VAR.
 */
function verifyIntermediate(
  product,
  before,
) {
  const expectedOrder = [
    'Glatt',
    'Feinprägung',
    'Premium Vinyl',
    'Selbstklebend',
    'Nahtlos',
  ];

  if (
    JSON.stringify(
      exactOrder(product),
    ) !==
    JSON.stringify(
      expectedOrder,
    )
  ) {
    throw new Error(
      `${product.handle}: intermediate variant order/state mismatch: ${exactOrder(
        product,
      ).join(' / ')}`,
    );
  }

  for (
    const [
      oldName,
      target,
    ]
    of Object.entries(
      MIGRATION,
    )
  ) {
    const old =
      oldVariantSnapshot(
        before,
        oldName,
      );

    const now =
      variantByQuality(
        product,
        target.newName,
      );

    if (!old || !now) {
      throw new Error(
        `${product.handle}: missing retained variant ${oldName}/${target.newName}.`,
      );
    }

    /**
     * VARIANT ID MUTLAKA AYNI
     */
    if (
      now.id !==
      old.id
    ) {
      throw new Error(
        `${product.handle}: variant ID changed for ${oldName} -> ${target.newName}.`,
      );
    }

    if (
      normalizePrice(
        now.price,
      ) !==
      target.price
    ) {
      throw new Error(
        `${product.handle}: wrong price for ${target.newName}.`,
      );
    }

    if (
      String(
        now.sku ?? '',
      ) !==
      target.sku
    ) {
      throw new Error(
        `${product.handle}: wrong SKU for ${target.newName}.`,
      );
    }

    /**
     * METAFIELD ID + VALUE MUTLAKA AYNI
     */
    if (
      now.metafield?.id !==
        old.metafield?.id ||
      now.metafield?.value !==
        old.metafield?.value
    ) {
      throw new Error(
        `${product.handle}: metafield changed for ${oldName} -> ${target.newName}.`,
      );
    }
  }

  /**
   * PREMIUM VINYL'A
   * HENÜZ DOKUNULMAMIŞ OLMALI.
   */
  const oldPremiumVinyl =
    oldVariantSnapshot(
      before,
      DELETE_NAME,
    );

  const nowPremiumVinyl =
    variantByQuality(
      product,
      DELETE_NAME,
    );

  if (
    !oldPremiumVinyl ||
    !nowPremiumVinyl ||
    nowPremiumVinyl.id !==
      oldPremiumVinyl.id
  ) {
    throw new Error(
      `${product.handle}: Premium Vinyl changed before delete phase.`,
    );
  }
}

/**
 * FINAL VERIFY
 */
function verifyFinal(
  product,
  before,
  reference,
) {
  if (
    !isTargetCorrect(
      product,
    )
  ) {
    throw new Error(
      `${product.handle}: final names/order/prices/SKUs do not match target.`,
    );
  }

  if (
    variantByQuality(
      product,
      DELETE_NAME,
    )
  ) {
    throw new Error(
      `${product.handle}: Premium Vinyl still exists.`,
    );
  }

  /**
   * OPTION ORDER 8-3 İLE AYNI
   */
  if (
    JSON.stringify(
      product.options[0]
        ?.values || [],
    ) !==
    JSON.stringify(
      reference.options[0]
        ?.values || [],
    )
  ) {
    throw new Error(
      `${product.handle}: final Quality option values/order differs from reference ${REFERENCE_HANDLE}.`,
    );
  }

  for (
    const [
      oldName,
      target,
    ]
    of Object.entries(
      MIGRATION,
    )
  ) {
    const old =
      oldVariantSnapshot(
        before,
        oldName,
      );

    const now =
      variantByQuality(
        product,
        target.newName,
      );

    const ref =
      variantByQuality(
        reference,
        target.newName,
      );

    if (
      now.id !==
      old.id
    ) {
      throw new Error(
        `${product.handle}: retained ID changed for ${target.newName}.`,
      );
    }

    if (
      now.metafield?.id !==
        old.metafield?.id ||
      now.metafield?.value !==
        old.metafield?.value
    ) {
      throw new Error(
        `${product.handle}: retained metafield changed for ${target.newName}.`,
      );
    }

    if (
      now.metafield?.value !==
      ref.metafield?.value
    ) {
      throw new Error(
        `${product.handle}: final metafield mapping differs from reference for ${target.newName}.`,
      );
    }
  }
}

/**
 * UPDATE ONLY
 */
async function updateProduct(
  product,
) {
  const qualityOption =
    product.options.find(
      (option) =>
        option.name ===
        'Quality',
    );

  if (
    !qualityOption?.id
  ) {
    throw new Error(
      `${product.handle}: Quality option ID missing.`,
    );
  }

  const variants =
    Object.entries(
      MIGRATION,
    ).map(
      ([
        oldName,
        target,
      ]) => {
        const variant =
          variantByQuality(
            product,
            oldName,
          );

        if (!variant) {
          throw new Error(
            `${product.handle}: missing ${oldName}.`,
          );
        }

        return {
          id:
            variant.id,

          price:
            Number(
              target.price,
            ),

          inventoryItem: {
            sku:
              target.sku,
          },

          optionValues: [
            {
              name:
                target.newName,

              optionId:
                qualityOption.id,
            },
          ],

          /**
           * METAFIELDS YOK.
           *
           * Bilerek hiçbir
           * metafield input'u
           * göndermiyoruz.
           */
        };
      },
    );

  const data =
    await graphql(
      UPDATE_MUTATION,
      {
        productId:
          product.id,

        variants,
      },
    );

  const result =
    data
      ?.productVariantsBulkUpdate;

  if (!result) {
    throw new Error(
      `${product.handle}: update mutation returned no payload.`,
    );
  }

  if (
    result.userErrors
      ?.length
  ) {
    throw new Error(
      `${product.handle}: update userErrors: ${JSON.stringify(
        result.userErrors,
      )}`,
    );
  }
}

/**
 * DELETE ONLY
 */
async function deletePremiumVinyl(
  productId,
  premiumVinylVariantId,
  handle,
) {
  const data =
    await graphql(
      DELETE_MUTATION,
      {
        productId,

        variantsIds: [
          premiumVinylVariantId,
        ],
      },
    );

  const result =
    data
      ?.productVariantsBulkDelete;

  if (!result) {
    throw new Error(
      `${handle}: delete mutation returned no payload.`,
    );
  }

  if (
    result.userErrors
      ?.length
  ) {
    throw new Error(
      `${handle}: delete userErrors: ${JSON.stringify(
        result.userErrors,
      )}`,
    );
  }
}

/**
 * MANUAL SAFETY CONFIRMATION
 */
async function confirmExact(
  promptText,
  expected,
) {
  const rl =
    readline.createInterface(
      {
        input,
        output,
      },
    );

  try {
    const answer =
      await rl.question(
        `${promptText}\nType exactly: ${expected}\n> `,
      );

    if (
      answer.trim() !==
      expected
    ) {
      throw new Error(
        'Confirmation phrase did not match. Aborting.',
      );
    }
  } finally {
    rl.close();
  }
}

/**
 * MAIN
 */
async function main() {
  console.log(`
WANDINI
Fototapeten TEST-5 migration

Shop: ${SHOP}
Collection: ${COLLECTION_HANDLE}
Reference: ${REFERENCE_HANDLE}

Test handles:
${TEST_HANDLES.join('\n')}
`);

  await getAdminAccessToken();

  const {
    info,
    products: stubs,
  } =
    await getCollectionProducts();

  console.log(
    `Collection: ${info.title} (${info.handle}) | products: ${stubs.length}`,
  );

  const requiredHandles = [
    REFERENCE_HANDLE,
    ...TEST_HANDLES,
  ];

  const missing =
    requiredHandles.filter(
      (handle) =>
        !stubs.some(
          (product) =>
            product.handle ===
            handle,
        ),
    );

  if (missing.length) {
    throw new Error(
      `Required handle(s) not in collection: ${missing.join(
        ', ',
      )}`,
    );
  }

  /**
   * READ REFERENCE + TEST 5
   */
  const details =
    new Map();

  for (
    const handle
    of requiredHandles
  ) {
    const stub =
      stubs.find(
        (product) =>
          product.handle ===
          handle,
      );

    details.set(
      handle,
      await getProduct(
        stub.id,
      ),
    );
  }

  /**
   * 8-3 HARD CHECK
   */
  const reference =
    details.get(
      REFERENCE_HANDLE,
    );

  if (
    !isTargetCorrect(
      reference,
    )
  ) {
    throw new Error(
      `Reference ${REFERENCE_HANDLE} is not exactly the expected target state.`,
    );
  }

  const refMap =
    referenceMap(
      reference,
    );

  if (
    Object.values(
      refMap,
    ).some(
      (value) =>
        !value,
    )
  ) {
    throw new Error(
      `Reference ${REFERENCE_HANDLE} has a missing custom.print_quality metafield.`,
    );
  }

  const targets =
    TEST_HANDLES.map(
      (handle) =>
        details.get(
          handle,
        ),
    );

  /**
   * TÜM 5 ÜRÜNÜ
   * WRITE'TAN ÖNCE KONTROL ET.
   */
  for (
    const product
    of targets
  ) {
    if (
      !exactOldStructure(
        product,
      )
    ) {
      throw new Error(
        `${product.handle}: not in exact old 5-variant state. ABORT before any write.`,
      );
    }

    validateOldMetafields(
      product,
      refMap,
    );
  }

  /**
   * BACKUP BEFORE WRITE
   */
  const backupDir =
    path.resolve(
      'migration-backups',
    );

  fs.mkdirSync(
    backupDir,
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

  const backupPath =
    path.join(
      backupDir,
      `fototapeten-test5-before-${timestamp}.json`,
    );

  const beforeSnapshots =
    Object.fromEntries(
      targets.map(
        (product) => [
          product.handle,

          snapshotProduct(
            product,
          ),
        ],
      ),
    );

  fs.writeFileSync(
    backupPath,

    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        shop:
          SHOP,

        collection:
          info,

        reference:
          snapshotProduct(
            reference,
          ),

        testHandles:
          TEST_HANDLES,

        products:
          beforeSnapshots,
      },

      null,
      2,
    ),

    'utf8',
  );

  console.log(`
PREWRITE CHECK CLEAN.

Backup:
${backupPath}

No metafield write exists in this script.

Planned mapping:

Standard -> Glatt
€23.00
20-234.1-3

Premium -> Feinprägung
€34.00
20-139.1-3

Selbstklebend
€39.00
20-140.1-3

Airtex Exklusiv -> Nahtlos
€45.00
20-331.1-3

Premium Vinyl -> DELETE
`);

  /**
   * FIRST HUMAN CONFIRMATION
   */
  await confirmExact(
    'Start phase 1: update names/prices/SKUs on exactly 5 products?',
    START_CONFIRM,
  );

  /**
   * PHASE 1:
   *
   * UPDATE ALL 5.
   * NO DELETE YET.
   */
  console.log(
    '\nPHASE 1: updating retained 4 variants on all 5 products...',
  );

  for (
    const product
    of targets
  ) {
    process.stdout.write(
      `  ${product.handle} ... `,
    );

    await updateProduct(
      product,
    );

    console.log(
      'UPDATED',
    );

    await sleep(150);
  }

  /**
   * PHASE 1 VERIFY.
   *
   * ALL 5 MUST PASS
   * BEFORE DELETE IS EVEN OFFERED.
   */
  console.log(
    '\nPHASE 1 VERIFY: re-reading all 5 products...',
  );

  const intermediateProducts =
    new Map();

  for (
    const original
    of targets
  ) {
    const now =
      await getProduct(
        original.id,
      );

    verifyIntermediate(
      now,
      beforeSnapshots[
        original.handle
      ],
    );

    intermediateProducts.set(
      original.handle,
      now,
    );

    console.log(
      `  ${original.handle}: IDs/metafields/prices/SKUs OK; Premium Vinyl still present`,
    );
  }

  console.log(`
All 5 updates verified.

NO Premium Vinyl delete
has happened yet.
`);

  /**
   * SECOND HUMAN CONFIRMATION
   */
  await confirmExact(
    'Start phase 2: delete only Premium Vinyl from these same 5 products?',
    DELETE_CONFIRM,
  );

  deletePhaseStarted =
    true;

  /**
   * PHASE 2
   */
  console.log(
    '\nPHASE 2: deleting Premium Vinyl...',
  );

  for (
    const handle
    of TEST_HANDLES
  ) {
    const product =
      intermediateProducts.get(
        handle,
      );

    const before =
      beforeSnapshots[
        handle
      ];

    const premiumVinyl =
      oldVariantSnapshot(
        before,
        DELETE_NAME,
      );

    /**
     * HEMEN DELETE ÖNCESİ
     * TEKRAR OKU + VERIFY.
     */
    const fresh =
      await getProduct(
        product.id,
      );

    verifyIntermediate(
      fresh,
      before,
    );

    process.stdout.write(
      `  ${handle} ... `,
    );

    await deletePremiumVinyl(
      product.id,
      premiumVinyl.id,
      handle,
    );

    console.log(
      'DELETED',
    );

    await sleep(150);
  }

  /**
   * FINAL VERIFY
   */
  console.log(
    '\nFINAL VERIFY...',
  );

  const afterSnapshots =
    {};

  for (
    const original
    of targets
  ) {
    const finalProduct =
      await getProduct(
        original.id,
      );

    verifyFinal(
      finalProduct,

      beforeSnapshots[
        original.handle
      ],

      reference,
    );

    afterSnapshots[
      original.handle
    ] =
      snapshotProduct(
        finalProduct,
      );

    console.log(
      `  ${original.handle}: FINAL OK`,
    );
  }

  const afterPath =
    path.join(
      backupDir,

      `fototapeten-test5-after-${timestamp}.json`,
    );

  fs.writeFileSync(
    afterPath,

    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        shop:
          SHOP,

        reference:
          snapshotProduct(
            reference,
          ),

        products:
          afterSnapshots,
      },

      null,
      2,
    ),

    'utf8',
  );

  console.log(`
TEST-5 MIGRATION COMPLETE.

Changed exactly:
${TEST_HANDLES.join('\n')}

Reference untouched:
${REFERENCE_HANDLE}

Before backup:
${backupPath}

After snapshot:
${afterPath}

NEXT:

Run the READ-ONLY audit again.

Expected:

SAFE OLD = 98
ALREADY CORRECT = 6
BLOCKED = 0
UNEXPECTED = 0
`);
}

main().catch(
  (error) => {
    console.error(
      '\nMIGRATION STOPPED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    if (
      !deletePhaseStarted
    ) {
      console.error(`
Delete phase had NOT started.

Premium Vinyl was not deleted
by this run.
`);
    } else {
      console.error(`
Delete phase had started.

Do not rerun anything yet.

Run the READ-ONLY audit
and send me the output.
`);
    }

    process.exitCode = 1;
  },
);