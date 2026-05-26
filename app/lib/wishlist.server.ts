const ADMIN_API_VERSION = '2025-10';
const WISHLIST_NAMESPACE = 'custom';
const WISHLIST_KEY = 'wishlist';
const WISHLIST_TYPE = 'list.product_reference';
const WISHLIST_MAX_ITEMS = 128;
const WISHLIST_DEBUG_VERSION = 'wishlist-debug-v2';

type AdminGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{message: string}>;
};

type WishlistEnv = {
  SHOPIFY_SHOP?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
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

type AdminAccessToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedAdminAccessToken: AdminAccessToken | null = null;

function getWishlistConfig(env: WishlistEnv) {
  const shop = env.SHOPIFY_SHOP;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;

  if (!shop) {
    throw new Error(
      `SHOPIFY_SHOP is required for wishlist requests. ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  if (!clientId) {
    throw new Error(
      `SHOPIFY_CLIENT_ID is required for wishlist requests. ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  if (!clientSecret) {
    throw new Error(
      `SHOPIFY_CLIENT_SECRET is required for wishlist requests. ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  return {shop, clientId, clientSecret};
}

function toShopOrigin(shop: string) {
  return shop.startsWith('http') ? new URL(shop).origin : `https://${shop}`;
}

function toAdminApiUrl(shop: string) {
  return `${toShopOrigin(shop)}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
}

function toAdminAccessTokenUrl(shop: string) {
  return `${toShopOrigin(shop)}/admin/oauth/access_token`;
}

async function getAdminAccessToken(env: WishlistEnv) {
  const {shop, clientId, clientSecret} = getWishlistConfig(env);

  if (
    cachedAdminAccessToken &&
    Date.now() < cachedAdminAccessToken.expiresAt - 60_000
  ) {
    return {shop, accessToken: cachedAdminAccessToken.accessToken};
  }

  const response = await fetch(toAdminAccessTokenUrl(shop), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Wishlist token request failed with status ${response.status}: ${responseText} ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Wishlist token request returned no access token. ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  cachedAdminAccessToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };

  return {shop, accessToken: payload.access_token};
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
  const {shop, accessToken} = await getAdminAccessToken(env);
  const response = await fetch(toAdminApiUrl(shop), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({query, variables}),
  });

  if (!response.ok) {
    throw new Error(
      `Wishlist admin request failed with status ${response.status}. ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  const payload = (await response.json()) as AdminGraphqlResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  if (!payload.data) {
    throw new Error(
      `Wishlist admin request returned no data. ${WISHLIST_DEBUG_VERSION}`,
    );
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
      `${data.metafieldsSet.userErrors.map((error) => error.message).join(', ')} ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  return nextWishlist;
}

export async function toggleProductInCustomerWishlist({
  env,
  customerId,
  productId,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
}) {
  const currentWishlist = await getCustomerWishlistProductIds({env, customerId});
  const isCurrentlyWishlisted = currentWishlist.includes(productId);
  const nextWishlist = isCurrentlyWishlisted
    ? currentWishlist.filter((currentProductId) => currentProductId !== productId)
    : normalizeWishlistProductIds([productId, ...currentWishlist]);

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
      `${data.metafieldsSet.userErrors.map((error) => error.message).join(', ')} ${WISHLIST_DEBUG_VERSION}`,
    );
  }

  return {
    wishlist: nextWishlist,
    wishlisted: !isCurrentlyWishlisted,
  };
}
