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

const EXPECTED_TOTAL = 104;
const EXPECTED_ALREADY_CORRECT = 5;
const EXPECTED_REMAINING = 99;

const TARGET_RICH_TEXT = {
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

const TARGET_VALUE =
  JSON.stringify(TARGET_RICH_TEXT);

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

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );

let accessToken = null;
let accessTokenExpiresAt = 0;
let grantedScopes = [];

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

  if (
    !grantedScopes.includes(
      'write_products',
    )
  ) {
    throw new Error(
      `write_products scope missing. Scopes: ${grantedScopes.join(
        ',',
      )}`,
    );
  }

  console.log(
    `Admin authentication OK. Scopes: ${
      body.scope || 'not returned'
    }`,
  );

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
  query ProductInfoCollection(
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

const PRODUCT_QUERY = `#graphql
  query ProductInfoProduct(
    $id: ID!
  ) {
    product(id: $id) {
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
  }
`;

const SET_METAFIELDS_MUTATION = `#graphql
  mutation SetProductInfo(
    $metafields: [MetafieldsSetInput!]!
  ) {
    metafieldsSet(
      metafields: $metafields
    ) {
      metafields {
        id
        namespace
        key
        type
        value
      }

      userErrors {
        field
        message
        code
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

async function getProduct(id) {
  const data =
    await gql(
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

function validateMetafield(
  product,
) {
  const metafield =
    product.metafield;

  if (!metafield) {
    throw new Error(
      `Product Info metafield missing: ${product.handle}`,
    );
  }

  if (
    metafield.namespace !==
      NAMESPACE ||
    metafield.key !== KEY
  ) {
    throw new Error(
      `Metafield identity mismatch: ${product.handle}`,
    );
  }

  if (
    metafield.type !== TYPE
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

function chunk(
  items,
  size,
) {
  const chunks = [];

  for (
    let i = 0;
    i < items.length;
    i += size
  ) {
    chunks.push(
      items.slice(
        i,
        i + size,
      ),
    );
  }

  return chunks;
}

async function verifyBatch(
  batch,
) {
  for (
    const before
    of batch
  ) {
    const fresh =
      await getProduct(
        before.id,
      );

    if (
      fresh.id !==
      before.id
    ) {
      throw new Error(
        `Post-write product ID mismatch for ${before.handle}.`,
      );
    }

    validateMetafield(
      fresh,
    );

    if (
      fresh
        .metafield
        .id !==
      before
        .metafield
        .id
    ) {
      throw new Error(
        `Metafield ID changed for ${before.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .type !==
      TYPE
    ) {
      throw new Error(
        `Metafield type changed for ${before.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .value !==
      TARGET_VALUE
    ) {
      throw new Error(
        `Value verification failed for ${before.handle}.`,
      );
    }
  }
}

async function main() {
  console.log(`
WANDINI
Product Info REMAINING-99 migration

Shop: ${SHOP}
API: ${API_VERSION}
Collection: ${COLLECTION_HANDLE}

Target:
${NAMESPACE}.${KEY}
${TYPE}

THIS SCRIPT CAN WRITE TO SHOPIFY.

Hard locks:
- collection total = 104
- already correct = exactly 5
- remaining to update = exactly 99
`);

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
    validateMetafield(
      product,
    );
  }

  const alreadyCorrect =
    products.filter(
      (product) =>
        product
          .metafield
          .value ===
        TARGET_VALUE,
    );

  const remaining =
    products.filter(
      (product) =>
        product
          .metafield
          .value !==
        TARGET_VALUE,
    );

  if (
    alreadyCorrect.length !==
    EXPECTED_ALREADY_CORRECT
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_ALREADY_CORRECT} already-correct products, found ${alreadyCorrect.length}.\n\nAlready correct:\n${alreadyCorrect
        .map(
          (product) =>
            `${product.handle} | ${product.id}`,
        )
        .join('\n')}`,
    );
  }

  if (
    remaining.length !==
    EXPECTED_REMAINING
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_REMAINING} remaining products, found ${remaining.length}.`,
    );
  }

  const backupPath =
    writeJson(
      'product-info-remaining99-before',
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

        targetMetafield:
          `${NAMESPACE}.${KEY}`,

        targetType:
          TYPE,

        targetValue:
          TARGET_RICH_TEXT,

        summary: {
          total:
            products.length,

          alreadyCorrect:
            alreadyCorrect.length,

          remaining:
            remaining.length,
        },

        products,
      },
    );

  console.log(`
PRECHECK CLEAN.

TOTAL PRODUCTS  : ${products.length}
ALREADY CORRECT : ${alreadyCorrect.length}
TO UPDATE       : ${remaining.length}

The 5 test products are still exactly correct.
The other 99 products will be updated.

Backup of ALL 104 current values:
${backupPath}

Only ${NAMESPACE}.${KEY} will be written.

No titles, handles, images, variants, prices, SKUs or other metafields are written.
`);

  const rl =
    readline.createInterface({
      input,
      output,
    });

  const answer =
    await rl.question(
      'Type exactly WRITE REMAINING 99 PRODUCT INFO to continue: ',
    );

  rl.close();

  if (
    answer !==
    'WRITE REMAINING 99 PRODUCT INFO'
  ) {
    console.log(
      '\nCancelled. NO SHOPIFY DATA WAS CHANGED.',
    );

    return;
  }

  const batches =
    chunk(
      remaining,
      25,
    );

  for (
    let i = 0;
    i < batches.length;
    i += 1
  ) {
    const batch =
      batches[i];

    console.log(
      `\nWriting batch ${i + 1}/${batches.length} (${batch.length} products)...`,
    );

    const metafields =
      batch.map(
        (product) => ({
          ownerId:
            product.id,

          namespace:
            NAMESPACE,

          key:
            KEY,

          type:
            TYPE,

          value:
            TARGET_VALUE,
        }),
      );

    const mutationData =
      await gql(
        SET_METAFIELDS_MUTATION,
        {
          metafields,
        },
        {
          allowMutation:
            true,
        },
      );

    const result =
      mutationData
        ?.metafieldsSet;

    if (!result) {
      throw new Error(
        `Batch ${i + 1}: metafieldsSet returned no payload.`,
      );
    }

    if (
      result
        .userErrors
        ?.length
    ) {
      throw new Error(
        `Batch ${i + 1}: metafieldsSet userErrors:\n${JSON.stringify(
          result.userErrors,
          null,
          2,
        )}`,
      );
    }

    if (
      result
        .metafields
        ?.length !==
      batch.length
    ) {
      throw new Error(
        `Batch ${i + 1}: expected ${batch.length} returned metafields, got ${
          result
            .metafields
            ?.length ?? 0
        }.`,
      );
    }

    await sleep(
      300,
    );

    await verifyBatch(
      batch,
    );

    console.log(
      `Batch ${i + 1}/${batches.length} verified.`,
    );
  }

  console.log(
    '\nRunning final full verification...',
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

  const beforeById =
    new Map(
      products.map(
        (product) => [
          product.id,
          product,
        ],
      ),
    );

  const incorrect = [];

  for (
    const fresh
    of finalProducts
  ) {
    validateMetafield(
      fresh,
    );

    const before =
      beforeById.get(
        fresh.id,
      );

    if (!before) {
      throw new Error(
        `Unexpected product found during final verification: ${fresh.id}`,
      );
    }

    if (
      fresh
        .metafield
        .id !==
      before
        .metafield
        .id
    ) {
      throw new Error(
        `Metafield ID changed for ${fresh.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .type !==
      TYPE
    ) {
      throw new Error(
        `Metafield type changed for ${fresh.handle}.`,
      );
    }

    if (
      fresh
        .metafield
        .value !==
      TARGET_VALUE
    ) {
      incorrect.push({
        id:
          fresh.id,

        handle:
          fresh.handle,
      });
    }
  }

  if (
    incorrect.length >
    0
  ) {
    throw new Error(
      `Final verification found incorrect Product Info values:\n${JSON.stringify(
        incorrect,
        null,
        2,
      )}`,
    );
  }

  const afterPath =
    writeJson(
      'product-info-remaining99-after',
      {
        generatedAt:
          new Date()
            .toISOString(),

        shop:
          SHOP,

        apiVersion:
          API_VERSION,

        collection:
          info,

        summary: {
          total:
            finalProducts.length,

          correct:
            finalProducts.length,

          migratedThisRun:
            remaining.length,

          previouslyCorrect:
            alreadyCorrect.length,
        },

        products:
          finalProducts,
      },
    );

  console.log(`
FINAL PRODUCT INFO MIGRATION COMPLETE.

Migrated this run : ${remaining.length}
Previously correct: ${alreadyCorrect.length}
Correct total     : ${finalProducts.length}

104/104 products now contain the exact target Product Info.

Metafield IDs unchanged.
Metafield types unchanged.
All final values were re-read directly from Shopify and matched exactly.

After snapshot:
${afterPath}
`);
}

main().catch(
  (error) => {
    console.error(
      '\nREMAINING-99 PRODUCT INFO MIGRATION FAILED:\n',
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    console.error(`
IMPORTANT:
If a failure happened after one or more batches were written,
DO NOT blindly rerun this script.
First run a read-only audit and inspect the current counts.
`);

    process.exitCode = 1;
  },
);