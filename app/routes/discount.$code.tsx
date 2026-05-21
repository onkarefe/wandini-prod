import {Form, redirect, useLoaderData, useLocation} from 'react-router';
import type {Route} from './+types/discount.$code';
import {getLocaleFromRequest, prefixPathWithLocale} from '~/lib/locale';
import {Link} from '~/lib/i18n-router';

const INTERNAL_REDIRECT_ORIGIN = 'https://wandini.internal';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

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

  return {code, redirectUrl};
}

export async function action({request, context, params}: Route.ActionArgs) {
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

export default function DiscountCodeConfirmation() {
  const {code, redirectUrl} = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '32rem',
          border: '1px solid #d9d9d9',
          borderRadius: '1rem',
          padding: '1.5rem',
          background: '#fff',
        }}
      >
        <h1 style={{fontSize: '1.5rem', marginBottom: '0.75rem'}}>
          Apply discount code?
        </h1>
        <p style={{marginBottom: '1rem'}}>
          This will apply <strong>{code}</strong> to your cart and continue.
        </p>
        <Form method="post" action={`${location.pathname}${location.search}`}>
          <button type="submit">Apply discount</button>
        </Form>
        <p style={{marginTop: '1rem'}}>
          <Link to={redirectUrl}>Cancel</Link>
        </p>
      </div>
    </main>
  );
}
