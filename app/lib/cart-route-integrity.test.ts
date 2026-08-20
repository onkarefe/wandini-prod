import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {action as cartAction} from '~/routes/cart';

const configuredCart = {
  id: 'gid://shopify/Cart/cart-1',
  lines: {
    nodes: [
      {
        id: 'line-wallpaper',
        quantity: 1,
        attributes: [
          {
            key: 'configurator_payload',
            value: JSON.stringify({
              version: 1,
              master_asset_id: 'asset-1',
              output: {unit: 'mm', width: 2000, height: 2500},
              crop_ratio: {x: 0, y: 0, w: 1, h: 1},
            }),
          },
          {key: 'configurator_instance_id', value: 'configuration-1'},
        ],
        merchandise: {
          id: 'gid://shopify/ProductVariant/1',
          product: {masterAssetId: {value: 'asset-1'}},
          printQuality: {
            reference: {
              __typename: 'Metaobject',
              id: 'gid://shopify/Metaobject/1',
            },
          },
        },
      },
      {
        id: 'line-accessory',
        quantity: 1,
        attributes: [],
        merchandise: {
          id: 'gid://shopify/ProductVariant/2',
          product: {masterAssetId: null},
          printQuality: null,
        },
      },
    ],
  },
};

function cartRequest(action: string, inputs: Record<string, unknown>) {
  return new Request('https://example.com/cart', {
    method: 'POST',
    body: new URLSearchParams({
      cartFormInput: JSON.stringify({action, inputs}),
    }),
  });
}

function cartContext() {
  const result = {
    cart: {id: configuredCart.id},
    errors: [],
    warnings: [],
  };
  return {
    cart: {
      get: vi.fn().mockResolvedValue(structuredClone(configuredCart)),
      addLines: vi.fn().mockResolvedValue(result),
      updateLines: vi.fn().mockResolvedValue(result),
      removeLines: vi.fn().mockResolvedValue(result),
      setCartId: vi.fn().mockReturnValue(new Headers()),
    },
    env: {
      PUBLIC_STORE_DOMAIN: 'cart-add-test.myshopify.com',
      SHOPIFY_SHOP: 'cart-add-test.myshopify.com',
      SHOPIFY_PRICING_CLIENT_ID: 'cart-add-client',
      SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cart route configured-line integrity', () => {
  it('passes a valid configured wallpaper line through to Shopify LinesAdd', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith('/admin/oauth/access_token')) {
          return Response.json({access_token: 'test-token', expires_in: 3600});
        }

        const request = JSON.parse(String(init?.body)) as {query: string};
        if (request.query.includes('WandiniConfiguredVariantPricing')) {
          return Response.json({
            data: {
              shop: {currencyCode: 'EUR'},
              nodes: [
                {
                  __typename: 'ProductVariant',
                  id: 'gid://shopify/ProductVariant/1',
                  availableForSale: true,
                  price: '28.89',
                  product: {
                    id: 'gid://shopify/Product/1',
                    masterAssetId: {value: 'asset-1'},
                  },
                  printQuality: {
                    reference: {
                      __typename: 'Metaobject',
                      id: 'gid://shopify/Metaobject/1',
                      minWidthCm: {value: '50'},
                      minHeightCm: {value: '50'},
                    },
                  },
                },
              ],
            },
          });
        }

        throw new Error('Unexpected Admin API operation in test.');
      }),
    );

    const context = cartContext();
    const lines = [
      {
        merchandiseId: 'gid://shopify/ProductVariant/1',
        quantity: 1,
        attributes: [
          {
            key: 'configurator_payload',
            value: JSON.stringify({
              version: 1,
              master_asset_id: 'asset-1',
              output: {unit: 'mm', width: 2000, height: 2500},
              crop_ratio: {x: 0.501, y: 0.251, w: 0.499, h: 0.749},
            }),
          },
          {key: 'configurator_instance_id', value: 'configuration-2'},
        ],
      },
    ];

    await cartAction({
      request: cartRequest('LinesAdd', {lines}),
      context,
    } as never);

    expect(context.cart.addLines).toHaveBeenCalledWith(lines);
  });

  it('does not call Shopify LinesUpdate for configured quantity tampering', async () => {
    const context = cartContext();

    await cartAction({
      request: cartRequest('LinesUpdate', {
        lines: [{id: 'line-wallpaper', quantity: 2}],
      }),
      context,
    } as never);

    expect(context.cart.updateLines).not.toHaveBeenCalled();
  });

  it('does not call Shopify LinesUpdate for configured attribute forgery', async () => {
    const context = cartContext();

    await cartAction({
      request: cartRequest('LinesUpdate', {
        lines: [
          {
            id: 'line-wallpaper',
            attributes: [
              {key: 'configurator_payload', value: '{}'},
              {key: 'configurator_instance_id', value: 'forged'},
            ],
          },
        ],
      }),
      context,
    } as never);

    expect(context.cart.updateLines).not.toHaveBeenCalled();
  });

  it('continues to call Shopify LinesUpdate for ordinary accessory quantity', async () => {
    const context = cartContext();
    const lines = [{id: 'line-accessory', quantity: 3}];

    await cartAction({
      request: cartRequest('LinesUpdate', {lines}),
      context,
    } as never);

    expect(context.cart.updateLines).toHaveBeenCalledWith(lines);
  });

  it('continues to remove a configured line through Shopify LinesRemove', async () => {
    const context = cartContext();

    await cartAction({
      request: cartRequest('LinesRemove', {
        lineIds: ['line-wallpaper'],
      }),
      context,
    } as never);

    expect(context.cart.removeLines).toHaveBeenCalledWith(['line-wallpaper']);
  });
});
