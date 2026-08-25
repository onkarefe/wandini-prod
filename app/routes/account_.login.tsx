import type {Route} from './+types/account_.login';
import {redirect} from 'react-router';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import {getLocaleFromRequest, prefixPathWithLocale} from '~/lib/locale';
import {
  getCustomerAccountUiLocale,
  getSafeAccountReturnPath,
} from '~/lib/account-locale';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const requestUrl = new URL(request.url);
  const returnTo = getSafeAccountReturnPath(request, locale);

  if (requestUrl.searchParams.get('return_to') !== returnTo) {
    const loginUrl = new URL(
      prefixPathWithLocale('/account/login', locale),
      requestUrl.origin,
    );
    loginUrl.searchParams.set('return_to', returnTo);

    return redirect(`${loginUrl.pathname}${loginUrl.search}`);
  }

  return context.customerAccount.login({
    countryCode: context.storefront.i18n.country,
    uiLocales: getCustomerAccountUiLocale(locale),
  });
}
