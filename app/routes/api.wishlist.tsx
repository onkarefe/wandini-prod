import type {Route} from './+types/api.wishlist';

function getLoginUrl(request: Request) {
  const url = new URL(request.url);
  return `/account/login?returnTo=${encodeURIComponent(
    `${url.pathname}${url.search}${url.hash}`,
  )}`;
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

  return Response.json(
    {
      ok: false,
      message: 'Wishlist is temporarily unavailable.',
      wishlistCount: 0,
      wishlisted: false,
    },
    {status: 200},
  );
}
