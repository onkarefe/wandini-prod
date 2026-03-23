import {useRef} from 'react';
import {Link, useLoaderData, useNavigation, useSearchParams} from 'react-router';
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

type OrdersLoaderData = {
  customer: CustomerOrdersFragment;
  filters: OrderFilterParams;
};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Orders'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
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
    throw Error('Customer orders not found');
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
          <p className="account-orders__eyebrow">Order history</p>
          <h2 className="account-orders__title">Your orders</h2>
        </div>
        <p className="account-orders__count">
          {orderCount} {orderCount === 1 ? 'order' : 'orders'}
        </p>
      </div>

      {orders?.nodes.length ? (
        <div className="account-orders__list">
          <PaginatedResourceSection connection={orders}>
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
            No orders match your current filters.
          </p>
          <p className="account-orders__empty-copy">
            Try a different order number or clear the current search.
          </p>
          <Link className="account-orders__empty-link" to="/account/orders">
            Clear filters
          </Link>
        </>
      ) : (
        <>
          <p className="account-orders__empty-title">
            You haven&apos;t placed any orders yet.
          </p>
          <p className="account-orders__empty-copy">
            Once you place an order, it will appear here for quick tracking.
          </p>
          <Link className="account-orders__empty-link" to="/collections">
            Start shopping
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
          <p className="account-orders__eyebrow">Find an order</p>
          <h2 className="account-orders__title">Search & filter</h2>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="account-orders__filters"
        aria-label="Search orders"
      >
        <div className="account-orders__filter-grid">
          <label className="account-orders__field">
            <span className="account-orders__field-label">Order number</span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.NAME}
              placeholder="Order #"
              aria-label="Order number"
              defaultValue={currentFilters.name || ''}
              className="account-orders__input"
            />
          </label>

          <label className="account-orders__field">
            <span className="account-orders__field-label">Confirmation number</span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER}
              placeholder="Confirmation #"
              aria-label="Confirmation number"
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
            {isSearching ? 'Searching...' : 'Search orders'}
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
              Clear filters
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function formatStatusLabel(status?: string | null) {
  if (!status) return null;

  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  const formattedFinancialStatus = formatStatusLabel(order.financialStatus);
  const formattedFulfillmentStatus = formatStatusLabel(fulfillmentStatus);

  return (
    <article className="account-orders__card">
      <div className="account-orders__card-top">
        <div className="account-orders__summary">
          <Link className="account-orders__order-link" to={`/account/orders/${btoa(order.id)}`}>
            Order #{order.number}
          </Link>
          <p className="account-orders__date">
            Placed on {new Date(order.processedAt).toDateString()}
          </p>
        </div>

        <OrderValue order={order} />
      </div>

      <div className="account-orders__meta">
        {order.confirmationNumber && (
          <DetailItem label="Confirmation" value={order.confirmationNumber} />
        )}

        {formattedFinancialStatus && (
          <DetailItem
            label="Payment"
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
            label="Fulfillment"
            value={<StatusBadge label={formattedFulfillmentStatus} />}
          />
        )}
      </div>

      <div className="account-orders__card-actions">
        <Link className="account-orders__view-link" to={`/account/orders/${btoa(order.id)}`}>
          View order
        </Link>
      </div>
    </article>
  );
}
