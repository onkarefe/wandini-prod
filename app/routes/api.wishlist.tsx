import type {Route} from './+types/api.wishlist';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
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

export async function action({request, context}: Route.ActionArgs) {
  if (!(await context.customerAccount.isLoggedIn())) {
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
    return Response.json(
      {ok: false, message: 'Invalid wishlist request.'},
      {status: 400},
    );
  }

  const {data, errors} = await context.customerAccount.query(
    CUSTOMER_WISHLIST_OWNER_QUERY,
    {
      variables: {language: context.customerAccount.i18n.language},
    },
  );

  if (errors?.length || !data?.customer?.id) {
    return Response.json(
      {
        ok: false,
        message: 'Customer could not be resolved for wishlist updates.',
      },
      {status: 500},
    );
  }

  try {
    const result = await toggleProductInCustomerWishlist({
      env: context.env,
      customerId: data.customer.id,
      productId,
      desiredWishlisted,
    });

    return Response.json({
      ok: true,
      message: result.wishlisted
        ? 'Product added to wishlist.'
        : 'Product removed from wishlist.',
      wishlistCount: result.wishlist.length,
      wishlisted: result.wishlisted,
    });
  } catch {
    return Response.json(
      {ok: false, message: 'Wishlist update failed.'},
      {status: 502},
    );
  }
}
