import type {Route} from './+types/account_.authorize';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE}];
};

export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.authorize();
}
