import type {CustomerAccount} from '@shopify/hydrogen';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';

export async function loadCustomerWishlistState({
  customerAccount,
  env,
  isLoggedIn: knownLoginState,
}: {
  customerAccount: CustomerAccount;
  env: Env;
  isLoggedIn?: boolean;
}) {
  const isLoggedIn =
    knownLoginState ?? (await customerAccount.isLoggedIn());

  if (!isLoggedIn) {
    return {isLoggedIn: false, wishlistProductIds: []};
  }

  try {
    const {data, errors} = await customerAccount.query(
      CUSTOMER_WISHLIST_OWNER_QUERY,
      {
        variables: {language: customerAccount.i18n.language},
      },
    );

    if (errors?.length || !data?.customer?.id) {
      return {isLoggedIn: true, wishlistProductIds: []};
    }

    const wishlistProductIds = await getCustomerWishlistProductIds({
      env,
      customerId: data.customer.id,
    });

    return {isLoggedIn: true, wishlistProductIds};
  } catch {
    return {isLoggedIn: true, wishlistProductIds: []};
  }
}
