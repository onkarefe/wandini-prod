import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  shopifyAdminGraphql,
  type ShopifyAdminEnv,
} from './shopify-admin.server';
import {getCustomerWishlistProductIds} from './wishlist.server';
import {WishlistServiceError} from './wishlist-errors.server';

let sequence = 0;
function config(): ShopifyAdminEnv {
  sequence += 1;
  return {
    PUBLIC_STORE_DOMAIN: 'shared-admin-test.myshopify.com',
    SHOPIFY_CLIENT_ID: `shared-test-${sequence}`,
    SHOPIFY_CLIENT_SECRET: 'fake-secret',
  };
}

function token(value = 'fake-token') {
  return Response.json({access_token: value, expires_in: 3600});
}

function snapshot() {
  return Response.json({data: {customer: {metafield: null}}});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('extracted Admin authentication', () => {
  it('refreshes the shared token sixty seconds before expiry', async () => {
    vi.useFakeTimers();
    const env = config();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(token('first-token'))
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(token('refreshed-token'))
      .mockResolvedValueOnce(snapshot());
    vi.stubGlobal('fetch', fetchMock);
    const query = 'query SharedTest { customer { id } }';

    await shopifyAdminGraphql({env, query});
    vi.advanceTimersByTime(3_539_000);
    await shopifyAdminGraphql({env, query});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1000);
    await getCustomerWishlistProductIds({
      env,
      customerId: 'gid://shopify/Customer/123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][1].headers['X-Shopify-Access-Token']).toBe(
      'refreshed-token',
    );
  });

  it.each([401, 403])(
    'invalidates the shared cache after Admin HTTP %s',
    async (status) => {
      const env = config();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(null, {status}))
        .mockResolvedValueOnce(token('replacement-token'))
        .mockResolvedValueOnce(snapshot());
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        shopifyAdminGraphql({env, query: 'query Test { shop { id } }'}),
      ).rejects.toMatchObject({code: 'ADMIN_API_ERROR', shopifyStatus: status});
      await getCustomerWishlistProductIds({
        env,
        customerId: 'gid://shopify/Customer/123',
      });
      expect(fetchMock.mock.calls[2][0]).toBe(
        'https://shared-admin-test.myshopify.com/admin/oauth/access_token',
      );
      expect(fetchMock.mock.calls[3][1].headers['X-Shopify-Access-Token']).toBe(
        'replacement-token',
      );
    },
  );

  it.each([
    [
      'configuration',
      'CONFIGURATION_ERROR',
      'Wishlist client secret is not configured.',
      false,
    ],
    [
      'authentication',
      'AUTHENTICATION_ERROR',
      'Wishlist authentication failed with status 401.',
      false,
    ],
    [
      'transport',
      'ADMIN_API_ERROR',
      'Wishlist Admin API failed with status 503.',
      true,
    ],
    [
      'graphql',
      'ADMIN_GRAPHQL_ERROR',
      'Wishlist Admin API returned a GraphQL error.',
      true,
    ],
  ] as const)(
    'preserves wishlist %s errors and diagnostics',
    async (stage, code, message, retryable) => {
      const env = config();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      if (stage === 'configuration') env.SHOPIFY_CLIENT_SECRET = undefined;
      else if (stage === 'authentication')
        fetchMock.mockResolvedValueOnce(new Response(null, {status: 401}));
      else {
        fetchMock
          .mockResolvedValueOnce(token())
          .mockResolvedValueOnce(
            stage === 'transport'
              ? new Response(null, {status: 503})
              : Response.json({
                  errors: [
                    {message: 'Private error', extensions: {code: 'THROTTLED'}},
                  ],
                }),
          );
      }
      const result = getCustomerWishlistProductIds({
        env,
        customerId: 'gid://shopify/Customer/123',
      });
      await expect(result).rejects.toBeInstanceOf(WishlistServiceError);
      await expect(result).rejects.toMatchObject({
        name: 'WishlistServiceError',
        code,
        message,
        retryable,
      });
      if (stage === 'transport')
        await expect(result).rejects.toMatchObject({shopifyStatus: 503});
      if (stage === 'graphql')
        await expect(result).rejects.toMatchObject({
          shopifyCodes: ['THROTTLED'],
        });
    },
  );
});
