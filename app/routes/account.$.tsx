import type {Route} from './+types/account.$';
import {redirectToLocalePath} from '~/lib/locale';

// fallback wild card for all unauthenticated routes in account section
export async function loader({context, request}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return redirectToLocalePath(request, '/account');
}
