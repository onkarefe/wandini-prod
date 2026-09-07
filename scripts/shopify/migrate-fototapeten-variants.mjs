import fs from 'node:fs';
import path from 'node:path';

const API_VERSION =
  process.env.SHOPIFY_ADMIN_API_VERSION || '2026-07';

const COLLECTION_HANDLE =
  process.env.SHOPIFY_FOTOTAPETEN_COLLECTION_HANDLE ||
  'fototapeten';

const REFERENCE_HANDLE = '8-3';

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

const TARGET = {
  Glatt: {
    price: '23.00',
    sku: '20-234.1-3',
  },
  'Feinprägung': {
    price: '34.00',
    sku: '20-139.1-3',
  },
  Selbstklebend: {
    price: '39.00',
    sku: '20-140.1-3',
  },
  Nahtlos: {
    price: '45.00',
    sku: '20-331.1-3',
  },
};

const OLD_TO_NEW = {
  Standard: 'Glatt',
  Premium: 'Feinprägung',
  Selbstklebend: 'Selbstklebend',
  'Airtex Exklusiv': 'Nahtlos',
};

/**
 * READ-ONLY SAFETY GUARD
 */
const forbiddenArgs = process.argv
  .slice(2)
  .filter((arg) =>
    /apply|write|delete|mutat/i.test(arg),
  );

if (forbiddenArgs.length > 0) {
  throw new Error(
    `READ-ONLY guard rejected CLI argument(s): ${forbiddenArgs.join(', ')}`,
  );
}

/**
 * ENV CHECK
 */
if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Missing Shopify credentials.

Expected in .env:

PUBLIC_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_MIGRATION_CLIENT_ID=...
SHOPIFY_MIGRATION_CLIENT_SECRET=...
`);

  process.exit(1);
}

if (!SHOP.endsWith('.myshopify.com')) {
  console.error(`
PUBLIC_STORE_DOMAIN must be the *.myshopify.com domain.

Received:
${SHOP}
`);

  process.exit(1);
}

const endpoint =
  `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

/**
 * GET ADMIN ACCESS TOKEN
 */
async function getAdminAccessToken() {
  if (
    accessToken &&
    Date.now() < accessTokenExpiresAt - 60_000
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

  const rawBody = await response.text();

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
        `Body: ${rawBody || '(empty)'}`,
        `X-Request-ID: ${
          response.headers.get('x-request-id') ||
          '(none)'
        }`,
      ].join('\n'),
    );
  }

  accessToken =
    body.access_token;

  accessTokenExpiresAt =
    Date.now() +
    Number(body.expires_in || 0) * 1000;

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

  return accessToken;
}

/**
 * READ-ONLY GRAPHQL
 */
