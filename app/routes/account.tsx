import {
  data as remixData,
  Form,
  Outlet,
  useLoaderData,
  useNavigation,
  type ShouldRevalidateFunction,
} from 'react-router';
import type {Route} from './+types/account';
import {CUSTOMER_SUMMARY_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import accountMainStyles from '~/styles/accountMain.css?url';
import {NavLink} from '~/lib/i18n-router';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';

export function links() {
  return [{rel: 'stylesheet', href: accountMainStyles}];
}

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE}];
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  formAction,
  currentUrl,
  nextUrl,
}) => {
  if (formMethod && formMethod !== 'GET') {
    return formAction?.endsWith('/account/profile') ?? true;
  }
  if (currentUrl.toString() === nextUrl.toString()) return true;

  return false;
};

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  const {data, errors} = await customerAccount.query(CUSTOMER_SUMMARY_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Response('Kundenkonto nicht gefunden', {status: 404});
  }

  return remixData(
    {customer: data.customer},
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': PRIVATE_ROBOTS_DIRECTIVE,
      },
    },
  );
}

export default function AccountLayout() {
  const {customer} = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== 'idle';

  const heading = customer?.firstName
    ? `Guten Tag, ${customer.firstName}`
    : 'Guten Tag';

  return (
    <div className="account-shell">
      <div className="container mx-auto account-shell__container">
        <header className="account-shell__header">
          <p className="account-shell__eyebrow">Mein Konto</p>
          <h1 className="account-shell__title">{heading}</h1>
          <p className="account-shell__intro">
            Verwalten Sie Ihre Bestellungen und persönlichen Angaben an einem
            Ort.
          </p>
        </header>
        <div className="account-shell__layout">
          <AccountMenu />
          <main
            className="account-shell__content"
            aria-busy={isNavigating || undefined}
            data-loading={isNavigating || undefined}
          >
            <Outlet context={{customer}} />
          </main>
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
    <div className="account-navigation">
      <nav className="account-tabs" aria-label="Kontobereiche">
        <NavLink to="/account/orders" className={getTabClassName}>
          Bestellungen
        </NavLink>
        <NavLink to="/account/profile" className={getTabClassName}>
          Profil
        </NavLink>
        <NavLink to="/account/favorites" className={getTabClassName}>
          Favoriten
        </NavLink>
        <NavLink to="/account/addresses" className={getTabClassName}>
          Adressen
        </NavLink>
      </nav>
      <Logout />
    </div>
  );
}

function Logout() {
  const navigation = useNavigation();
  const isLoggingOut =
    navigation.state !== 'idle' &&
    navigation.formAction?.endsWith('/account/logout');

  return (
    <Form className="account-logout" method="POST" action="/account/logout">
      <button
        className="account-tabs__link account-tabs__link--button"
        type="submit"
        disabled={isLoggingOut}
      >
        {isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
      </button>
    </Form>
  );
}
