import type {Route} from './+types/api.wishlist';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {
  getWishlistRequestId,
  logWishlistError,
  WishlistServiceError,
  type WishlistOperation,
} from '~/lib/wishlist-errors.server';
import {
  WISHLIST_UPDATE_UNAVAILABLE_MESSAGE,
  type WishlistActionData,
} from '~/lib/wishlist';
import {toggleProductInCustomerWishlist} from '~/lib/wishlist.server';

function getLoginUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const referer = request.headers.get('Referer');
  let returnTo = '/';

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin === requestUrl.origin) {
        returnTo = `${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`;
      }
    } catch {
      // Keep the safe root fallback for an invalid Referer header.
    }
  }

  return `/account/login?return_to=${encodeURIComponent(returnTo)}`;
}

function isValidProductGid(value: FormDataEntryValue | null): value is string {
  return (
    typeof value === 'string' && /^gid:\/\/shopify\/Product\/\d+$/.test(value)
  );
}

function parseDesiredWishlisted(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function unavailableResponse(requestId: string, status = 503) {
  return Response.json(
    {
      ok: false,
      message: WISHLIST_UPDATE_UNAVAILABLE_MESSAGE,
    } satisfies WishlistActionData,
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Wishlist-Request-Id': requestId,
      },
    },
  );
}

export async function action({request, context}: Route.ActionArgs) {
  const requestId = getWishlistRequestId(request);
  let isLoggedIn: boolean;

  try {
    isLoggedIn = await context.customerAccount.isLoggedIn();
  } catch (error) {
    logWishlistError({error, operation: 'resolve_customer', requestId});
    return unavailableResponse(requestId);
  }

  if (!isLoggedIn) {
    return Response.json(
      {
        ok: false,
        loginUrl: getLoginUrl(request),
        message: 'Login required.',
      },
      {status: 401},
    );
  }

  const formData = await request.formData();
  const productId = formData.get('productId');
  const desiredWishlisted = parseDesiredWishlisted(
    formData.get('desiredWishlisted'),
  );

  if (!isValidProductGid(productId) || desiredWishlisted === null) {
    return unavailableResponse(requestId, 400);
  }

  let operation: WishlistOperation = 'resolve_customer';

  try {
    const {data, errors} = await context.customerAccount.query(
      CUSTOMER_WISHLIST_OWNER_QUERY,
      {
        variables: {language: context.customerAccount.i18n.language},
      },
    );

    if (errors?.length || !data?.customer?.id) {
      throw new WishlistServiceError(
        'CUSTOMER_ACCOUNT_ERROR',
        'Customer could not be resolved for a wishlist update.',
        {retryable: true},
      );
    }

    operation = 'update_wishlist';
    const result = await toggleProductInCustomerWishlist({
      env: context.env,
      customerId: data.customer.id,
      productId,
      desiredWishlisted,
    });

    return Response.json(
      {
        ok: true,
        wishlistCount: result.wishlist.length,
        wishlisted: result.wishlisted,
      } satisfies WishlistActionData,
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    logWishlistError({error, operation, requestId});
    return unavailableResponse(requestId);
  }
}
