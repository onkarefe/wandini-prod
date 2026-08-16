import {useLoaderData} from 'react-router';
import type {Route} from './+types/account.orders.$id';
import {Money, Image} from '@shopify/hydrogen';
import type {
  OrderLineItemFullFragment,
  OrderQuery,
} from 'customer-accountapi.generated';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {redirectToLocalePath} from '~/lib/locale';
import {Link} from '~/lib/i18n-router';
import {
  formatGermanFinancialStatus,
  formatGermanFulfillmentStatus,
  formatGermanOrderDate,
} from '~/lib/order-display';

export const meta: Route.MetaFunction = ({data}) => {
  return [
    {title: `Bestellung ${data?.order?.name ?? ''}`.trim()},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({params, context, request}: Route.LoaderArgs) {
  const {customerAccount} = context;
  customerAccount.handleAuthStatus();

  if (!params.id) {
    return redirectToLocalePath(request, '/account/orders');
  }

  let orderId: string;

  try {
    orderId = atob(params.id);
  } catch {
    throw new Response('Bestellung nicht gefunden', {status: 404});
  }

  const {data, errors}: {data: OrderQuery; errors?: Array<{message: string}>} =
    await customerAccount.query(CUSTOMER_ORDER_QUERY, {
      variables: {
        orderId,
        language: customerAccount.i18n.language,
      },
    });

  if (errors?.length || !data?.order) {
    throw new Response('Bestellung nicht gefunden', {status: 404});
  }

  const {order} = data;

  // Extract line items directly from nodes array
  const lineItems = order.lineItems.nodes;

  // Extract discount applications directly from nodes array
  const discountApplications = order.discountApplications.nodes;

  // Get fulfillment status from first fulfillment node
  const fulfillmentStatus = order.fulfillments.nodes[0]?.status ?? null;

  // Get first discount value with proper type checking
  const firstDiscount = discountApplications[0]?.value;

  // Type guard for MoneyV2 discount
  const discountValue =
    firstDiscount?.__typename === 'MoneyV2'
      ? (firstDiscount as Extract<
          typeof firstDiscount,
          {__typename: 'MoneyV2'}
        >)
      : null;

  // Type guard for percentage discount
  const discountPercentage =
    firstDiscount?.__typename === 'PricingPercentageValue'
      ? (
          firstDiscount as Extract<
            typeof firstDiscount,
            {__typename: 'PricingPercentageValue'}
          >
        ).percentage
      : null;

  return {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    fulfillmentStatus,
  };
}

export default function OrderRoute() {
  const {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    fulfillmentStatus,
  } = useLoaderData<typeof loader>();
  const financialStatusLabel = formatGermanFinancialStatus(
    order.financialStatus,
  );
  const fulfillmentStatusLabel =
    formatGermanFulfillmentStatus(fulfillmentStatus) ?? 'Nicht verfügbar';

  return (
    <div className="account-page account-order">
      <Link className="account-order__back" to="/account/orders">
        <span aria-hidden="true">←</span> Zurück zu den Bestellungen
      </Link>

      <header className="account-page__header account-order__header">
        <div>
          <p className="account-page__eyebrow">Bestelldetails</p>
          <h2 className="account-page__title">Bestellung {order.name}</h2>
          <p className="account-page__description">
            Bestellt am {formatGermanOrderDate(order.processedAt)}
            {order.confirmationNumber
              ? ` · Bestätigung ${order.confirmationNumber}`
              : ''}
          </p>
        </div>
        <a
          className="account-button account-button--secondary"
          target="_blank"
          href={order.statusPageUrl}
          rel="noreferrer"
        >
          Bestellstatus öffnen
        </a>
      </header>

      <div className="account-order__status-row">
        <div className="account-order__status-item">
          <span className="account-order__status-label">Zahlung</span>
          <span className="account-orders__badge">
            {financialStatusLabel ?? 'Nicht verfügbar'}
          </span>
        </div>
        <div className="account-order__status-item">
          <span className="account-order__status-label">Versand</span>
          <span className="account-orders__badge">
            {fulfillmentStatusLabel}
          </span>
        </div>
        <div className="account-order__status-item account-order__status-item--total">
          <span className="account-order__status-label">Gesamtsumme</span>
          <strong className="account-order__status-total">
            <Money data={order.totalPrice} />
          </strong>
        </div>
      </div>

      <section className="account-order__section">
        <div className="account-order__section-head">
          <h3>Artikel</h3>
          <span>
            {lineItems.length} {lineItems.length === 1 ? 'Artikel' : 'Artikel'}
          </span>
        </div>
        <div className="account-order__table-wrap">
          <table className="account-order__table">
            <thead>
              <tr>
                <th scope="col">Produkt</th>
                <th scope="col">Menge</th>
                <th scope="col">Einzelpreis</th>
                <th scope="col">Summe</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((lineItem) => (
                <OrderLineRow key={lineItem.id} lineItem={lineItem} />
              ))}
            </tbody>
            <tfoot>
              {((discountValue && discountValue.amount) ||
                discountPercentage) && (
                <tr>
                  <th scope="row" colSpan={3}>
                    Rabatt
                  </th>
                  <td>
                    {discountPercentage ? (
                      <span>-{discountPercentage}% Rabatt</span>
                    ) : (
                      discountValue && (
                        <span>
                          −<Money data={discountValue} />
                        </span>
                      )
                    )}
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row" colSpan={3}>
                  Zwischensumme
                </th>
                <td>
                  <Money data={order.subtotal!} />
                </td>
              </tr>
              <tr>
                <th scope="row" colSpan={3}>
                  Steuer
                </th>
                <td>
                  <Money data={order.totalTax!} />
                </td>
              </tr>
              <tr className="account-order__grand-total">
                <th scope="row" colSpan={3}>
                  Gesamtsumme
                </th>
                <td>
                  <Money data={order.totalPrice!} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="account-order__section account-order__section--address">
        <div className="account-order__section-head">
          <h3>Lieferadresse</h3>
        </div>
        <div className="account-order__address-content">
          {order?.shippingAddress ? (
            <address>
              {order.shippingAddress.formatted.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ) : (
            <p>Keine Lieferadresse hinterlegt</p>
          )}
        </div>
      </section>
    </div>
  );
}

function getLineItemDisplayTotal(lineItem: OrderLineItemFullFragment) {
  if (lineItem.totalPriceWithDiscounts) {
    return lineItem.totalPriceWithDiscounts;
  }

  if (lineItem.totalPrice) {
    return lineItem.totalPrice;
  }

  if (lineItem.currentTotalPrice) {
    return lineItem.currentTotalPrice;
  }

  if (!lineItem.price) {
    return null;
  }

  const unitPriceAmount = Number(lineItem.price.amount);
  const totalDiscountAmount = Number(lineItem.totalDiscount?.amount ?? 0);

  if (
    !Number.isFinite(unitPriceAmount) ||
    !Number.isFinite(totalDiscountAmount)
  ) {
    return lineItem.price;
  }

  return {
    amount: Math.max(
      0,
      unitPriceAmount * lineItem.quantity - totalDiscountAmount,
    ).toFixed(2),
    currencyCode: lineItem.price.currencyCode,
  };
}

function OrderLineRow({lineItem}: {lineItem: OrderLineItemFullFragment}) {
  const lineTotal = getLineItemDisplayTotal(lineItem);

  return (
    <tr>
      <td data-label="Produkt">
        <div className="account-order__product">
          {lineItem?.image && (
            <div className="account-order__product-image">
              <Image data={lineItem.image} width={88} height={88} />
            </div>
          )}
          <div className="account-order__product-copy">
            <p>{lineItem.title}</p>
            {lineItem.variantTitle ? (
              <small>{lineItem.variantTitle}</small>
            ) : null}
          </div>
        </div>
      </td>
      <td data-label="Menge">{lineItem.quantity}</td>
      <td data-label="Einzelpreis">
        <Money data={lineItem.price!} />
      </td>
      <td data-label="Summe">
        {lineTotal ? <Money data={lineTotal} /> : <span>-</span>}
      </td>
    </tr>
  );
}
