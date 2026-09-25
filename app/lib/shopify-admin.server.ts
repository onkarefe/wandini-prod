const ADMIN_API_VERSION = '2026-07';
const ADMIN_REQUEST_TIMEOUT_MS = 10_000;

export type ShopifyAdminEnv = Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'SHOPIFY_SHOP'
  | 'SHOPIFY_CLIENT_ID'
  | 'SHOPIFY_CLIENT_SECRET'
>;

type ShopifyAdminErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'ADMIN_API_ERROR'
  | 'ADMIN_GRAPHQL_ERROR'
  | 'INVALID_ADMIN_RESPONSE';

type ShopifyAdminErrorOptions = {
  cause?: unknown;
  retryable?: boolean;
  shopifyStatus?: number;
  shopifyCodes?: string[];
};

export class ShopifyAdminError extends Error {
  readonly code: ShopifyAdminErrorCode;
  readonly retryable: boolean;
  readonly shopifyStatus?: number;
  readonly shopifyCodes?: string[];

  constructor(
    code: ShopifyAdminErrorCode,
    message: string,
    options: ShopifyAdminErrorOptions = {},
  ) {
    super(message, {cause: options.cause});
    this.name = 'ShopifyAdminError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.shopifyStatus = options.shopifyStatus;
    this.shopifyCodes = options.shopifyCodes;
  }
}

type AdminGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {code?: string};
  }>;
};

type AdminAccessToken = {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

// One cache shared by newsletter and wishlist, using the existing app credentials.
let cachedAdminAccessToken: AdminAccessToken | null = null;

// Allows wishlist to preserve its existing error class, messages and diagnostics.
export function createAdminGraphqlClient(
  ErrorClass: new (
    code: ShopifyAdminErrorCode,
    message: string,
    options?: ShopifyAdminErrorOptions,
  ) => Error = ShopifyAdminError,
  serviceName = 'Shopify',
) {
  function normalizeShopDomain(value: string) {
    const candidate = value.includes('://') ? value : `https://${value}`;
    let url: URL;

    try {
      url = new URL(candidate);
    } catch (cause) {
      throw new ErrorClass(
        'CONFIGURATION_ERROR',
        `${serviceName} store domain is invalid.`,
        {cause},
      );
    }

    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith('.myshopify.com')) {
      throw new ErrorClass(
        'CONFIGURATION_ERROR',
        `${serviceName} store domain must be a myshopify.com domain.`,
      );
    }

    return hostname;
  }

  function getAdminConfig(env: ShopifyAdminEnv) {
    const shopValue = env.SHOPIFY_SHOP ?? env.PUBLIC_STORE_DOMAIN;
    const clientId = env.SHOPIFY_CLIENT_ID;
    const clientSecret = env.SHOPIFY_CLIENT_SECRET;

    if (!shopValue) {
      throw new ErrorClass(
        'CONFIGURATION_ERROR',
        `${serviceName} store domain is not configured.`,
      );
    }
    if (!clientId) {
      throw new ErrorClass(
        'CONFIGURATION_ERROR',
        `${serviceName} client ID is not configured.`,
      );
    }
    if (!clientSecret) {
      throw new ErrorClass(
        'CONFIGURATION_ERROR',
        `${serviceName} client secret is not configured.`,
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
    const timeout = setTimeout(
      () => controller.abort(),
      ADMIN_REQUEST_TIMEOUT_MS,
    );

    try {
      return await fetch(input, {...init, signal: controller.signal});
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getAdminAccessToken(env: ShopifyAdminEnv) {
    const {shop, clientId, clientSecret} = getAdminConfig(env);
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
      throw new ErrorClass(
        'AUTHENTICATION_ERROR',
        `${serviceName} authentication request failed.`,
        {cause, retryable: true},
      );
    }

    if (!response.ok) {
      throw new ErrorClass(
        'AUTHENTICATION_ERROR',
        `${serviceName} authentication failed with status ${response.status}.`,
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
      throw new ErrorClass(
        'INVALID_ADMIN_RESPONSE',
        `${serviceName} authentication returned an invalid response.`,
        {cause, retryable: true},
      );
    }

    if (!payload.access_token) {
      throw new ErrorClass(
        'INVALID_ADMIN_RESPONSE',
        `${serviceName} authentication returned no access token.`,
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
    env: ShopifyAdminEnv;
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
      throw new ErrorClass(
        'ADMIN_API_ERROR',
        `${serviceName} Admin API request failed.`,
        {cause, retryable: true},
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        cachedAdminAccessToken = null;
      }

      throw new ErrorClass(
        'ADMIN_API_ERROR',
        `${serviceName} Admin API failed with status ${response.status}.`,
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
      throw new ErrorClass(
        'INVALID_ADMIN_RESPONSE',
        `${serviceName} Admin API returned an invalid response.`,
        {cause, retryable: true},
      );
    }

    if (payload.errors?.length) {
      const shopifyCodes = payload.errors.flatMap((error) =>
        error.extensions?.code ? [error.extensions.code] : [],
      );

      throw new ErrorClass(
        'ADMIN_GRAPHQL_ERROR',
        `${serviceName} Admin API returned a GraphQL error.`,
        {
          retryable: shopifyCodes.includes('THROTTLED'),
          shopifyCodes,
        },
      );
    }
    if (!payload.data) {
      throw new ErrorClass(
        'INVALID_ADMIN_RESPONSE',
        `${serviceName} Admin API returned no data.`,
        {retryable: true},
      );
    }

    return payload.data;
  }

  return adminGraphql;
}

export const shopifyAdminGraphql = createAdminGraphqlClient();
