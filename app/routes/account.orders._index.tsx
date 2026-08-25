import {useRef} from 'react';
import {
  useLoaderData,
  useLocation,
  useNavigation,
  useSearchParams,
} from 'react-router';
import {
  Money,
  flattenConnection,
  getPaginationVariables,
} from '@shopify/hydrogen';
import type {Route} from './+types/account.orders._index';
import {
  ORDER_FILTER_FIELDS,
  buildOrderSearchQuery,
  parseOrderFilters,
  type OrderFilterParams,
} from '~/lib/orderFilters';
import {CUSTOMER_ORDERS_QUERY} from '~/graphql/customer-account/CustomerOrdersQuery';
import type {
  CustomerOrdersFragment,
  OrderItemFragment,
} from 'customer-accountapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {Link} from '~/lib/i18n-router';
import {
  formatFinancialStatus,
  formatFulfillmentStatus,
  formatOrderDate,
} from '~/lib/order-display';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import {createTranslator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';
import {getLocaleFromRequest} from '~/lib/locale';

type OrdersLoaderData = {
  customer: CustomerOrdersFragment;
  filters: OrderFilterParams;
  selectedLocale: ReturnType<typeof getLocaleFromRequest>;
};

export const meta: Route.MetaFunction = ({data: routeData}) => {
  return [
    {title: createTranslator(routeData?.selectedLocale)('account.orders')},
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const selectedLocale = getLocaleFromRequest(request);
  const t = createTranslator(selectedLocale);
  const {customerAccount} = context;
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 20,
  });

  const url = new URL(request.url);
  const filters = parseOrderFilters(url.searchParams);
  const query = buildOrderSearchQuery(filters);

  const {data, errors} = await customerAccount.query(CUSTOMER_ORDERS_QUERY, {
    variables: {
      ...paginationVariables,
      query,
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Response(t('account.ordersNotFound'), {status: 404});
  }

  return {customer: data.customer, filters, selectedLocale};
}

export default function Orders() {
  const {t} = useTranslation();
  const {customer, filters} = useLoaderData<OrdersLoaderData>();
  const {orders} = customer;

  return (
    <div className="account-page account-orders">
      <header className="account-page__header">
        <div>
          <p className="account-page__eyebrow">{t('account.ordersEyebrow')}</p>
          <h2 className="account-page__title">{t('account.orders')}</h2>
          <p className="account-page__description">
            {t('account.ordersDescription')}
          </p>
        </div>
      </header>
      <div className="account-orders__container">
        <OrderSearchForm currentFilters={filters} />
        <OrdersTable orders={orders} filters={filters} />
      </div>
    </div>
  );
}

function OrdersTable({
  orders,
  filters,
}: {
  orders: CustomerOrdersFragment['orders'];
  filters: OrderFilterParams;
}) {
  const {t} = useTranslation();
  const hasFilters = !!(filters.name || filters.confirmationNumber);
  const orderCount = orders?.nodes.length ?? 0;

  return (
    <section className="account-orders__section" aria-live="polite">
      <div className="account-orders__section-head">
        <div>
          <h3 className="account-orders__title">{t('account.orderHistory')}</h3>
        </div>
        <p className="account-orders__count">
          {t('account.entriesShown', {count: orderCount})}
        </p>
      </div>

      {orders?.nodes.length ? (
        <div className="account-orders__list">
          <PaginatedResourceSection
            connection={orders}
            previousLabel={t('account.previousOrders')}
            nextLabel={t('account.nextOrders')}
          >
            {({node: order}) => <OrderItem key={order.id} order={order} />}
          </PaginatedResourceSection>
        </div>
      ) : (
        <EmptyOrders hasFilters={hasFilters} />
      )}
    </section>
  );
}

function EmptyOrders({hasFilters = false}: {hasFilters?: boolean}) {
  const {t} = useTranslation();
  return (
    <div className="account-orders__empty">
      {hasFilters ? (
        <>
          <p className="account-orders__empty-title">
            {t('account.noMatchingOrders')}
          </p>
          <p className="account-orders__empty-copy">
            {t('account.tryDifferentOrderSearch')}
          </p>
          <Link className="account-orders__empty-link" to="/account/orders">
            {t('account.resetFilters')}
          </Link>
        </>
      ) : (
        <>
          <p className="account-orders__empty-title">
            {t('account.noOrdersTitle')}
          </p>
          <p className="account-orders__empty-copy">
            {t('account.noOrdersDescription')}
          </p>
          <Link className="account-orders__empty-link" to="/collections">
            {t('account.discoverProducts')}
          </Link>
        </>
      )}
    </div>
  );
}

function OrderSearchForm({
  currentFilters,
}: {
  currentFilters: OrderFilterParams;
}) {
  const {t} = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  const currentSearchParams = new URLSearchParams(location.search);
  const nextSearchParams = new URLSearchParams(
    navigation.location?.search ?? location.search,
  );
  const filtersAreChanging = [
    ORDER_FILTER_FIELDS.NAME,
    ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER,
  ].some(
    (field) => currentSearchParams.get(field) !== nextSearchParams.get(field),
  );
  const isSearching =
    navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    filtersAreChanging;
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    const name = formData.get(ORDER_FILTER_FIELDS.NAME)?.toString().trim();
    const confirmationNumber = formData
      .get(ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER)
      ?.toString()
      .trim();

    if (name) params.set(ORDER_FILTER_FIELDS.NAME, name);
    if (confirmationNumber) {
      params.set(ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER, confirmationNumber);
    }

    setSearchParams(params, {preventScrollReset: true, replace: true});
  };

  const hasFilters = currentFilters.name || currentFilters.confirmationNumber;

  return (
    <section className="account-orders__section account-orders__section--filters">
      <div className="account-orders__section-head">
        <div>
          <h3 className="account-orders__title">{t('account.findOrder')}</h3>
          <p className="account-orders__section-copy">
            {t('account.findOrderDescription')}
          </p>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="account-orders__filters"
        aria-label={t('account.searchOrders')}
        aria-busy={isSearching}
      >
        <div className="account-orders__filter-grid">
          <label className="account-orders__field">
            <span className="account-orders__field-label">
              {t('account.orderNumber')}
            </span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.NAME}
              placeholder={t('account.orderNumber')}
              aria-label={t('account.orderNumber')}
              defaultValue={currentFilters.name || ''}
              className="account-orders__input"
            />
          </label>

          <label className="account-orders__field">
            <span className="account-orders__field-label">
              {t('account.confirmationNumber')}
            </span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER}
              placeholder={t('account.confirmationNumber')}
              aria-label={t('account.confirmationNumber')}
              defaultValue={currentFilters.confirmationNumber || ''}
              className="account-orders__input"
            />
          </label>
        </div>

        <div className="account-orders__actions">
          <button
            className="account-orders__button account-orders__button--primary"
            type="submit"
            disabled={isSearching}
          >
            {isSearching ? t('account.searching') : t('account.search')}
          </button>

          {hasFilters && (
            <button
              className="account-orders__button account-orders__button--secondary"
              type="button"
              disabled={isSearching}
              onClick={() => {
                setSearchParams(new URLSearchParams(), {
                  preventScrollReset: true,
                  replace: true,
                });
                formRef.current?.reset();
              }}
            >
              {t('account.resetFilters')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function OrderValue({order}: {order: OrderItemFragment}) {
  return (
    <span className="account-orders__amount">
      <Money data={order.totalPrice} />
    </span>
  );
}

function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success';
}) {
  return (
    <span className={`account-orders__badge account-orders__badge--${tone}`}>
      {label}
    </span>
  );
}

function DetailItem({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div className="account-orders__meta-item">
      <span className="account-orders__meta-label">{label}</span>
      <span className="account-orders__meta-value">{value}</span>
    </div>
  );
}

function OrderItem({order}: {order: OrderItemFragment}) {
  const {locale, t} = useTranslation();
  const fulfillmentStatus = flattenConnection(order.fulfillments)[0]?.status;
  const formattedFinancialStatus = formatFinancialStatus(
    order.financialStatus,
    t,
  );
  const formattedFulfillmentStatus =
    formatFulfillmentStatus(fulfillmentStatus, t);

  return (
    <article className="account-orders__card">
      <div className="account-orders__card-top">
        <div className="account-orders__summary">
          <Link
            className="account-orders__order-link"
            to={`/account/orders/${btoa(order.id)}`}
          >
            {t('account.order', {number: order.number})}
          </Link>
          <p className="account-orders__date">
            {t('account.placedOn', {
              date: formatOrderDate(order.processedAt, locale, t),
            })}
          </p>
        </div>

        <OrderValue order={order} />
      </div>

      <div className="account-orders__meta">
        {order.confirmationNumber && (
          <DetailItem
            label={t('account.confirmation')}
            value={order.confirmationNumber}
          />
        )}

        {formattedFinancialStatus && (
          <DetailItem
            label={t('account.paymentStatus')}
            value={
              <StatusBadge
                label={formattedFinancialStatus}
                tone={order.financialStatus === 'PAID' ? 'success' : 'neutral'}
              />
            }
          />
        )}

        {formattedFulfillmentStatus && (
          <DetailItem
            label={t('account.fulfillmentStatus')}
            value={<StatusBadge label={formattedFulfillmentStatus} />}
          />
        )}
      </div>

      <div className="account-orders__card-actions">
        <Link
          className="account-orders__view-link"
          to={`/account/orders/${btoa(order.id)}`}
        >
          {t('account.viewOrder')}
        </Link>
      </div>
    </article>
  );
}
