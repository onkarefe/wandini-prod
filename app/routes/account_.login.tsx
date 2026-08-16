import type {Route} from './+types/account_.login';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  return context.customerAccount.login({
    countryCode: context.storefront.i18n.country,
    uiLocales: 'DE',
  });
}
