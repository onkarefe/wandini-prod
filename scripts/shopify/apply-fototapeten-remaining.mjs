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

const EXPECTED_TOTAL = 104;
const EXPECTED_REMAINING_OLD = 98;
const EXPECTED_ALREADY_CORRECT = 6;

const EXPECTED_CORRECT_HANDLES = [
  '8-3',
  '0-base',
  '7-3',
  '6-3',
  '5-3',
  '4-3',
];

const SHOP = (process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');

const CLIENT_ID =
  (process.env.SHOPIFY_MIGRATION_CLIENT_ID || '').trim();

const CLIENT_SECRET =
  (process.env.SHOPIFY_MIGRATION_CLIENT_SECRET || '').trim();

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

const INTERMEDIATE_ORDER = [
  'Glatt',
  'Feinprägung',
  'Premium Vinyl',
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
  'MIGRATE-98-WANDINI';

const DELETE_CONFIRM =
  'DELETE-PREMIUM-VINYL-98';

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
  !SHOP.endsWith('.myshopify.com')
) {
  console.error(
    `PUBLIC_STORE_DOMAIN must be *.myshopify.com. Received: ${SHOP}`,
  );

  process.exit(1);
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

    console.log(
      `Shopify throttled request; retrying in ${waitMs}ms...`,
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

const COLLECTION_QUERY = `#graphql
  query MigrationCollection(
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
    .map(
      qualityValue,
    );
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

function expectedTargetForName(
  name,
) {
  return Object.values(
    MIGRATION,
  ).find(
    (item) =>
      item.newName ===
      name,
  );
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
        expectedTargetForName(
          name,
        );

      return (
        variant &&
        expected &&

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

function validateCorrectMetafields(
  product,
  refMap,
) {
  for (
    const name
    of TARGET_ORDER
  ) {
    const variant =
      variantByQuality(
        product,
        name,
      );

    if (
      !variant
        ?.metafield
        ?.value
    ) {
      throw new Error(
        `${product.handle}: ${name} has no custom.print_quality metafield.`,
      );
    }

    if (
      variant
        .metafield
        .value !==
      refMap[name]
    ) {
      throw new Error(
        `${product.handle}: ${name} metafield differs from reference ${REFERENCE_HANDLE}.`,
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

function verifyIntermediate(
  product,
  before,
) {
  if (
    JSON.stringify(
      exactOrder(product),
    ) !==
    JSON.stringify(
      INTERMEDIATE_ORDER,
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

    if (
      !old ||
      !now
    ) {
      throw new Error(
        `${product.handle}: missing retained variant ${oldName}/${target.newName}.`,
      );
    }

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
      !old ||
      !now ||
      !ref
    ) {
      throw new Error(
        `${product.handle}: final retained variant missing for ${target.newName}.`,
      );
    }

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

          // Intentionally NO metafields input.
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

async function main() {
  console.log(`
WANDINI
Fototapeten FINAL remaining migration

Shop: ${SHOP}
Collection: ${COLLECTION_HANDLE}
Reference: ${REFERENCE_HANDLE}

Expected current state:
Total = ${EXPECTED_TOTAL}
Remaining old = ${EXPECTED_REMAINING_OLD}
Already correct = ${EXPECTED_ALREADY_CORRECT}
`);

  await getAdminAccessToken();

  const {
    info,
    products: stubs,
  } =
    await getCollectionProducts();

  if (
    stubs.length !==
    EXPECTED_TOTAL
  ) {
    throw new Error(
      `Collection total changed. Expected ${EXPECTED_TOTAL}, found ${stubs.length}. ABORT before any write.`,
    );
  }

  console.log(
    `Collection: ${info.title} (${info.handle}) | products: ${stubs.length}`,
  );

  console.log(
    '\nReading all 104 products for final prewrite lock...',
  );

  const products = [];

  for (
    let i = 0;
    i < stubs.length;
    i += 1
  ) {
    const stub =
      stubs[i];

    process.stdout.write(
      `  ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${stubs.length} ${stub.handle} ... `,
    );

    const detail =
      await getProduct(
        stub.id,
      );

    products.push(
      detail,
    );

    console.log('OK');

    await sleep(100);
  }

  const reference =
    products.find(
      (product) =>
        product.handle ===
        REFERENCE_HANDLE,
    );

  if (
    !reference ||
    !isTargetCorrect(
      reference,
    )
  ) {
    throw new Error(
      `Reference ${REFERENCE_HANDLE} missing or no longer exactly correct. ABORT.`,
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
      `Reference ${REFERENCE_HANDLE} has missing custom.print_quality mapping. ABORT.`,
    );
  }

  const oldProducts =
    products.filter(
      exactOldStructure,
    );

  const correctProducts =
    products.filter(
      isTargetCorrect,
    );

  const unexpectedProducts =
    products.filter(
      (product) =>
        !exactOldStructure(
          product,
        ) &&
        !isTargetCorrect(
          product,
        ),
    );

  if (
    oldProducts.length !==
    EXPECTED_REMAINING_OLD
  ) {
    throw new Error(
      `Remaining old count changed. Expected ${EXPECTED_REMAINING_OLD}, found ${oldProducts.length}. ABORT.`,
    );
  }

  if (
    correctProducts.length !==
    EXPECTED_ALREADY_CORRECT
  ) {
    throw new Error(
      `Already-correct count changed. Expected ${EXPECTED_ALREADY_CORRECT}, found ${correctProducts.length}. ABORT.`,
    );
  }

  if (
    unexpectedProducts.length !==
    0
  ) {
    throw new Error(
      `Unexpected product structures found: ${unexpectedProducts
        .map(
          (product) =>
            product.handle,
        )
        .join(', ')}. ABORT.`,
    );
  }

  const correctHandles =
    new Set(
      correctProducts.map(
        (product) =>
          product.handle,
      ),
    );

  for (
    const handle
    of EXPECTED_CORRECT_HANDLES
  ) {
    if (
      !correctHandles.has(
        handle,
      )
    ) {
      throw new Error(
        `Expected manually-verified correct product ${handle} is not correct anymore. ABORT.`,
      );
    }
  }

  for (
    const product
    of correctProducts
  ) {
    validateCorrectMetafields(
      product,
      refMap,
    );
  }

  for (
    const product
    of oldProducts
  ) {
    validateOldMetafields(
      product,
      refMap,
    );
  }

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
      `fototapeten-remaining98-before-${timestamp}.json`,
    );

  const beforeSnapshots =
    Object.fromEntries(
      oldProducts.map(
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

        grantedScopes,

        collection:
          info,

        reference:
          snapshotProduct(
            reference,
          ),

        expectedCorrectHandles:
          EXPECTED_CORRECT_HANDLES,

        remainingHandles:
          oldProducts.map(
            (product) =>
              product.handle,
          ),

        products:
          beforeSnapshots,
      },

      null,
      2,
    ),

    'utf8',
  );

  console.log(`
================ FINAL PREWRITE LOCK ================

TOTAL               : ${products.length}
REMAINING OLD        : ${oldProducts.length}
ALREADY CORRECT      : ${correctProducts.length}
UNEXPECTED           : ${unexpectedProducts.length}
REFERENCE            : ${REFERENCE_HANDLE}
METAFIELD CHECK      : CLEAN
BACKUP               : ${backupPath}

No metafield write exists in this script.
No product creation exists in this script.
No retained variant deletion exists in this script.

Phase 1 will update exactly ${oldProducts.length} products:

Standard -> Glatt / €23.00 / 20-234.1-3
Premium -> Feinprägung / €34.00 / 20-139.1-3
Selbstklebend -> €39.00 / 20-140.1-3
Airtex Exklusiv -> Nahtlos / €45.00 / 20-331.1-3

Premium Vinyl is NOT deleted until every one of the ${oldProducts.length} updates is re-read and verified.
`);

  await confirmExact(
    `Start phase 1 on exactly ${oldProducts.length} remaining products?`,
    START_CONFIRM,
  );

  console.log(
    `\nPHASE 1: updating retained variants on ${oldProducts.length} products...`,
  );

  for (
    let i = 0;
    i < oldProducts.length;
    i += 1
  ) {
    const product =
      oldProducts[i];

    process.stdout.write(
      `  ${String(
        i + 1,
      ).padStart(
        2,
        ' ',
      )}/${oldProducts.length} ${product.handle} ... `,
    );

    await updateProduct(
      product,
    );

    console.log(
      'UPDATED',
    );

    await sleep(150);
  }

  console.log(
    `\nPHASE 1 VERIFY: re-reading all ${oldProducts.length} updated products...`,
  );

  for (
    let i = 0;
    i < oldProducts.length;
    i += 1
  ) {
    const original =
      oldProducts[i];

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

    console.log(
      `  ${String(
        i + 1,
      ).padStart(
        2,
        ' ',
      )}/${oldProducts.length} ${original.handle}: VERIFIED`,
    );

    await sleep(100);
  }

  console.log(`
All ${oldProducts.length} retained-variant updates verified.

- retained variant IDs preserved
- retained metafield IDs/values preserved
- names/prices/SKUs correct
- Premium Vinyl still present on every product

NO Premium Vinyl delete has happened yet.
`);

  await confirmExact(
    `Start phase 2: delete only Premium Vinyl from these same ${oldProducts.length} verified products?`,
    DELETE_CONFIRM,
  );

  deletePhaseStarted =
    true;

  console.log(
    `\nPHASE 2: deleting Premium Vinyl from ${oldProducts.length} products...`,
  );

  for (
    let i = 0;
    i < oldProducts.length;
    i += 1
  ) {
    const original =
      oldProducts[i];

    const before =
      beforeSnapshots[
        original.handle
      ];

    const premiumVinyl =
      oldVariantSnapshot(
        before,
        DELETE_NAME,
      );

    if (
      !premiumVinyl?.id
    ) {
      throw new Error(
        `${original.handle}: Premium Vinyl backup ID missing before delete.`,
      );
    }

    const fresh =
      await getProduct(
        original.id,
      );

    verifyIntermediate(
      fresh,
      before,
    );

    process.stdout.write(
      `  ${String(
        i + 1,
      ).padStart(
        2,
        ' ',
      )}/${oldProducts.length} ${original.handle} ... `,
    );

    await deletePremiumVinyl(
      original.id,
      premiumVinyl.id,
      original.handle,
    );

    console.log(
      'DELETED',
    );

    await sleep(150);
  }

  console.log(
    `\nFINAL VERIFY: re-reading all ${oldProducts.length} migrated products...`,
  );

  const afterSnapshots =
    {};

  for (
    let i = 0;
    i < oldProducts.length;
    i += 1
  ) {
    const original =
      oldProducts[i];

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
      `  ${String(
        i + 1,
      ).padStart(
        2,
        ' ',
      )}/${oldProducts.length} ${original.handle}: FINAL OK`,
    );

    await sleep(100);
  }

  const afterPath =
    path.join(
      backupDir,
      `fototapeten-remaining98-after-${timestamp}.json`,
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
FINAL 98 MIGRATION COMPLETE.

Migrated: ${oldProducts.length}
Pre-existing correct: ${correctProducts.length}
Total collection: ${products.length}

Before backup:
${backupPath}

After snapshot:
${afterPath}

NEXT:

Run the READ-ONLY audit again.

Expected final result:

SAFE OLD = 0
ALREADY CORRECT = 104
BLOCKED = 0
UNEXPECTED = 0

Do not remove write_products until that final audit is clean.
`);
}

main().catch(
  (error) => {
    console.error(
      '\nFINAL MIGRATION STOPPED:\n',
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

Do not rerun blindly.
Run the READ-ONLY audit
and inspect the current state first.
`);
    } else {
      console.error(`
Delete phase had started.

Do not rerun anything blindly.

Run the READ-ONLY audit
and send me the output
before taking any further action.
`);
    }

    process.exitCode = 1;
  },
);