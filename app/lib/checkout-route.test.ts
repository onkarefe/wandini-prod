import {beforeEach, describe, expect, it, vi} from 'vitest';
import {action as checkoutAction} from '~/routes/checkout';

const configuredCart = {
  id: 'gid://shopify/Cart/cart-1',
  lines: {
    nodes: [
      {
        id: 'line-wallpaper',
        quantity: 1,
        attributes: [
          {key: 'configurator_payload', value: '{}'},
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
    ],
  },
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('configured checkout route', () => {
  it('returns a controlled disabled redirect without making an Admin request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await checkoutAction({
      request: new Request('https://example.com/checkout', {method: 'POST'}),
      context: {
        cart: {get: vi.fn().mockResolvedValue(configuredCart)},
        env: {},
      },
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/cart?checkout=disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
