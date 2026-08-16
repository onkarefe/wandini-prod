import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  getWishlistRequestId,
  logWishlistError,
  WishlistServiceError,
} from '~/lib/wishlist-errors.server';
import {
  getCustomerWishlistProductIds,
  toggleProductInCustomerWishlist,
} from '~/lib/wishlist.server';

const CUSTOMER_ID = 'gid://shopify/Customer/100';
const PRODUCT_ID = 'gid://shopify/Product/200';
let envSequence = 0;

function createEnv() {
  envSequence += 1;

  return {
    PUBLIC_STORE_DOMAIN: 'wishlist-tests.myshopify.com',
    SHOPIFY_CLIENT_ID: `test-client-${envSequence}`,
    SHOPIFY_CLIENT_SECRET: 'test-secret',
  } as Env;
}

function tokenResponse() {
  return Response.json({access_token: 'test-access-token', expires_in: 3600});
}

function snapshotResponse(productIds: unknown[], compareDigest = 'digest-1') {
  return Response.json({
    data: {
      customer: {
        metafield: {
          value: JSON.stringify(productIds),
          compareDigest,
        },
      },
    },
  });
}

function successfulWriteResponse() {
  return Response.json({
    data: {
      metafieldsSet: {
        metafields: [],
        userErrors: [],
      },
    },
  });
}

function staleWriteResponse() {
  return Response.json({
    data: {
      metafieldsSet: {
        metafields: [],
        userErrors: [
          {
            field: ['metafields'],
            message: 'Stale value.',
            code: 'STALE_OBJECT',
          },
        ],
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wishlist storage', () => {
  it('normalizes invalid and duplicate product IDs and enforces the Shopify limit', async () => {
    const productIds = Array.from(
      {length: 130},
      (_, index) => `gid://shopify/Product/${index + 1}`,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        snapshotResponse([
          productIds[0],
          'invalid-product-id',
          productIds[0],
          ...productIds.slice(1),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCustomerWishlistProductIds({
      env: createEnv(),
      customerId: CUSTOMER_ID,
    });

    expect(result).toHaveLength(128);
    expect(new Set(result).size).toBe(128);
    expect(result[0]).toBe(productIds[0]);
    expect(result).not.toContain('invalid-product-id');
  });

  it('keeps an idempotent add operation read-only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(snapshotResponse([PRODUCT_ID]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await toggleProductInCustomerWishlist({
      env: createEnv(),
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      desiredWishlisted: true,
    });

    expect(result).toEqual({wishlist: [PRODUCT_ID], wishlisted: true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('writes the new value with the current compare digest', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(snapshotResponse([], 'current-digest'))
      .mockResolvedValueOnce(successfulWriteResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await toggleProductInCustomerWishlist({
      env: createEnv(),
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      desiredWishlisted: true,
    });
    const mutationCall = fetchMock.mock.calls[2] as [string, RequestInit];
    const mutationBody = JSON.parse(String(mutationCall[1].body)) as {
      variables: {
        metafields: Array<{compareDigest: string; value: string}>;
      };
    };

    expect(result).toEqual({wishlist: [PRODUCT_ID], wishlisted: true});
    expect(mutationBody.variables.metafields[0]).toMatchObject({
      compareDigest: 'current-digest',
      value: JSON.stringify([PRODUCT_ID]),
    });
  });

  it('retries stale writes three times and returns a classified error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(snapshotResponse([], 'digest-1'))
      .mockResolvedValueOnce(staleWriteResponse())
      .mockResolvedValueOnce(snapshotResponse([], 'digest-2'))
      .mockResolvedValueOnce(staleWriteResponse())
      .mockResolvedValueOnce(snapshotResponse([], 'digest-3'))
      .mockResolvedValueOnce(staleWriteResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      toggleProductInCustomerWishlist({
        env: createEnv(),
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        desiredWishlisted: true,
      }),
    ).rejects.toMatchObject({code: 'STALE_WRITE_ERROR', retryable: true});
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('rejects invalid Shopify IDs before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      toggleProductInCustomerWishlist({
        env: createEnv(),
        customerId: 'invalid-customer',
        productId: PRODUCT_ID,
      }),
    ).rejects.toMatchObject({code: 'INVALID_CUSTOMER'});
    await expect(
      toggleProductInCustomerWishlist({
        env: createEnv(),
        customerId: CUSTOMER_ID,
        productId: 'invalid-product',
      }),
    ).rejects.toMatchObject({code: 'INVALID_PRODUCT'});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('wishlist diagnostics', () => {
  it('redacts secrets from structured server logs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secretToken = 'shpat_thismustnotbelogged';

    logWishlistError({
      error: new WishlistServiceError(
        'AUTHENTICATION_ERROR',
        `Bearer ${secretToken} client_secret=also-secret`,
      ),
      operation: 'update_wishlist',
      requestId: 'request-123',
    });

    const logLine = String(consoleSpy.mock.calls[0]?.[0]);
    expect(logLine).toContain('request-123');
    expect(logLine).toContain('AUTHENTICATION_ERROR');
    expect(logLine).not.toContain(secretToken);
    expect(logLine).not.toContain('also-secret');
  });

  it('accepts safe upstream request IDs and rejects unsafe values', () => {
    const safeRequest = new Request('https://www.wandini.shop', {
      headers: {'cf-ray': 'safe-request-123'},
    });
    const unsafeRequest = new Request('https://www.wandini.shop', {
      headers: {'cf-ray': 'unsafe request value'},
    });

    expect(getWishlistRequestId(safeRequest)).toBe('safe-request-123');
    expect(getWishlistRequestId(unsafeRequest)).not.toBe(
      'unsafe request value',
    );
  });
});
