const ADMIN_API_VERSION = '2026-07';
const WISHLIST_NAMESPACE = 'custom';
const WISHLIST_KEY = 'wishlist';
const WISHLIST_TYPE = 'list.product_reference';
const WISHLIST_MAX_ITEMS = 128;
const ADMIN_REQUEST_TIMEOUT_MS = 10_000;
const MAX_STALE_WRITE_RETRIES = 3;

type WishlistEnv = Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'SHOPIFY_SHOP'
  | 'SHOPIFY_CLIENT_ID'
  | 'SHOPIFY_CLIENT_SECRET'
>;

type AdminGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{message: string}>;
};

type CustomerWishlistQuery = {
  customer: {
    metafield: {
      value: string;
      compareDigest: string;
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
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

type WishlistSnapshot = {
  productIds: string[];
  compareDigest: string | null;
};

type WishlistResult = {
  wishlist: string[];
  wishlisted: boolean;
};

let cachedAdminAccessToken: AdminAccessToken | null = null;

function normalizeShopDomain(value: string) {
  const candidate = value.includes('://') ? value : `https://${value}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Wishlist store domain is invalid.');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith('.myshopify.com')) {
    throw new Error('Wishlist store domain must be a myshopify.com domain.');
  }

  return hostname;
}

function getWishlistConfig(env: WishlistEnv) {
  const shopValue = env.SHOPIFY_SHOP ?? env.PUBLIC_STORE_DOMAIN;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;

  if (!shopValue) throw new Error('Wishlist store domain is not configured.');
  if (!clientId) throw new Error('Wishlist client ID is not configured.');
  if (!clientSecret) throw new Error('Wishlist client secret is not configured.');

  return {
    shop: normalizeShopDomain(shopValue),
    clientId,
    clientSecret,
  };
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timeout);
  }
}

async function getAdminAccessToken(env: WishlistEnv) {
  const {shop, clientId, clientSecret} = getWishlistConfig(env);
  const cacheKey = `${shop}:${clientId}`;

  if (
    cachedAdminAccessToken?.cacheKey === cacheKey &&
    Date.now() < cachedAdminAccessToken.expiresAt - 60_000
  ) {
    return {shop, accessToken: cachedAdminAccessToken.accessToken};
  }

  const response = await fetchWithTimeout(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Wishlist authentication failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error('Wishlist authentication returned no access token.');
  }

  cachedAdminAccessToken = {
    cacheKey,
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 86_399) * 1000,
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
  const response = await fetchWithTimeout(
    `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({query, variables}),
    },
  );

  if (!response.ok) {
    throw new Error(`Wishlist Admin API failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as AdminGraphqlResponse<T>;
  if (payload.errors?.length) {
    throw new Error('Wishlist Admin API returned a GraphQL error.');
  }
  if (!payload.data) {
    throw new Error('Wishlist Admin API returned no data.');
  }

  return payload.data;
}

function isProductGid(value: unknown): value is string {
  return (
    typeof value === 'string' && /^gid:\/\/shopify\/Product\/\d+$/.test(value)
  );
}

function normalizeWishlistProductIds(productIds: unknown[]) {
  const uniqueIds = new Set<string>();

  for (const productId of productIds) {
    if (!isProductGid(productId)) continue;
    uniqueIds.add(productId);
    if (uniqueIds.size >= WISHLIST_MAX_ITEMS) break;
  }

  return Array.from(uniqueIds);
}

function parseWishlistValue(value: string | undefined) {
  if (!value) return [];

  try {
    const parsedValue: unknown = JSON.parse(value);
    return Array.isArray(parsedValue)
      ? normalizeWishlistProductIds(parsedValue)
      : [];
  } catch {
    return [];
  }
}

async function getCustomerWishlistSnapshot({
  env,
  customerId,
}: {
  env: WishlistEnv;
  customerId: string;
}): Promise<WishlistSnapshot> {
  const data = await adminGraphql<CustomerWishlistQuery>({
    env,
    query: `
      query CustomerWishlist($customerId: ID!) {
        customer(id: $customerId) {
          metafield(namespace: "${WISHLIST_NAMESPACE}", key: "${WISHLIST_KEY}") {
            value
            compareDigest
          }
        }
      }
    `,
    variables: {customerId},
  });

  return {
    productIds: parseWishlistValue(data.customer?.metafield?.value),
    compareDigest: data.customer?.metafield?.compareDigest ?? null,
  };
}

class WishlistStaleWriteError extends Error {}

async function setCustomerWishlist({
  env,
  customerId,
  productIds,
  compareDigest,
}: {
  env: WishlistEnv;
  customerId: string;
  productIds: string[];
  compareDigest: string | null;
}) {
  const data = await adminGraphql<MetafieldsSetMutation>({
    env,
    query: `
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
          value: JSON.stringify(productIds),
          compareDigest,
        },
      ],
    },
  });

  const userErrors = data.metafieldsSet.userErrors;
  if (userErrors.length === 0) return;

  if (userErrors.some((error) => error.code === 'STALE_OBJECT')) {
    throw new WishlistStaleWriteError();
  }

  throw new Error('Wishlist could not be saved.');
}

export async function getCustomerWishlistProductIds({
  env,
  customerId,
}: {
  env: WishlistEnv;
  customerId: string;
}) {
  const snapshot = await getCustomerWishlistSnapshot({env, customerId});
  return snapshot.productIds;
}

export async function addProductToCustomerWishlist({
  env,
  customerId,
  productId,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
}): Promise<WishlistResult> {
  return toggleProductInCustomerWishlist({
    env,
    customerId,
    productId,
    desiredWishlisted: true,
  });
}

export async function toggleProductInCustomerWishlist({
  env,
  customerId,
  productId,
  desiredWishlisted,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
  desiredWishlisted?: boolean;
}): Promise<WishlistResult> {
  if (!/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)) {
    throw new Error('Invalid wishlist customer.');
  }
  if (!isProductGid(productId)) throw new Error('Invalid wishlist product.');

  for (let attempt = 0; attempt < MAX_STALE_WRITE_RETRIES; attempt += 1) {
    const snapshot = await getCustomerWishlistSnapshot({env, customerId});
    const isCurrentlyWishlisted = snapshot.productIds.includes(productId);
    const wishlisted = desiredWishlisted ?? !isCurrentlyWishlisted;

    if (wishlisted === isCurrentlyWishlisted) {
      return {wishlist: snapshot.productIds, wishlisted};
    }

    const nextWishlist = wishlisted
      ? normalizeWishlistProductIds([productId, ...snapshot.productIds])
      : snapshot.productIds.filter((id) => id !== productId);

    try {
      await setCustomerWishlist({
        env,
        customerId,
        productIds: nextWishlist,
        compareDigest: snapshot.compareDigest,
      });
      return {wishlist: nextWishlist, wishlisted};
    } catch (error) {
      if (
        !(error instanceof WishlistStaleWriteError) ||
        attempt === MAX_STALE_WRITE_RETRIES - 1
      ) {
        throw error;
      }
    }
  }

  throw new Error('Wishlist could not be saved.');
}
