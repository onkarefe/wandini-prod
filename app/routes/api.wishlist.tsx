import type {Route} from './+types/api.wishlist';
import {toggleProductInCustomerWishlist} from '~/lib/wishlist.server';

const CUSTOMER_WISHLIST_OWNER_QUERY = `#graphql
  query WishlistCustomerOwner($language: LanguageCode)
  @inContext(language: $language) {
    customer {
      id
    }
  }
` as const;

function getLoginUrl(request: Request) {
  const url = new URL(request.url);
  return `/account/login?returnTo=${encodeURIComponent(
    `${url.pathname}${url.search}${url.hash}`,
  )}`;
}

function isValidProductGid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.startsWith('gid://shopify/Product/')
  );
}

export async function action({request, context}: Route.ActionArgs) {
  const isLoggedIn = await context.customerAccount.isLoggedIn();

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

  if (!isValidProductGid(productId)) {
    return Response.json(
      {
        ok: false,
        message: 'Invalid product id.',
      },
      {status: 400},
    );
  }

  const {data, errors} = await context.customerAccount.query(
    CUSTOMER_WISHLIST_OWNER_QUERY,
    {
      variables: {
        language: context.customerAccount.i18n.language,
      },
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
      env: context.env as {
        SHOPIFY_SHOP?: string;
        SHOPIFY_CLIENT_ID?: string;
        SHOPIFY_CLIENT_SECRET?: string;
      },
      customerId: data.customer.id,
      productId,
    });

    return Response.json({
      ok: true,
      message: result.wishlisted
        ? 'Product added to wishlist.'
        : 'Product removed from wishlist.',
      wishlistCount: result.wishlist.length,
      wishlisted: result.wishlisted,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Wishlist update failed unexpectedly.',
      },
      {status: 500},
    );
  }
}
