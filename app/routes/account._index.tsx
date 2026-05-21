import type {Route} from './+types/account._index';
import {redirectToLocalePath} from '~/lib/locale';

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

export async function loader({request}: Route.LoaderArgs) {
  return redirectToLocalePath(request, '/account/orders');
}
