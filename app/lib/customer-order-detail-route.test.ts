import {describe, expect, it, vi} from 'vitest';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {loader} from '~/routes/account.orders.$id';

// Kept outside app/routes so React Router never treats this test as a route.
function createLoaderArgs(queryResult: unknown) {
  const query = vi.fn().mockResolvedValue(queryResult);

  return {
    args: {
      params: {id: btoa('gid://shopify/Order/100')},
      context: {
        customerAccount: {
          query,
          i18n: {language: 'DE'},
        },
      },
      request: new Request('https://www.wandini.shop/account/orders/order-id'),
    } as never,
    query,
  };
}

async function getThrownResponse(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error('Expected loader to throw a Response.');
}

describe('customer order detail loader', () => {
  it('keeps unsupported and catalog price fields out of the order query', () => {
    expect(CUSTOMER_ORDER_QUERY).not.toContain('totalPriceWithDiscounts');
    expect(CUSTOMER_ORDER_QUERY).not.toMatch(/^\s+price\s*\{/m);
    expect(CUSTOMER_ORDER_QUERY).toContain('currentTotalPrice');
    expect(CUSTOMER_ORDER_QUERY).toContain('totalPrice');
    expect(CUSTOMER_ORDER_QUERY).toContain('totalDiscount');
    expect(CUSTOMER_ORDER_QUERY).toContain('discountAllocations');
    expect(CUSTOMER_ORDER_QUERY).toContain('image');
  });

  it('reports GraphQL errors as an upstream failure with safe diagnostics', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {args} = createLoaderArgs({
      data: null,
      errors: [
        {
          message: 'Cannot query field on LineItem.',
          extensions: {code: 'GRAPHQL_VALIDATION_FAILED'},
        },
      ],
    });

    const response = await getThrownResponse(loader(args));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Customer Account API request failed.');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Customer Account API GraphQL request failed.',
      {
        operation: 'Order',
        errors: [
          {
            message: 'Cannot query field on LineItem.',
            code: 'GRAPHQL_VALIDATION_FAILED',
          },
        ],
      },
    );
  });

  it('returns 404 only when an error-free response has no order', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {args} = createLoaderArgs({data: {order: null}});

    const response = await getThrownResponse(loader(args));

    expect(response.status).toBe(404);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns real order data after a successful query', async () => {
    const order = {
      lineItems: {nodes: []},
      discountApplications: {nodes: []},
      fulfillments: {nodes: []},
    };
    const {args, query} = createLoaderArgs({data: {order}});

    const result = await loader(args);

    expect(result).toMatchObject({order, lineItems: []});
    expect(query).toHaveBeenCalledWith(CUSTOMER_ORDER_QUERY, {
      variables: {
        orderId: 'gid://shopify/Order/100',
        language: 'DE',
      },
    });
  });
});
