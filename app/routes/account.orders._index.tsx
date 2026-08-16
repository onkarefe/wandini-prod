import {useRef} from 'react';
import {useLoaderData, useNavigation, useSearchParams} from 'react-router';
import {Money, flattenConnection, getPaginationVariables} from '@shopify/hydrogen';
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
  formatGermanFinancialStatus,
  formatGermanFulfillmentStatus,
  formatGermanOrderDate,
} from '~/lib/order-display';

type OrdersLoaderData = {
  customer: CustomerOrdersFragment;
  filters: OrderFilterParams;
};

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Bestellungen'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  customerAccount.handleAuthStatus();
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
    throw new Response('Bestellungen nicht gefunden', {status: 404});
  }

  return {customer: data.customer, filters};
}

export default function Orders() {
  const {customer, filters} = useLoaderData<OrdersLoaderData>();
  const {orders} = customer;

  return (
    <div className="account-orders">
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
  const hasFilters = !!(filters.name || filters.confirmationNumber);
  const orderCount = orders?.nodes.length ?? 0;

  return (
    <section className="account-orders__section" aria-live="polite">
      <div className="account-orders__section-head">
        <div>
          <p className="account-orders__eyebrow">Bestellverlauf</p>
          <h2 className="account-orders__title">Ihre Bestellungen</h2>
        </div>
        <p className="account-orders__count">
          {orderCount} {orderCount === 1 ? 'Bestellung' : 'Bestellungen'}
        </p>
      </div>

      {orders?.nodes.length ? (
        <div className="account-orders__list">
          <PaginatedResourceSection
            connection={orders}
            previousLabel="Vorherige Bestellungen"
            nextLabel="Weitere Bestellungen"
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
  return (
    <div className="account-orders__empty">
      {hasFilters ? (
        <>
          <p className="account-orders__empty-title">
            Keine Bestellung entspricht Ihren aktuellen Filtern.
          </p>
          <p className="account-orders__empty-copy">
            Versuchen Sie eine andere Bestellnummer oder setzen Sie die Filter
            zurück.
          </p>
          <Link className="account-orders__empty-link" to="/account/orders">
            Filter zurücksetzen
          </Link>
        </>
      ) : (
        <>
          <p className="account-orders__empty-title">
            Sie haben noch keine Bestellung aufgegeben.
          </p>
          <p className="account-orders__empty-copy">
            Sobald Sie eine Bestellung aufgeben, erscheint sie hier zur
            schnellen Nachverfolgung.
          </p>
          <Link className="account-orders__empty-link" to="/collections">
            Jetzt einkaufen
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
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSearching =
    navigation.state !== 'idle' &&
    navigation.location?.pathname?.includes('orders');
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

    setSearchParams(params);
  };

  const hasFilters = currentFilters.name || currentFilters.confirmationNumber;

  return (
    <section className="account-orders__section account-orders__section--filters">
      <div className="account-orders__section-head">
        <div>
          <p className="account-orders__eyebrow">Bestellung finden</p>
          <h2 className="account-orders__title">Suchen und filtern</h2>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="account-orders__filters"
        aria-label="Bestellungen durchsuchen"
      >
        <div className="account-orders__filter-grid">
          <label className="account-orders__field">
            <span className="account-orders__field-label">Bestellnummer</span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.NAME}
              placeholder="Bestellnummer"
              aria-label="Bestellnummer"
              defaultValue={currentFilters.name || ''}
              className="account-orders__input"
            />
          </label>

          <label className="account-orders__field">
            <span className="account-orders__field-label">
              Bestätigungsnummer
            </span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER}
              placeholder="Bestätigungsnummer"
              aria-label="Bestätigungsnummer"
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
            {isSearching ? 'Suche läuft...' : 'Bestellungen suchen'}
          </button>

          {hasFilters && (
            <button
              className="account-orders__button account-orders__button--secondary"
              type="button"
              disabled={isSearching}
              onClick={() => {
                setSearchParams(new URLSearchParams());
                formRef.current?.reset();
              }}
            >
              Filter zurücksetzen
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="account-orders__meta-item">
      <span className="account-orders__meta-label">{label}</span>
      <span className="account-orders__meta-value">{value}</span>
    </div>
  );
}

function OrderItem({order}: {order: OrderItemFragment}) {
  const fulfillmentStatus = flattenConnection(order.fulfillments)[0]?.status;
  const formattedFinancialStatus = formatGermanFinancialStatus(
    order.financialStatus,
  );
  const formattedFulfillmentStatus =
    formatGermanFulfillmentStatus(fulfillmentStatus);

  return (
    <article className="account-orders__card">
      <div className="account-orders__card-top">
        <div className="account-orders__summary">
          <Link className="account-orders__order-link" to={`/account/orders/${btoa(order.id)}`}>
            Bestellung #{order.number}
          </Link>
          <p className="account-orders__date">
            Bestellt am {formatGermanOrderDate(order.processedAt)}
          </p>
        </div>

        <OrderValue order={order} />
      </div>

      <div className="account-orders__meta">
        {order.confirmationNumber && (
          <DetailItem
            label="Bestätigung"
            value={order.confirmationNumber}
          />
        )}

        {formattedFinancialStatus && (
          <DetailItem
            label="Zahlung"
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
            label="Versandstatus"
            value={<StatusBadge label={formattedFulfillmentStatus} />}
          />
        )}
      </div>

      <div className="account-orders__card-actions">
        <Link className="account-orders__view-link" to={`/account/orders/${btoa(order.id)}`}>
          Bestellung ansehen
        </Link>
      </div>
    </article>
  );
}
