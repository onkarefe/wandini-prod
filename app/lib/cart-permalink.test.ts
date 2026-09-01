import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {action as cartPermalinkAction} from '~/routes/cart.$lines';

function adminVariant({
  configured = false,
  partial = false,
  id = '2',
}: {
  configured?: boolean;
  partial?: boolean;
  id?: string;
} = {}) {
  return {
    __typename: 'ProductVariant',
    id: `gid://shopify/ProductVariant/${id}`,
    availableForSale: true,
    price: configured || partial ? '28.89' : '12.00',
    product: {
      id: `gid://shopify/Product/${id}`,
      masterAssetId: configured || partial ? {value: 'asset-1'} : null,
    },
    printQuality: configured
      ? {
          reference: {
            __typename: 'Metaobject',
            id: 'gid://shopify/Metaobject/1',
            minWidthCm: {value: '50'},
            minHeightCm: {value: '50'},
          },
        }
      : null,
  };
}

function stubAdminVariants(nodes: Array<Record<string, unknown>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/admin/oauth/access_token')) {
        return new Response(
          JSON.stringify({access_token: 'permalink-token', expires_in: 3600}),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        );
      }

      const request = JSON.parse(String(init?.body)) as {query: string};
      if (request.query.includes('WandiniConfiguredVariantPricing')) {
        return new Response(
          JSON.stringify({
            data: {shop: {currencyCode: 'EUR'}, nodes},
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        );
      }

      throw new Error('Unexpected Admin API operation in permalink test.');
    }),
  );
}

function contextWithCreatedCart(createdCart: Record<string, unknown>) {
  return {
    env: {
      SHOPIFY_SHOP: 'permalink-checkpoint.myshopify.com',
      SHOPIFY_PRICING_CLIENT_ID: 'permalink-client',
      SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
    },
    cart: {
      create: vi.fn().mockResolvedValue({cart: createdCart, errors: []}),
      setCartId: vi.fn().mockReturnValue(new Headers()),
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cart permalink checkout classification', () => {
  it('keeps an ordinary permalink on native Shopify checkout', async () => {
    stubAdminVariants([adminVariant()]);
    const createdCart = {
      id: 'gid://shopify/Cart/permalink-ordinary',
      checkoutUrl: 'https://checkout.example.com/native',
      lines: {
        nodes: [
          {
            id: 'line-accessory',
            quantity: 3,
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
    const context = contextWithCreatedCart(createdCart);

    const response = await cartPermalinkAction({
      request: new Request('https://example.com/cart/2:3?discount=SAVE', {
        method: 'POST',
      }),
      params: {lines: '2:3'},
      context,
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(createdCart.checkoutUrl);
    expect(context.cart.create).toHaveBeenCalledWith({
      lines: [
        {
          merchandiseId: 'gid://shopify/ProductVariant/2',
          quantity: 3,
        },
      ],
      discountCodes: ['SAVE'],
    });
  });

  it.each([
    ['configured', [adminVariant({configured: true, id: '1'})], '1:1'],
    ['partial', [adminVariant({partial: true, id: '1'})], '1:1'],
    [
      'mixed',
      [adminVariant(), adminVariant({configured: true, id: '1'})],
      '2:2,1:1',
    ],
  ])(
    'rejects a %s permalink before cart creation',
    async (_label, nodes, lines) => {
      stubAdminVariants(nodes);
      const context = contextWithCreatedCart({});

      await expect(
        cartPermalinkAction({
          request: new Request(`https://example.com/cart/${lines}`, {
            method: 'POST',
          }),
          params: {lines},
          context,
        } as never),
      ).rejects.toMatchObject({status: 422});
      expect(context.cart.create).not.toHaveBeenCalled();
    },
  );

  it('reclassifies the created cart before using its native checkout URL', async () => {
    stubAdminVariants([adminVariant()]);
    const context = contextWithCreatedCart({
      id: 'gid://shopify/Cart/reclassified',
      checkoutUrl: 'https://checkout.example.com/must-not-be-used',
      lines: {
        nodes: [
          {
            id: 'line-changed-after-validation',
            quantity: 1,
            attributes: [],
            merchandise: {
              id: 'gid://shopify/ProductVariant/2',
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
    });

    await expect(
      cartPermalinkAction({
        request: new Request('https://example.com/cart/2:1', {
          method: 'POST',
        }),
        params: {lines: '2:1'},
        context,
      } as never),
    ).rejects.toMatchObject({status: 422});
    expect(context.cart.create).toHaveBeenCalledOnce();
  });
});
