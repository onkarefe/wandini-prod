import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loadCustomerWishlistState} from '~/lib/customer-wishlist-state.server';
import {loader as favoritesLoader} from '~/routes/account.favorites';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';

vi.mock('~/lib/wishlist.server', () => ({
  getCustomerWishlistProductIds: vi.fn(),
}));

const getWishlistMock = vi.mocked(getCustomerWishlistProductIds);

function createCustomerAccount() {
  return {
    handleAuthStatus: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockResolvedValue(true),
    query: vi.fn().mockResolvedValue({
      data: {customer: {id: 'gid://shopify/Customer/100'}},
      errors: undefined,
    }),
    i18n: {language: 'DE'},
  };
}

beforeEach(() => {
  getWishlistMock.mockReset();
});

describe('wishlist loaders', () => {
  it('marks collection wishlist state unavailable and logs read failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const customerAccount = createCustomerAccount();
    getWishlistMock.mockRejectedValue(
      new Error('Temporary Admin API failure.'),
    );

    const result = await loadCustomerWishlistState({
      customerAccount: customerAccount as never,
      env: {} as Env,
      request: new Request('https://www.wandini.shop/collections/test'),
    });

    expect(result).toEqual({
      isLoggedIn: true,
      wishlistProductIds: [],
      wishlistStatus: 'unavailable',
    });
    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('contains login-state failures while loading collection wishlist state', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const customerAccount = createCustomerAccount();
    customerAccount.isLoggedIn.mockRejectedValue(
      new Error('Customer Account API unavailable.'),
    );

    const result = await loadCustomerWishlistState({
      customerAccount: customerAccount as never,
      env: {} as Env,
      request: new Request('https://www.wandini.shop/collections/test'),
    });

    expect(result).toEqual({
      isLoggedIn: false,
      wishlistProductIds: [],
      wishlistStatus: 'unavailable',
    });
    expect(getWishlistMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('returns a ready empty state when the customer has no favorites', async () => {
    const customerAccount = createCustomerAccount();
    getWishlistMock.mockResolvedValue([]);

    const result = await favoritesLoader({
      request: new Request('https://www.wandini.shop/account/favorites'),
      context: {
        customerAccount,
        storefront: {
          query: vi.fn(),
          i18n: {country: 'DE', language: 'DE'},
        },
        env: {},
      },
    } as never);

    expect(result).toEqual({favorites: [], wishlistStatus: 'ready'});
  });

  it('returns an unavailable state instead of throwing a favorites-page 500', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const customerAccount = createCustomerAccount();
    getWishlistMock.mockRejectedValue(
      new Error('Temporary Admin API failure.'),
    );

    const result = await favoritesLoader({
      request: new Request('https://www.wandini.shop/account/favorites'),
      context: {
        customerAccount,
        storefront: {
          query: vi.fn(),
          i18n: {country: 'DE', language: 'DE'},
        },
        env: {},
      },
    } as never);

    expect(result).toEqual({favorites: [], wishlistStatus: 'unavailable'});
    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
