import type {Route} from './+types/account_.login';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  return context.customerAccount.login({
    countryCode: context.storefront.i18n.country,
    uiLocales: 'DE',
  });
}
