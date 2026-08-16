export type WishlistOperation =
  | 'resolve_customer'
  | 'load_collection_state'
  | 'load_favorites'
  | 'load_favorite_products'
  | 'update_wishlist';

export type WishlistErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'CUSTOMER_ACCOUNT_ERROR'
  | 'ADMIN_API_ERROR'
  | 'ADMIN_GRAPHQL_ERROR'
  | 'INVALID_ADMIN_RESPONSE'
  | 'INVALID_CUSTOMER'
  | 'INVALID_PRODUCT'
  | 'METAFIELD_WRITE_ERROR'
  | 'STALE_WRITE_ERROR'
  | 'UNEXPECTED_ERROR';

type WishlistServiceErrorOptions = {
  cause?: unknown;
  retryable?: boolean;
  shopifyStatus?: number;
  shopifyCodes?: string[];
};

export class WishlistServiceError extends Error {
  readonly code: WishlistErrorCode;
  readonly retryable: boolean;
  readonly shopifyStatus?: number;
  readonly shopifyCodes?: string[];

  constructor(
    code: WishlistErrorCode,
    message: string,
    options: WishlistServiceErrorOptions = {},
  ) {
    super(message, {cause: options.cause});
    this.name = 'WishlistServiceError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.shopifyStatus = options.shopifyStatus;
    this.shopifyCodes = options.shopifyCodes;
  }
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bshp[a-z]{2,6}_[A-Za-z0-9]+\b/gi, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:client_secret|access_token|session_secret)["'=:\s]+)[^\s,;}]+/gi,
      '$1[REDACTED]',
    )
    .slice(0, 1_000);
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getWishlistRequestId(request?: Request) {
  const forwardedRequestId =
    request?.headers.get('cf-ray') ?? request?.headers.get('x-request-id');

  if (
    forwardedRequestId &&
    forwardedRequestId.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(forwardedRequestId)
  ) {
    return forwardedRequestId;
  }

  return createRequestId();
}

export function logWishlistError({
  error,
  operation,
  requestId,
}: {
  error: unknown;
  operation: WishlistOperation;
  requestId: string;
}) {
  const serviceError =
    error instanceof WishlistServiceError ? error : undefined;
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown wishlist error.';

  console.error(
    JSON.stringify({
      event: 'wishlist_error',
      requestId,
      operation,
      code: serviceError?.code ?? 'UNEXPECTED_ERROR',
      retryable: serviceError?.retryable ?? false,
      shopifyStatus: serviceError?.shopifyStatus,
      shopifyCodes: serviceError?.shopifyCodes,
      errorName: error instanceof Error ? error.name : typeof error,
      message: sanitizeLogValue(errorMessage),
    }),
  );
}
