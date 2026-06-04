import type {Route} from './+types/account.favorites';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Favorites'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return {};
}

export default function AccountFavorites() {
  return (
    <div className="account-favorites">
      <section className="account-profile__section">
        <h2 className="account-profile__title">My favorites</h2>
        <p className="account-addresses__empty">
          Favorites are temporarily unavailable.
        </p>
      </section>
    </div>
  );
}
