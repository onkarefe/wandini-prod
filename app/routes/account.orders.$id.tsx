import {useLoaderData} from 'react-router';
import type {Route} from './+types/account.orders.$id';
import {Money, Image} from '@shopify/hydrogen';
import type {
  OrderLineItemFullFragment,
  OrderQuery,
} from 'customer-accountapi.generated';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {redirectToLocalePath} from '~/lib/locale';
import {
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
  return (
    <div className="account-order">
      <h2>Bestellung {order.name}</h2>
      <p>Bestellt am {formatGermanOrderDate(order.processedAt)}</p>
      {order.confirmationNumber && (
        <p>Bestätigung: {order.confirmationNumber}</p>
      )}
      <br />
      <div>
        <table>
          <thead>
            <tr>
              <th scope="col">Produkt</th>
              <th scope="col">Preis</th>
              <th scope="col">Gesamt</th>
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
                <th scope="row" colSpan={2}>
                  <p>Rabatte</p>
                </th>
                <td>
                  {discountPercentage ? (
                    <span>-{discountPercentage}% Rabatt</span>
                  ) : (
                    discountValue && <Money data={discountValue!} />
                  )}
                </td>
              </tr>
            )}
            <tr>
              <th scope="row" colSpan={2}>
                <p>Zwischensumme</p>
              </th>
              <td>
                <Money data={order.subtotal!} />
              </td>
            </tr>
            <tr>
              <th scope="row" colSpan={2}>
                Steuer
              </th>
              <td>
                <Money data={order.totalTax!} />
              </td>
            </tr>
            <tr>
              <th scope="row" colSpan={2}>
                <p>Gesamtsumme</p>
              </th>
              <td>
                <Money data={order.totalPrice!} />
              </td>
            </tr>
          </tfoot>
        </table>
        <div>
          <h3>Lieferadresse</h3>
          {order?.shippingAddress ? (
            <address>
              <p>{order.shippingAddress.name}</p>
              {order.shippingAddress.formatted ? (
                <p>{order.shippingAddress.formatted}</p>
              ) : (
                ''
              )}
              {order.shippingAddress.formattedArea ? (
                <p>{order.shippingAddress.formattedArea}</p>
              ) : (
                ''
              )}
            </address>
          ) : (
            <p>Keine Lieferadresse hinterlegt</p>
          )}
          <h3>Versandstatus</h3>
          <div>
            <p>
              {formatGermanFulfillmentStatus(fulfillmentStatus) ??
                'Nicht verfügbar'}
            </p>
          </div>
        </div>
      </div>
      <br />
      <p>
        <a target="_blank" href={order.statusPageUrl} rel="noreferrer">
          Bestellstatus anzeigen &rarr;
        </a>
      </p>
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

  if (!Number.isFinite(unitPriceAmount) || !Number.isFinite(totalDiscountAmount)) {
    return lineItem.price;
  }

  return {
    amount: Math.max(0, unitPriceAmount * lineItem.quantity - totalDiscountAmount)
      .toFixed(2),
    currencyCode: lineItem.price.currencyCode,
  };
}

function OrderLineRow({lineItem}: {lineItem: OrderLineItemFullFragment}) {
  const lineTotal = getLineItemDisplayTotal(lineItem);

  return (
    <tr key={lineItem.id}>
      <td>
        <div>
          {lineItem?.image && (
            <div>
              <Image data={lineItem.image} width={96} height={96} />
            </div>
          )}
          <div>
            <p>{lineItem.title}</p>
            <small>{lineItem.variantTitle}</small>
          </div>
        </div>
      </td>
      <td>
        <Money data={lineItem.price!} />
      </td>
      <td>
        {lineTotal ? <Money data={lineTotal} /> : <span>-</span>}
      </td>
    </tr>
  );
}
