import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import favicon from '~/assets/favicon.png';
import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments';
import resetStyles from '~/styles/reset.css?url';
import appStyles from '~/styles/app.css?url';
import tailwindCss from './styles/tailwind.css?url';
import navStyles from '~/styles/nav.css?url';
import {PageLayout} from './components/PageLayout';
import {getLocaleFromI18n} from '~/lib/locale';
import {useEffect, useState} from 'react';

export type RootLoader = typeof loader;

/**
 * This is important to avoid re-fetching root queries on sub-navigations
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') return true;

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) return true;

  // Defaulting to no revalidation for root loader data to improve performance.
  // When using this feature, you risk your UI getting out of sync with your server.
  // Use with caution. If you are uncomfortable with this optimization, update the
  // line below to `return defaultShouldRevalidate` instead.
  // For more details see: https://remix.run/docs/en/main/route/should-revalidate
  return false;
};

/**
 * The main and reset stylesheets are added in the Layout component
 * to prevent a bug in development HMR updates.
 *
 * This avoids the "failed to execute 'insertBefore' on 'Node'" error
 * that occurs after editing and navigating to another page.
 *
 * It's a temporary fix until the issue is resolved.
 * https://github.com/remix-run/remix/issues/9242
 */
export function links() {
  return [
    {rel: 'stylesheet', href: navStyles},
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: ''},

    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&display=swap',
    },
    {rel: 'icon', type: 'image/png', href: favicon},
  ];
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  const {storefront, env} = args.context;

  return {
    ...deferredData,
    ...criticalData,
    selectedLocale: getLocaleFromI18n(args.context.storefront.i18n),
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: false,
      // localize the privacy banner
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
  };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;

  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {header};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront, customerAccount, cart} = context;

  // defer the footer query (below the fold)
  const footer = storefront
    .query(FOOTER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        footerMenuHandle: 'footer', // Adjust to your footer menu handle
      },
    })
    .catch((error: Error) => {
      // Log query errors, but don't throw them so the page can still render
      console.error(error);
      return null;
    });
  return {
    cart: cart.get(),
    isLoggedIn: customerAccount.isLoggedIn(),
    footer,
  };
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();
  const data = useRouteLoaderData<RootLoader>('root');
  const lang = data?.selectedLocale?.htmlLang ?? 'en';

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={tailwindCss}></link>
        <link rel="stylesheet" href={resetStyles}></link>
        <link rel="stylesheet" href={appStyles}></link>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setIsHydrated(true);
    setIsAuth(window.sessionStorage.getItem('isAuth') === 'true');
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (input === 'admin123') {
      setIsAuth(true);
      window.sessionStorage.setItem('isAuth', 'true');
      return;
    }

    setError('Wrong password!');
  };

  if (!data) {
    return <Outlet />;
  }

  const appContent = (
    <PageLayout {...data}>
      <Outlet />
    </PageLayout>
  );

  const hasAnalyticsConsentConfig =
    Boolean(data.consent.checkoutDomain) &&
    Boolean(data.consent.storefrontAccessToken);

  const renderedApp = hasAnalyticsConsentConfig ? (
    <Analytics.Provider cart={data.cart} shop={data.shop} consent={data.consent}>
      {appContent}
    </Analytics.Provider>
  ) : (
    appContent
  );

  const showAuthOverlay = import.meta.env.DEV && isHydrated && !isAuth;

  return (
    <>
      {renderedApp}
      {showAuthOverlay ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(245,245,245,0.96)',
            padding: 24,
          }}
        >
          <form
            onSubmit={handleLogin}
            style={{
              background: '#fff',
              padding: 32,
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <h2 style={{marginBottom: 16}}>Enter Password</h2>
            <input
              type="password"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              placeholder="Password"
              style={{
                padding: 8,
                width: 200,
                marginBottom: 12,
                border: '1px solid #ccc',
                borderRadius: 4,
              }}
            />
            <br />
            <button
              type="submit"
              style={{
                padding: '8px 24px',
                borderRadius: 4,
                background: '#222',
                color: '#fff',
                border: 'none',
              }}
            >
              Login
            </button>
            {error ? <div style={{color: 'red', marginTop: 8}}>{error}</div> : null}
          </form>
        </div>
      ) : null}
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isDevelopment = import.meta.env.DEV;
  let errorMessage = 'Something went wrong.';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    if (isDevelopment) {
      errorMessage = error?.data?.message ?? error.data ?? errorMessage;
    }
  } else if (error instanceof Error) {
    if (isDevelopment) {
      errorMessage = error.message;
    }
  }

  return (
    <div className="route-error">
      <h1>Oops</h1>
      <h2>{errorStatus}</h2>
      {errorMessage && (
        <fieldset>
          <pre>{errorMessage}</pre>
        </fieldset>
      )}
    </div>
  );
}
