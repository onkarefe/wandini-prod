import type {Route} from './+types/account_.authorize';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.authorize();
}
