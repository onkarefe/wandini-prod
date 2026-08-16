import {beforeEach, describe, expect, it, vi} from 'vitest';
// Kept outside app/routes so React Router never treats this test as a route.
import {action} from '~/routes/api.wishlist';
import {WishlistServiceError} from '~/lib/wishlist-errors.server';
import {WISHLIST_UPDATE_UNAVAILABLE_MESSAGE} from '~/lib/wishlist';
import {toggleProductInCustomerWishlist} from '~/lib/wishlist.server';

vi.mock('~/lib/wishlist.server', () => ({
  toggleProductInCustomerWishlist: vi.fn(),
}));

const toggleWishlistMock = vi.mocked(toggleProductInCustomerWishlist);

function createRequest(productId = 'gid://shopify/Product/200') {
  const formData = new FormData();
  formData.set('productId', productId);
  formData.set('desiredWishlisted', 'true');

  return new Request('https://www.wandini.shop/api/wishlist', {
    method: 'POST',
    headers: {Referer: 'https://www.wandini.shop/collections/test'},
    body: formData,
  });
}

function createContext({
  isLoggedIn = true,
  queryResult = {
    data: {customer: {id: 'gid://shopify/Customer/100'}},
    errors: undefined,
  },
}: {
  isLoggedIn?: boolean;
  queryResult?: unknown;
} = {}) {
  return {
    env: {},
    customerAccount: {
      isLoggedIn: vi.fn().mockResolvedValue(isLoggedIn),
      query: vi.fn().mockResolvedValue(queryResult),
      i18n: {language: 'DE'},
    },
  };
}

beforeEach(() => {
  toggleWishlistMock.mockReset();
});

describe('wishlist action', () => {
  it('returns a generic 503 response and logs the technical update error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    toggleWishlistMock.mockRejectedValue(
      new WishlistServiceError(
        'AUTHENTICATION_ERROR',
        'Authentication failed with status 401.',
      ),
    );

    const response = await action({
      request: createRequest(),
      context: createContext(),
    } as never);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      message: WISHLIST_UPDATE_UNAVAILABLE_MESSAGE,
    });
    expect(response.headers.get('X-Wishlist-Request-Id')).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(String(consoleSpy.mock.calls[0]?.[0])).toContain(
      'AUTHENTICATION_ERROR',
    );
  });

  it('turns customer resolution failures into the same generic response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = createContext({queryResult: {data: null, errors: [{}]}});

    const response = await action({
      request: createRequest(),
      context,
    } as never);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(payload.message).toBe(WISHLIST_UPDATE_UNAVAILABLE_MESSAGE);
    expect(toggleWishlistMock).not.toHaveBeenCalled();
    expect(String(consoleSpy.mock.calls[0]?.[0])).toContain(
      'CUSTOMER_ACCOUNT_ERROR',
    );
  });

  it('contains login-state service failures instead of throwing a route 500', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = createContext();
    context.customerAccount.isLoggedIn.mockRejectedValue(
      new Error('Customer Account API unavailable.'),
    );

    const response = await action({
      request: createRequest(),
      context,
    } as never);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(payload.message).toBe(WISHLIST_UPDATE_UNAVAILABLE_MESSAGE);
    expect(context.customerAccount.query).not.toHaveBeenCalled();
    expect(toggleWishlistMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('keeps the safe same-origin login return URL for anonymous users', async () => {
    const response = await action({
      request: createRequest(),
      context: createContext({isLoggedIn: false}),
    } as never);
    const payload = (await response.json()) as {loginUrl?: string};

    expect(response.status).toBe(401);
    expect(payload.loginUrl).toBe(
      '/account/login?return_to=%2Fcollections%2Ftest',
    );
    expect(toggleWishlistMock).not.toHaveBeenCalled();
  });

  it('returns only the safe wishlist state after a successful update', async () => {
    toggleWishlistMock.mockResolvedValue({
      wishlist: ['gid://shopify/Product/200'],
      wishlisted: true,
    });

    const response = await action({
      request: createRequest(),
      context: createContext(),
    } as never);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ok: true, wishlistCount: 1, wishlisted: true});
  });
});
