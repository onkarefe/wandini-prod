import {WishlistServiceError} from '~/lib/wishlist-errors.server';

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
  errors?: Array<{
    message: string;
    extensions?: {code?: string};
  }>;
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
  } catch (cause) {
    throw new WishlistServiceError(
      'CONFIGURATION_ERROR',
      'Wishlist store domain is invalid.',
      {cause},
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith('.myshopify.com')) {
    throw new WishlistServiceError(
      'CONFIGURATION_ERROR',
      'Wishlist store domain must be a myshopify.com domain.',
    );
  }

  return hostname;
}

function getWishlistConfig(env: WishlistEnv) {
  const shopValue = env.SHOPIFY_SHOP ?? env.PUBLIC_STORE_DOMAIN;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;

  if (!shopValue) {
    throw new WishlistServiceError(
      'CONFIGURATION_ERROR',
      'Wishlist store domain is not configured.',
    );
  }
  if (!clientId) {
    throw new WishlistServiceError(
      'CONFIGURATION_ERROR',
      'Wishlist client ID is not configured.',
    );
  }
  if (!clientSecret) {
    throw new WishlistServiceError(
      'CONFIGURATION_ERROR',
      'Wishlist client secret is not configured.',
    );
  }

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

  let response: Response;

  try {
    response = await fetchWithTimeout(
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
  } catch (cause) {
    throw new WishlistServiceError(
      'AUTHENTICATION_ERROR',
      'Wishlist authentication request failed.',
      {cause, retryable: true},
    );
  }

  if (!response.ok) {
    throw new WishlistServiceError(
      'AUTHENTICATION_ERROR',
      `Wishlist authentication failed with status ${response.status}.`,
      {
        retryable: response.status === 429 || response.status >= 500,
        shopifyStatus: response.status,
      },
    );
  }

  let payload: {access_token?: string; expires_in?: number};

  try {
    payload = (await response.json()) as typeof payload;
  } catch (cause) {
    throw new WishlistServiceError(
      'INVALID_ADMIN_RESPONSE',
      'Wishlist authentication returned an invalid response.',
      {cause, retryable: true},
    );
  }

  if (!payload.access_token) {
    throw new WishlistServiceError(
      'INVALID_ADMIN_RESPONSE',
      'Wishlist authentication returned no access token.',
      {retryable: true},
    );
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
  let response: Response;

  try {
    response = await fetchWithTimeout(
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
  } catch (cause) {
    throw new WishlistServiceError(
      'ADMIN_API_ERROR',
      'Wishlist Admin API request failed.',
      {cause, retryable: true},
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cachedAdminAccessToken = null;
    }

    throw new WishlistServiceError(
      'ADMIN_API_ERROR',
      `Wishlist Admin API failed with status ${response.status}.`,
      {
        retryable: response.status === 429 || response.status >= 500,
        shopifyStatus: response.status,
      },
    );
  }

  let payload: AdminGraphqlResponse<T>;

  try {
    payload = (await response.json()) as AdminGraphqlResponse<T>;
  } catch (cause) {
    throw new WishlistServiceError(
      'INVALID_ADMIN_RESPONSE',
      'Wishlist Admin API returned an invalid response.',
      {cause, retryable: true},
    );
  }

  if (payload.errors?.length) {
    const shopifyCodes = payload.errors.flatMap((error) =>
      error.extensions?.code ? [error.extensions.code] : [],
    );

    throw new WishlistServiceError(
      'ADMIN_GRAPHQL_ERROR',
      'Wishlist Admin API returned a GraphQL error.',
      {
        retryable: shopifyCodes.includes('THROTTLED'),
        shopifyCodes,
      },
    );
  }
  if (!payload.data) {
    throw new WishlistServiceError(
      'INVALID_ADMIN_RESPONSE',
      'Wishlist Admin API returned no data.',
      {retryable: true},
    );
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

class WishlistStaleWriteError extends WishlistServiceError {
  constructor() {
    super('STALE_WRITE_ERROR', 'Wishlist write conflicted with a newer value.', {
      retryable: true,
      shopifyCodes: ['STALE_OBJECT'],
    });
  }
}

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

  throw new WishlistServiceError(
    'METAFIELD_WRITE_ERROR',
    'Wishlist could not be saved.',
    {
      shopifyCodes: userErrors.flatMap((error) =>
        error.code ? [error.code] : [],
      ),
    },
  );
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
    throw new WishlistServiceError(
      'INVALID_CUSTOMER',
      'Invalid wishlist customer.',
    );
  }
  if (!isProductGid(productId)) {
    throw new WishlistServiceError(
      'INVALID_PRODUCT',
      'Invalid wishlist product.',
    );
  }

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

  throw new WishlistServiceError(
    'STALE_WRITE_ERROR',
    'Wishlist could not be saved after conflict retries.',
    {retryable: true, shopifyCodes: ['STALE_OBJECT']},
  );
}
