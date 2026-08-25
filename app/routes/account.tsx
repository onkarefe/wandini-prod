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
import {NavLink, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import {useTranslation} from '~/i18n/useTranslation';
import {createTranslator} from '~/i18n';
import {getLocaleFromRequest} from '~/lib/locale';

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

export async function loader({context, request}: Route.LoaderArgs) {
  const t = createTranslator(getLocaleFromRequest(request));
  const {customerAccount} = context;
  const {data, errors} = await customerAccount.query(CUSTOMER_SUMMARY_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Response(t('account.notFound'), {status: 404});
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
  const {t} = useTranslation();
  const {customer} = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== 'idle';

  const heading = customer?.firstName
    ? t('account.greetingName', {name: customer.firstName})
    : t('account.greeting');

  return (
    <div className="account-shell">
      <div className="container mx-auto account-shell__container">
        <header className="account-shell__header">
          <p className="account-shell__eyebrow">{t('account.eyebrow')}</p>
          <h1 className="account-shell__title">{heading}</h1>
          <p className="account-shell__intro">{t('account.intro')}</p>
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
  const {t} = useTranslation();
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
      <nav className="account-tabs" aria-label={t('account.sections')}>
        <NavLink to="/account/orders" className={getTabClassName}>
          {t('account.orders')}
        </NavLink>
        <NavLink to="/account/profile" className={getTabClassName}>
          {t('account.profile')}
        </NavLink>
        <NavLink to="/account/favorites" className={getTabClassName}>
          {t('wishlist.title')}
        </NavLink>
        <NavLink to="/account/addresses" className={getTabClassName}>
          {t('account.addresses')}
        </NavLink>
      </nav>
      <Logout />
    </div>
  );
}

function Logout() {
  const {t} = useTranslation();
  const logoutPath = usePrefixPathWithLocale('/account/logout');
  const navigation = useNavigation();
  const isLoggingOut =
    navigation.state !== 'idle' &&
    navigation.formAction?.endsWith('/account/logout');

  return (
    <Form className="account-logout" method="POST" action={logoutPath}>
      <button
        className="account-tabs__link account-tabs__link--button"
        type="submit"
        disabled={isLoggingOut}
      >
        {isLoggingOut ? t('account.loggingOut') : t('account.logout')}
      </button>
    </Form>
  );
}
