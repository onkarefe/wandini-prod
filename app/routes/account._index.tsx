import type {Route} from './+types/account._index';
import {redirectToLocalePath} from '~/lib/locale';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE}];
};

export async function loader({request}: Route.LoaderArgs) {
  return redirectToLocalePath(request, '/account/orders');
}
