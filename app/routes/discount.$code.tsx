import {redirect} from 'react-router';
import type {Route} from './+types/discount.$code';
import {getLocaleFromRequest, prefixPathWithLocale} from '~/lib/locale';

const INTERNAL_REDIRECT_ORIGIN = 'https://wandini.internal';

function getSafeRedirectPath(redirectParam: string | null) {
  const trimmedRedirect = redirectParam?.trim();

  if (
    !trimmedRedirect ||
    !trimmedRedirect.startsWith('/') ||
    trimmedRedirect.startsWith('//') ||
    trimmedRedirect.includes('\\')
  ) {
    return '/';
  }

  try {
    const redirectUrl = new URL(trimmedRedirect, INTERNAL_REDIRECT_ORIGIN);

    if (redirectUrl.origin !== INTERNAL_REDIRECT_ORIGIN) {
      return '/';
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return '/';
  }
}

function buildRedirectUrl(
  redirectPath: string,
  searchParams: URLSearchParams,
) {
  const redirectUrl = new URL(redirectPath, INTERNAL_REDIRECT_ORIGIN);

  for (const [key, value] of searchParams) {
    redirectUrl.searchParams.append(key, value);
  }

  return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

/**
 * Automatically applies a discount found on the url
 * If a cart exists it's updated with the discount, otherwise a cart is created with the discount already applied
 *
 * @example
 * Example path applying a discount and optional redirecting (defaults to the home page)
 * ```js
 * /discount/FREESHIPPING?redirect=/products
 *
 * ```
 */
export async function loader({request, context, params}: Route.LoaderArgs) {
  const {cart} = context;
  const {code} = params;

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const redirectPath = getSafeRedirectPath(
    searchParams.get('redirect') || searchParams.get('return_to') || '/',
  );

  searchParams.delete('redirect');
  searchParams.delete('return_to');

  const redirectUrl = buildRedirectUrl(
    prefixPathWithLocale(redirectPath, getLocaleFromRequest(request)),
    searchParams,
  );

  if (!code) {
    return redirect(redirectUrl);
  }

  try {
    const result = await cart.updateDiscountCodes([code]);
    const cartId = result.cart?.id;

    if (!cartId) {
      return redirect(redirectUrl, {status: 303});
    }

    const headers = cart.setCartId(cartId);

    // Using set-cookie on a 303 redirect will not work if the domain origin have port number (:3000)
    // If there is no cart id and a new cart id is created in the progress, it will not be set in the cookie
    // on localhost:3000
    return redirect(redirectUrl, {
      status: 303,
      headers,
    });
  } catch {
    return redirect(redirectUrl, {status: 303});
  }
}
