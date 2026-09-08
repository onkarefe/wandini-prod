import {useLoaderData} from 'react-router';
import type {Route} from './+types/account.orders.$id';
import {Money, Image} from '@shopify/hydrogen';
import type {
  OrderLineItemFullFragment,
  OrderQuery,
} from 'customer-accountapi.generated';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {getLocaleFromRequest, redirectToLocalePath} from '~/lib/locale';
import {Link} from '~/lib/i18n-router';
import {
  formatFinancialStatus,
  formatFulfillmentStatus,
  formatOrderDate,
} from '~/lib/order-display';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import {createTranslator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';

export const meta: Route.MetaFunction = ({data}) => {
  const t = createTranslator(data?.selectedLocale);
  return [
    {title: t('account.order', {number: data?.order?.name ?? ''}).trim()},
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

export async function loader({params, context, request}: Route.LoaderArgs) {
  const {customerAccount} = context;
  const selectedLocale = getLocaleFromRequest(request);
  const t = createTranslator(selectedLocale);

  if (!params.id) {
    return redirectToLocalePath(request, '/account/orders');
  }

  let orderId: string;

  try {
    orderId = atob(params.id);
  } catch {
    throw new Response(t('account.orderNotFound'), {status: 404});
  }

  const {data, errors} = await customerAccount.query<OrderQuery | null>(
    CUSTOMER_ORDER_QUERY,
    {
      variables: {
        orderId,
        language: customerAccount.i18n.language,
      },
    },
  );

  if (errors?.length) {
    console.error('Customer Account API GraphQL request failed.', {
      operation: 'Order',
      errors: errors.map((error) => {
        const code = error.extensions?.code;

        return {
          message: error.message,
          ...(typeof code === 'string' ? {code} : {}),
        };
      }),
    });

    throw new Response('Customer Account API request failed.', {status: 502});
  }

  if (!data?.order) {
    throw new Response(t('account.orderNotFound'), {status: 404});
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
    selectedLocale,
  };
}

export default function OrderRoute() {
  const {locale, t} = useTranslation();
  const {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    fulfillmentStatus,
  } = useLoaderData<typeof loader>();
  const financialStatusLabel = formatFinancialStatus(order.financialStatus, t);
  const fulfillmentStatusLabel =
    formatFulfillmentStatus(fulfillmentStatus, t) ?? t('errors.notAvailable');

  return (
    <div className="account-page account-order">
      <Link className="account-order__back" to="/account/orders">
        <span aria-hidden="true">←</span> {t('account.backToOrders')}
      </Link>

      <header className="account-page__header account-order__header">
        <div>
          <p className="account-page__eyebrow">{t('account.orderDetails')}</p>
          <h2 className="account-page__title">
            {t('account.order', {number: order.name})}
          </h2>
          <p className="account-page__description">
            {t('account.placedOn', {
              date: formatOrderDate(order.processedAt, locale, t),
            })}
            {order.confirmationNumber
              ? ` · ${t('account.confirmationWithNumber', {
                  number: order.confirmationNumber,
                })}`
              : ''}
          </p>
        </div>
        <a
          className="account-button account-button--secondary"
          target="_blank"
          href={order.statusPageUrl}
          rel="noreferrer"
        >
          {t('account.openOrderStatus')}
        </a>
      </header>

      <div className="account-order__status-row">
        <div className="account-order__status-item">
          <span className="account-order__status-label">
            {t('account.payment')}
          </span>
          <span className="account-orders__badge">
            {financialStatusLabel ?? t('errors.notAvailable')}
          </span>
        </div>
        <div className="account-order__status-item">
          <span className="account-order__status-label">
            {t('account.fulfillment')}
          </span>
          <span className="account-orders__badge">
            {fulfillmentStatusLabel}
          </span>
        </div>
        <div className="account-order__status-item account-order__status-item--total">
          <span className="account-order__status-label">
            {t('account.total')}
          </span>
          <strong className="account-order__status-total">
            <Money data={order.totalPrice} />
          </strong>
        </div>
      </div>

      <section className="account-order__section">
        <div className="account-order__section-head">
          <h3>{t('account.items')}</h3>
          <span>{t('account.itemCount', {count: lineItems.length})}</span>
        </div>
        <div className="account-order__table-wrap">
          <table className="account-order__table">
            <thead>
              <tr>
                <th scope="col">{t('account.product')}</th>
                <th scope="col">{t('account.quantity')}</th>
                <th scope="col">{t('account.unitPrice')}</th>
                <th scope="col">{t('account.sum')}</th>
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
                    {t('account.discount')}
                  </th>
                  <td>
                    {discountPercentage ? (
                      <span>
                        {t('account.discountPercentage', {
                          percent: discountPercentage,
                        })}
                      </span>
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
              {order.subtotal ? (
                <tr>
                  <th scope="row" colSpan={3}>
                    {t('account.subtotal')}
                  </th>
                  <td>
                    <Money data={order.subtotal} />
                  </td>
                </tr>
              ) : null}
              {order.totalTax ? (
                <tr>
                  <th scope="row" colSpan={3}>
                    {t('account.tax')}
                  </th>
                  <td>
                    <Money data={order.totalTax} />
                  </td>
                </tr>
              ) : null}
              <tr className="account-order__grand-total">
                <th scope="row" colSpan={3}>
                  {t('account.total')}
                </th>
                <td>
                  <Money data={order.totalPrice} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="account-order__section account-order__section--address">
        <div className="account-order__section-head">
          <h3>{t('account.shippingAddress')}</h3>
        </div>
        <div className="account-order__address-content">
          {order?.shippingAddress ? (
            <address>
              {order.shippingAddress.formatted.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ) : (
            <p>{t('account.noShippingAddress')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

type OrderedLineMoney = NonNullable<OrderLineItemFullFragment['totalPrice']>;

function getEffectiveOrderedLineTotal(
  lineItem: OrderLineItemFullFragment,
): OrderedLineMoney | null {
  return lineItem.totalPrice ?? lineItem.currentTotalPrice ?? null;
}

function deriveOrderedUnitPrice(
  lineTotal: OrderedLineMoney | null,
  quantity: number,
): OrderedLineMoney | null {
  if (!lineTotal || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return null;
  }

  const amountMatch = /^(\d+)(?:\.(\d+))?$/.exec(lineTotal.amount);
  if (!amountMatch) return null;

  const whole = amountMatch[1];
  if (!whole) return null;

  const fraction = amountMatch[2] ?? '';
  const amountNumerator = BigInt(`${whole}${fraction}`);
  const amountDenominator = 10n ** BigInt(fraction.length);
  const fractionDigits = getCurrencyFractionDigits(lineTotal.currencyCode);
  const minorUnitScale = 10n ** BigInt(fractionDigits);
  const divisor = amountDenominator * BigInt(quantity);
  const unitMinorUnits =
    (amountNumerator * minorUnitScale + divisor / 2n) / divisor;

  return {
    amount: formatMinorUnits(unitMinorUnits, fractionDigits),
    currencyCode: lineTotal.currencyCode,
  };
}

function getCurrencyFractionDigits(currencyCode: string) {
  try {
    const fractionDigits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;

    return typeof fractionDigits === 'number' &&
      Number.isInteger(fractionDigits) &&
      fractionDigits >= 0 &&
      fractionDigits <= 4
      ? fractionDigits
      : 2;
  } catch {
    return 2;
  }
}

function formatMinorUnits(minorUnits: bigint, fractionDigits: number) {
  if (fractionDigits === 0) return minorUnits.toString();

  const scale = 10n ** BigInt(fractionDigits);
  const whole = minorUnits / scale;
  const fraction = (minorUnits % scale)
    .toString()
    .padStart(fractionDigits, '0');

  return `${whole}.${fraction}`;
}

function OrderLineRow({lineItem}: {lineItem: OrderLineItemFullFragment}) {
  const {t} = useTranslation();
  const lineTotal = getEffectiveOrderedLineTotal(lineItem);
  const unitPrice = deriveOrderedUnitPrice(lineTotal, lineItem.quantity);

  return (
    <tr>
      <td data-label={t('account.product')}>
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
      <td data-label={t('account.quantity')}>{lineItem.quantity}</td>
      <td data-label={t('account.unitPrice')}>
        {unitPrice ? <Money data={unitPrice} /> : null}
      </td>
      <td data-label={t('account.sum')}>
        {lineTotal ? <Money data={lineTotal} /> : <span>-</span>}
      </td>
    </tr>
  );
}
