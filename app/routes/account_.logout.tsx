import type {Route} from './+types/account_.logout';
import {redirectToLocalePath} from '~/lib/locale';

// if we don't implement this, /account/logout will get caught by account.$.tsx to do login
export async function loader({request}: Route.LoaderArgs) {
  return redirectToLocalePath(request, '/');
}

export async function action({context}: Route.ActionArgs) {
  return context.customerAccount.logout();
}
