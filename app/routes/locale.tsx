import {Outlet, redirect} from 'react-router';
import type {Route} from './+types/locale';
import {
  getCanonicalLocalePathname,
  getLocaleFromParam,
} from '~/lib/locale';

export async function loader({request, params}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const canonicalPathname = getCanonicalLocalePathname(url.pathname);

  if (canonicalPathname !== url.pathname) {
    throw redirect(`${canonicalPathname}${url.search}${url.hash}`, 301);
  }

  if (params.locale && !getLocaleFromParam(params.locale)) {
    throw new Response(null, {status: 404});
  }

  return null;
}

export default function LocaleLayout() {
  return <Outlet />;
}
