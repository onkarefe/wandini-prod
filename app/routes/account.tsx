import {
  data as remixData,
  Form,
  Outlet,
  useLoaderData,
} from 'react-router';
import type {Route} from './+types/account';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import accountMainStyles from '~/styles/accountMain.css?url';
import {NavLink} from '~/lib/i18n-router';

export function links() {
  return [{rel: 'stylesheet', href: accountMainStyles}];
}

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

export function shouldRevalidate() {
  return true;
}

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  customerAccount.handleAuthStatus();
  const {data, errors} = await customerAccount.query(CUSTOMER_DETAILS_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Response('Customer not found', {status: 404});
  }

  return remixData(
    {customer: data.customer},
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}

export default function AccountLayout() {
  const {customer} = useLoaderData<typeof loader>();

  const heading = customer
    ? customer.firstName
      ? `Welcome, ${customer.firstName}`
      : `Welcome to your account.`
    : 'Account Details';

  return (
    <div className="account-shell">
      <div className="account-shell__container">
        <header className="account-shell__header">
          <p className="account-shell__eyebrow">My account</p>
          <h1 className="account-shell__title">{heading}</h1>
        </header>
        <AccountMenu />
        <div className="account-shell__content">
          <Outlet context={{customer}} />
        </div>
      </div>
    </div>
  );
}

function AccountMenu() {
  function getTabClassName({
    isActive,
    isPending,
  }: {
    isActive: boolean;
    isPending: boolean;
  }) {
    return [
      'account-tabs__link',
      isActive ? 'is-active' : '',
      isPending ? 'is-pending' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    <nav className="account-tabs" role="navigation" aria-label="Account sections">
      <NavLink to="/account/orders" className={getTabClassName}>
        Orders
      </NavLink>
      <NavLink to="/account/profile" className={getTabClassName}>
        Profile
      </NavLink>
      <NavLink to="/account/favorites" className={getTabClassName}>
        Favorites
      </NavLink>
      <NavLink to="/account/addresses" className={getTabClassName}>
        Addresses
      </NavLink>
      <Logout />
    </nav>
  );
}

function Logout() {
  return (
    <Form className="account-logout" method="POST" action="/account/logout">
      <button className="account-tabs__link account-tabs__link--button" type="submit">
        Sign out
      </button>
    </Form>
  );
}
