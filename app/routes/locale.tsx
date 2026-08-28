import {Outlet, redirect} from 'react-router';
import type {Route} from './+types/locale';
import {
  getCanonicalLocalePathname,
  getLocaleFromParam,
} from '~/lib/locale';
import {buildSeoRedirectLocation} from '~/lib/redirect';

export async function loader({request, params}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const localeCanonicalPathname = getCanonicalLocalePathname(url.pathname);
  const canonicalPathname =
    localeCanonicalPathname === '/collections/all'
      ? '/collections'
      : localeCanonicalPathname === '/en/collections/all'
        ? '/en/collections'
        : localeCanonicalPathname;

  if (canonicalPathname !== url.pathname) {
    url.pathname = canonicalPathname;
    throw redirect(buildSeoRedirectLocation(url), 301);
  }

  if (params.locale && !getLocaleFromParam(params.locale)) {
    throw new Response(null, {status: 404});
  }

  return null;
}

export default function LocaleLayout() {
  return <Outlet />;
}
