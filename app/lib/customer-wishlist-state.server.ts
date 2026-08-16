import type {CustomerAccount} from '@shopify/hydrogen';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {
  getWishlistRequestId,
  logWishlistError,
  WishlistServiceError,
} from '~/lib/wishlist-errors.server';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';

export async function loadCustomerWishlistState({
  customerAccount,
  env,
  isLoggedIn: knownLoginState,
  request,
}: {
  customerAccount: CustomerAccount;
  env: Env;
  isLoggedIn?: boolean;
  request?: Request;
}) {
  const requestId = getWishlistRequestId(request);
  let isLoggedIn: boolean;

  try {
    isLoggedIn = knownLoginState ?? (await customerAccount.isLoggedIn());
  } catch (error) {
    logWishlistError({error, operation: 'resolve_customer', requestId});
    return {
      isLoggedIn: false,
      wishlistProductIds: [],
      wishlistStatus: 'unavailable' as const,
    };
  }

  if (!isLoggedIn) {
    return {
      isLoggedIn: false,
      wishlistProductIds: [],
      wishlistStatus: 'ready' as const,
    };
  }

  try {
    const {data, errors} = await customerAccount.query(
      CUSTOMER_WISHLIST_OWNER_QUERY,
      {
        variables: {language: customerAccount.i18n.language},
      },
    );

    if (errors?.length || !data?.customer?.id) {
      throw new WishlistServiceError(
        'CUSTOMER_ACCOUNT_ERROR',
        'Customer could not be resolved while loading wishlist state.',
        {retryable: true},
      );
    }

    const wishlistProductIds = await getCustomerWishlistProductIds({
      env,
      customerId: data.customer.id,
    });

    return {
      isLoggedIn: true,
      wishlistProductIds,
      wishlistStatus: 'ready' as const,
    };
  } catch (error) {
    logWishlistError({
      error,
      operation: 'load_collection_state',
      requestId,
    });

    return {
      isLoggedIn: true,
      wishlistProductIds: [],
      wishlistStatus: 'unavailable' as const,
    };
  }
}