async function gql(
  query,
  variables = {},
  attempt = 1,
) {
  /**
   * Hard safety lock.
   * Bu dosya GraphQL mutation çalıştıramaz.
   */
  if (/\bmutation\b/i.test(query)) {
    throw new Error(
      'READ-ONLY guard blocked a GraphQL mutation.',
    );
  }

  const token =
    await getAdminAccessToken();

  const response = await fetch(
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

  /**
   * Rate limit retry
   */
  if (
    response.status === 429 &&
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

    return gql(
      query,
      variables,
      attempt + 1,
    );
  }

  const rawBody =
    await response.text();

  let body = null;

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
const COLLECTION_PAGE_QUERY = `#graphql
  query FototapetenCollectionPage(
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
const PRODUCT_AUDIT_QUERY = `#graphql
  query ProductVariantAudit(
    $id: ID!
  ) {
    product(id: $id) {
      id
      title
      handle

      options {
        id
        name
      }

      variants(first: 20) {
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
            namespace
            key
            type
            value
          }
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
        COLLECTION_PAGE_QUERY,
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
      ...collection.products.nodes,
    );

    after =
      collection.products.pageInfo
        .hasNextPage
        ? collection.products.pageInfo
            .endCursor
        : null;
  } while (after);

  return {
    collectionInfo,
    products,
  };
}

async function getProductDetail(
  id,
) {
  const data =
    await gql(
      PRODUCT_AUDIT_QUERY,
      {id},
    );

  if (!data?.product) {
    throw new Error(
      `Product not found: ${id}`,
    );
  }

  return data.product;
}

/**
 * QUALITY VALUE
 */
function qualityValue(
  variant,
) {
  return variant
    .selectedOptions
    ?.find(
      (option) =>
        option.name.toLowerCase() ===
        'quality',
    )
    ?.value;
}

/**
 * EXACT STRUCTURE CHECK
 */
function exactQualityStructure(
  product,
  expectedValues,
) {
  if (
    product.options?.length !== 1 ||
    product.options[0]?.name !==
      'Quality'
  ) {
    return false;
  }

  const values =
    product.variants.nodes.map(
      qualityValue,
    );

  if (
    values.some(
      (value) => !value,
    )
  ) {
    return false;
  }

  if (
    values.length !==
    expectedValues.length
  ) {
    return false;
  }

  return (
    [...values]
      .sort()
      .join('\u0000') ===
    [...expectedValues]
      .sort()
      .join('\u0000')
  );
}

function normalizePrice(
  value,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed.toFixed(2)
    : String(value ?? '');
}

function variantByQuality(
  product,
  value,
) {
  return product.variants.nodes.find(
    (variant) =>
      qualityValue(variant) ===
      value,
  );
}

/**
 * TARGET STATE CHECK
 */
function isTargetCorrect(
  product,
) {
  const targetNames =
    Object.keys(TARGET);

  if (
    !exactQualityStructure(
      product,
      targetNames,
    )
  ) {
    return false;
  }

  return targetNames.every(
    (name) => {
      const variant =
        variantByQuality(
          product,
          name,
        );

      const expected =
        TARGET[name];

      return (
        normalizePrice(
          variant?.price,
        ) ===
          expected.price &&
        String(
          variant?.sku ?? '',
        ) ===
          expected.sku
      );
    },
  );
}

/**
 * REFERENCE METAOBJECT MAPPING
 */
function referenceMapFromProduct(
  product,
) {
  return Object.fromEntries(
    Object.keys(TARGET).map(
      (name) => {
        const variant =
          variantByQuality(
            product,
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

/**
 * OLD PRODUCT META CHECK
 */
function auditOldProductAgainstReference(
  product,
  referenceMap,
) {
  const checks =
    Object.entries(
      OLD_TO_NEW,
    ).map(
      ([
        oldName,
        newName,
      ]) => {
        const variant =
          variantByQuality(
            product,
            oldName,
          );

        const actual =
          variant
            ?.metafield
            ?.value ??
          null;

        const expected =
          referenceMap[
            newName
          ] ?? null;

        return {
          oldName,
          newName,

          variantId:
            variant?.id ??
            null,

          actualMetafieldValue:
            actual,

          expectedMetafieldValue:
            expected,

          ok: Boolean(
            actual &&
              expected &&
              actual ===
                expected,
          ),
        };
      },
    );

  return {
    ok: checks.every(
      (check) =>
        check.ok,
    ),

    checks,
  };
}

/**
 * CORRECT PRODUCT META CHECK
 */
function auditCorrectProductAgainstReference(
  product,
  referenceMap,
) {
  const checks =
    Object.keys(
      TARGET,
    ).map(
      (name) => {
        const variant =
          variantByQuality(
            product,
            name,
          );

        const actual =
          variant
            ?.metafield
            ?.value ??
          null;

        const expected =
          referenceMap[
            name
          ] ?? null;

        return {
          name,

          variantId:
            variant?.id ??
            null,

          actualMetafieldValue:
            actual,

          expectedMetafieldValue:
            expected,

          ok: Boolean(
            actual &&
              expected &&
              actual ===
                expected,
          ),
        };
      },
    );

  return {
    ok: checks.every(
      (check) =>
        check.ok,
    ),

    checks,
  };
}

function compactVariantList(
  product,
) {
  return product.variants.nodes.map(
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
        variant.sku ?? '',

      printQualityMetafield:
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
  );
}

/**
 * MAIN
 */
async function main() {
  console.log(`
WANDINI
Fototapeten variant preflight

MODE: READ ONLY
Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}
Reference: ${REFERENCE_HANDLE}
`);

  const {
    collectionInfo,
    products: stubs,
  } =
    await getCollectionProducts();

  console.log(
    `Collection: ${collectionInfo.title} (${collectionInfo.handle})`,
  );

  console.log(
    `Products found: ${stubs.length}\n`,
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
      `Reading ${String(
        i + 1,
      ).padStart(
        3,
        ' ',
      )}/${stubs.length}: ${stub.handle} ... `,
    );

    const detail =
      await getProductDetail(
        stub.id,
      );

    products.push(
      detail,
    );

    console.log('OK');

    await sleep(120);
  }

  /**
   * HARD REFERENCE = 8-3
   */
  const referenceProduct =
    products.find(
      (product) =>
        product.handle ===
        REFERENCE_HANDLE,
    );

  const referenceProblems =
    [];

  if (!referenceProduct) {
    referenceProblems.push(
      `Reference product ${REFERENCE_HANDLE} is not in collection ${COLLECTION_HANDLE}.`,
    );
  } else if (
    !isTargetCorrect(
      referenceProduct,
    )
  ) {
    referenceProblems.push(
      `Reference product ${REFERENCE_HANDLE} does not exactly match target names/prices/SKUs.`,
    );
  }

  const referenceMap =
    referenceProduct
      ? referenceMapFromProduct(
          referenceProduct,
        )
      : null;

  if (referenceMap) {
    for (
      const [name, value]
      of Object.entries(
        referenceMap,
      )
    ) {
      if (!value) {
        referenceProblems.push(
          `Reference product ${REFERENCE_HANDLE}: ${name} has no custom.print_quality metafield.`,
        );
      }
    }
  }

  const oldProducts =
    products.filter(
      (product) =>
        exactQualityStructure(
          product,
          OLD_VARIANTS,
        ),
    );

  const correctProducts =
    products.filter(
      isTargetCorrect,
    );

  const unexpectedProducts =
    products.filter(
      (product) =>
        !exactQualityStructure(
          product,
          OLD_VARIANTS,
        ) &&
        !isTargetCorrect(
          product,
        ),
    );

  const safeOld = [];
  const blockedOld = [];
  const blockedCorrect = [];

  if (
    referenceMap &&
    referenceProblems.length ===
      0
  ) {
    /**
     * OLD PRODUCTS
     */
    for (
      const product
      of oldProducts
    ) {
      const metaAudit =
        auditOldProductAgainstReference(
          product,
          referenceMap,
        );

      if (metaAudit.ok) {
        safeOld.push({
          product,
          metaAudit,
        });
      } else {
        blockedOld.push({
          product,
          metaAudit,
        });
      }
    }

    /**
     * CORRECT PRODUCTS
     */
    for (
      const product
      of correctProducts
    ) {
      const metaAudit =
        auditCorrectProductAgainstReference(
          product,
          referenceMap,
        );

      if (!metaAudit.ok) {
        blockedCorrect.push({
          product,
          metaAudit,
        });
      }
    }
  } else {
    for (
      const product
      of oldProducts
    ) {
      blockedOld.push({
        product,

        metaAudit: {
          ok: false,
          checks: [],
          reason:
            'Reference product is not trustworthy.',
        },
      });
    }
  }

  console.log(`
================ PREFLIGHT RESULT ================

TOTAL IN COLLECTION : ${products.length}
SAFE OLD (5 -> 4)   : ${safeOld.length}
ALREADY CORRECT     : ${correctProducts.length}
BLOCKED OLD META    : ${blockedOld.length}
BLOCKED CORRECT META: ${blockedCorrect.length}
UNEXPECTED STRUCTURE: ${unexpectedProducts.length}
REFERENCE PRODUCT   : ${
    referenceProduct?.handle ||
    'NOT FOUND'
  }
`);

  if (
    referenceProblems.length >
    0
  ) {
    console.log(
      'REFERENCE PROBLEMS:',
    );

    for (
      const problem
      of referenceProblems
    ) {
      console.log(
        `  - ${problem}`,
      );
    }

    console.log('');
  }

  if (
    blockedOld.length >
    0
  ) {
    console.log(
      'BLOCKED OLD PRODUCTS:',
    );

    for (
      const {
        product,
        metaAudit,
      }
      of blockedOld
    ) {
      console.log(
        `  [BLOCKED] ${product.handle}`,
      );

      for (
        const check
        of metaAudit.checks ||
        []
      ) {
        if (!check.ok) {
          console.log(
            `    ${check.oldName} -> ${check.newName}: print_quality mismatch/missing`,
          );
        }
      }
    }

    console.log('');
  }

  if (
    blockedCorrect.length >
    0
  ) {
    console.log(
      'BLOCKED CORRECT PRODUCTS:',
    );

    for (
      const {
        product,
        metaAudit,
      }
      of blockedCorrect
    ) {
      console.log(
        `  [BLOCKED CORRECT] ${product.handle}`,
      );

      for (
        const check
        of metaAudit.checks ||
        []
      ) {
        if (!check.ok) {
          console.log(
            `    ${check.name}: print_quality mismatch/missing`,
          );
        }
      }
    }

    console.log('');
  }

  if (
    unexpectedProducts.length >
    0
  ) {
    console.log(
      'UNEXPECTED PRODUCTS:',
    );

    for (
      const product
      of unexpectedProducts
    ) {
      const values =
        product.variants.nodes
          .map(
            qualityValue,
          )
          .filter(Boolean);

      console.log(
        `  [UNEXPECTED] ${product.handle} | option=${
          product.options
            ?.map(
              (option) =>
                option.name,
            )
            .join(', ') ||
          'none'
        } | variants=${
          values.join(' / ') ||
          'unreadable'
        }`,
      );
    }

    console.log('');
  }

  /**
   * LOCAL AUDIT JSON
   */
  const auditDir =
    path.resolve(
      'migration-audits',
    );

  fs.mkdirSync(
    auditDir,
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

  const auditPath =
    path.join(
      auditDir,
      `fototapeten-preflight-${timestamp}.json`,
    );

  const safeOldIds =
    new Set(
      safeOld.map(
        ({product}) =>
          product.id,
      ),
    );

  const blockedOldIds =
    new Set(
      blockedOld.map(
        ({product}) =>
          product.id,
      ),
    );

  const blockedCorrectIds =
    new Set(
      blockedCorrect.map(
        ({product}) =>
          product.id,
      ),
    );

  const auditPayload = {
    generatedAt:
      new Date().toISOString(),

    mode:
      'READ_ONLY',

    shop:
      SHOP,

    apiVersion:
      API_VERSION,

    grantedScopes,

    collection:
      collectionInfo,

    referenceHandle:
      REFERENCE_HANDLE,

    referenceProduct:
      referenceProduct
        ? {
            id:
              referenceProduct.id,

            title:
              referenceProduct.title,

            handle:
              referenceProduct.handle,

            variants:
              compactVariantList(
                referenceProduct,
              ),
          }
        : null,

    referenceMap,

    referenceProblems,

    target:
      TARGET,

    summary: {
      total:
        products.length,

      safeOld:
        safeOld.length,

      alreadyCorrect:
        correctProducts.length,

      blockedOldMetafield:
        blockedOld.length,

      blockedCorrectMetafield:
        blockedCorrect.length,

      unexpected:
        unexpectedProducts.length,
    },

    products:
      products.map(
        (product) => {
          let status =
            'UNEXPECTED';

          if (
            safeOldIds.has(
              product.id,
            )
          ) {
            status =
              'SAFE_OLD';
          } else if (
            blockedOldIds.has(
              product.id,
            )
          ) {
            status =
              'BLOCKED_OLD_METAFIELD';
          } else if (
            blockedCorrectIds.has(
              product.id,
            )
          ) {
            status =
              'BLOCKED_CORRECT_METAFIELD';
          } else if (
            isTargetCorrect(
              product,
            )
          ) {
            status =
              'ALREADY_CORRECT';
          }

          return {
            id:
              product.id,

            title:
              product.title,

            handle:
              product.handle,

            status,

            optionNames:
              product.options
                ?.map(
                  (option) =>
                    option.name,
                ) ||
              [],

            variants:
              compactVariantList(
                product,
              ),
          };
        },
      ),
  };

  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      auditPayload,
      null,
      2,
    ),
    'utf8',
  );

  console.log(`
Audit JSON written locally:
${auditPath}
`);

  console.log(
    'NO SHOPIFY DATA WAS CHANGED.\n',
  );

  const clean =
    referenceProblems.length ===
      0 &&
    blockedOld.length === 0 &&
    blockedCorrect.length ===
      0 &&
    unexpectedProducts.length ===
      0;

  if (clean) {
    console.log(`
PRECHECK CLEAN.

Do not run any write migration yet.
`);
  } else {
    console.log(`
PRECHECK NOT CLEAN.

WRITE MIGRATION MUST NOT RUN.
`);

    process.exitCode = 2;
  }
}

main().catch(
  (error) => {
    console.error(
      '\nPRECHECK FAILED:\n',
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