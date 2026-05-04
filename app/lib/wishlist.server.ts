const ADMIN_API_VERSION = '2025-10';
const WISHLIST_NAMESPACE = 'custom';
const WISHLIST_KEY = 'wishlist';
const WISHLIST_TYPE = 'list.product_reference';
const WISHLIST_MAX_ITEMS = 128;

type AdminGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{message: string}>;
};

type WishlistEnv = {
  PUBLIC_STORE_DOMAIN?: string;
  SHOPIFY_ADMIN_API_ACCESS_TOKEN?: string;
};

type CustomerWishlistQuery = {
  customer: {
    metafield: {
      value: string;
    } | null;
  } | null;
};

type MetafieldsSetMutation = {
  metafieldsSet: {
    metafields: Array<{
      key: string;
      namespace: string;
      value: string;
    }>;
    userErrors: Array<{
      field: string[] | null;
      message: string;
      code?: string | null;
    }>;
  };
};

function toAdminApiUrl(storeDomain: string) {
  const origin = storeDomain.startsWith('http')
    ? new URL(storeDomain).origin
    : `https://${storeDomain}`;

  return `${origin}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
}

function getWishlistConfig(env: WishlistEnv) {
  const storeDomain = env.PUBLIC_STORE_DOMAIN;
  const adminToken = env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!storeDomain) {
    throw new Error('PUBLIC_STORE_DOMAIN is required for wishlist requests.');
  }

  if (!adminToken) {
    throw new Error(
      'SHOPIFY_ADMIN_API_ACCESS_TOKEN is required for wishlist requests.',
    );
  }

  return {storeDomain, adminToken};
}

async function adminGraphql<T>({
  env,
  query,
  variables,
}: {
  env: WishlistEnv;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const {storeDomain, adminToken} = getWishlistConfig(env);
  const response = await fetch(toAdminApiUrl(storeDomain), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({query, variables}),
  });

  if (!response.ok) {
    throw new Error(`Wishlist admin request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as AdminGraphqlResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  if (!payload.data) {
    throw new Error('Wishlist admin request returned no data.');
  }

  return payload.data;
}

function normalizeWishlistProductIds(productIds: string[]) {
  const uniqueIds = new Set<string>();

  for (const productId of productIds) {
    if (typeof productId !== 'string') continue;
    if (!productId.startsWith('gid://shopify/Product/')) continue;
    uniqueIds.add(productId);
    if (uniqueIds.size >= WISHLIST_MAX_ITEMS) break;
  }

  return Array.from(uniqueIds);
}

export async function getCustomerWishlistProductIds({
  env,
  customerId,
}: {
  env: WishlistEnv;
  customerId: string;
}) {
  const data = await adminGraphql<CustomerWishlistQuery>({
    env,
    query: `#graphql
      query CustomerWishlist($customerId: ID!) {
        customer(id: $customerId) {
          metafield(namespace: "${WISHLIST_NAMESPACE}", key: "${WISHLIST_KEY}") {
            value
          }
        }
      }
    `,
    variables: {
      customerId,
    },
  });

  const rawValue = data.customer?.metafield?.value;

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue)
      ? normalizeWishlistProductIds(parsedValue.filter((value): value is string => typeof value === 'string'))
      : [];
  } catch {
    return [];
  }
}

export async function addProductToCustomerWishlist({
  env,
  customerId,
  productId,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
}) {
  const currentWishlist = await getCustomerWishlistProductIds({env, customerId});
  const nextWishlist = normalizeWishlistProductIds([productId, ...currentWishlist]);

  const data = await adminGraphql<MetafieldsSetMutation>({
    env,
    query: `#graphql
      mutation SetCustomerWishlist($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    variables: {
      metafields: [
        {
          ownerId: customerId,
          namespace: WISHLIST_NAMESPACE,
          key: WISHLIST_KEY,
          type: WISHLIST_TYPE,
          value: JSON.stringify(nextWishlist),
        },
      ],
    },
  });

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((error) => error.message).join(', '),
    );
  }

  return nextWishlist;
}
