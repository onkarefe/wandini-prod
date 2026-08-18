import {describe, expect, it} from 'vitest';
import {
  DynamicPricingError,
  findOrCreateDraftOrder,
  prepareDraftOrder,
  type DynamicPricingCart,
} from '~/lib/dynamic-pricing.server';

const payload = JSON.stringify({
  version: 1,
  master_asset_id: 'asset-1',
  output: {unit: 'mm', width: 2000, height: 2500},
  crop_ratio: {x: 0, y: 0, w: 1, h: 1},
});

function cart(configuredQuantity = 1): DynamicPricingCart {
  return {
    id: 'gid://shopify/Cart/cart-1',
    lines: {
      nodes: [
        {
          id: 'line-wallpaper',
          quantity: configuredQuantity,
          attributes: [
            {key: 'configurator_payload', value: payload},
            {key: 'configurator_instance_id', value: 'configuration-1'},
          ],
          merchandise: {
            id: 'gid://shopify/ProductVariant/1',
            price: {amount: '0.29', currencyCode: 'EUR'},
          },
        },
        {
          id: 'line-adhesive',
          quantity: 2,
          attributes: [],
          merchandise: {
            id: 'gid://shopify/ProductVariant/2',
            price: {amount: '12.00', currencyCode: 'EUR'},
          },
        },
      ],
    },
    discountCodes: [{code: 'WAND10', applicable: false}],
    buyerIdentity: {countryCode: 'DE', email: 'buyer@example.com'},
  };
}

function pricingClient(overrides: Record<string, unknown> = {}) {
  const variant = {
    __typename: 'ProductVariant',
    id: 'gid://shopify/ProductVariant/1',
    availableForSale: true,
    product: {
      id: 'gid://shopify/Product/1',
      masterAssetId: {value: 'asset-1'},
    },
    printQuality: {
      reference: {
        __typename: 'Metaobject',
        id: 'gid://shopify/Metaobject/1',
        pricePerM2: {value: '28.89'},
        minWidthCm: {value: '50'},
        maxWidthCm: {value: '1000'},
        minHeightCm: {value: '50'},
        maxHeightCm: {value: '1000'},
      },
    },
    ...overrides,
  };
  const accessoryVariant = {
    __typename: 'ProductVariant',
    id: 'gid://shopify/ProductVariant/2',
    availableForSale: true,
    product: {
      id: 'gid://shopify/Product/2',
      masterAssetId: null,
    },
    printQuality: null,
  };

  return {
    request: async <T>() =>
      ({shop: {currencyCode: 'EUR'}, nodes: [variant, accessoryVariant]}) as T,
  };
}

describe('Draft Order line preparation', () => {
  it('overrides only configured wallpaper and preserves accessory quantity', async () => {
    const prepared = await prepareDraftOrder(cart(), pricingClient());
    expect(prepared.input.lineItems).toEqual([
      expect.objectContaining({
        variantId: 'gid://shopify/ProductVariant/1',
        quantity: 1,
        priceOverride: {amount: '144.45', currencyCode: 'EUR'},
        customAttributes: expect.arrayContaining([
          {key: 'configurator_payload', value: payload},
        ]),
      }),
      {
        variantId: 'gid://shopify/ProductVariant/2',
        quantity: 2,
      },
    ]);
    expect(prepared.input.discountCodes).toEqual(['WAND10']);
    expect(prepared.input.sessionToken).toBe(prepared.fingerprint);
  });

  it('produces the same fingerprint for retries and a new one after cart change', async () => {
    const first = await prepareDraftOrder(cart(), pricingClient());
    const retry = await prepareDraftOrder(cart(), pricingClient());
    const changedCart = cart();
    changedCart.lines.nodes[1].quantity = 3;
    const changed = await prepareDraftOrder(changedCart, pricingClient());
    const changedBuyer = cart();
    changedBuyer.buyerIdentity!.email = 'different@example.com';
    const changedBuyerDraft = await prepareDraftOrder(
      changedBuyer,
      pricingClient(),
    );
    expect(retry.fingerprint).toBe(first.fingerprint);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changedBuyerDraft.fingerprint).not.toBe(first.fingerprint);
  });

  it('rejects merged/tampered configured quantities', async () => {
    await expect(prepareDraftOrder(cart(2), pricingClient())).rejects.toMatchObject({
      code: 'INVALID_CONFIGURATION',
    } satisfies Partial<DynamicPricingError>);
  });

  it('uses Admin metadata rather than payload presence for classification', async () => {
    const missingPayload = cart();
    missingPayload.lines.nodes[0].attributes = [];
    await expect(
      prepareDraftOrder(missingPayload, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});

    const forgedAccessory = cart();
    forgedAccessory.lines.nodes[1].attributes = [
      {key: 'configurator_payload', value: payload},
      {key: 'configurator_instance_id', value: 'forged'},
    ];
    await expect(
      prepareDraftOrder(forgedAccessory, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});

    const ordinaryOnly = cart();
    ordinaryOnly.lines.nodes = [ordinaryOnly.lines.nodes[1]];
    const prepared = await prepareDraftOrder(ordinaryOnly, pricingClient());
    expect(prepared.configuredLineCount).toBe(0);
    expect(prepared.input.lineItems).toEqual([
      {variantId: 'gid://shopify/ProductVariant/2', quantity: 2},
    ]);
  });

  it('rejects artwork and material-dimension tampering', async () => {
    await expect(
      prepareDraftOrder(
        cart(),
        pricingClient({
          product: {
            id: 'gid://shopify/Product/1',
            masterAssetId: {value: 'different-asset'},
          },
        }),
      ),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});

    const constrained = pricingClient({
      printQuality: {
        reference: {
          __typename: 'Metaobject',
          id: 'gid://shopify/Metaobject/1',
          pricePerM2: {value: '28.89'},
          minWidthCm: null,
          maxWidthCm: {value: '150'},
          minHeightCm: null,
          maxHeightCm: null,
        },
      },
    });
    await expect(prepareDraftOrder(cart(), constrained)).rejects.toMatchObject({
      code: 'INVALID_CONFIGURATION',
    });

    await expect(
      prepareDraftOrder(
        cart(),
        pricingClient({
          printQuality: {
            reference: {
              __typename: 'Metaobject',
              id: 'gid://shopify/Metaobject/1',
              pricePerM2: null,
              minWidthCm: null,
              maxWidthCm: null,
              minHeightCm: null,
              maxHeightCm: null,
            },
          },
        }),
      ),
    ).rejects.toMatchObject({code: 'PRICING_UNAVAILABLE'});
  });

  it('reuses an existing checkout for the same server fingerprint', async () => {
    const prepared = await prepareDraftOrder(cart(), pricingClient());
    let requestCount = 0;
    const client = {
      request: async <T>() => {
        requestCount += 1;
        return {
          draftOrders: {
            nodes: [
              {
                id: 'gid://shopify/DraftOrder/1',
                status: 'OPEN',
                invoiceUrl: 'https://example.myshopify.com/invoice/1',
                customAttributes: [
                  {
                    key: 'wandini_checkout_fingerprint',
                    value: prepared.fingerprint,
                  },
                ],
              },
            ],
          },
        } as T;
      },
    };

    await expect(findOrCreateDraftOrder(prepared, client)).resolves.toEqual({
      draftOrderId: 'gid://shopify/DraftOrder/1',
      invoiceUrl: 'https://example.myshopify.com/invoice/1',
      reused: true,
    });
    expect(requestCount).toBe(1);
  });

  it('does not reuse a completed Draft Order', async () => {
    const prepared = await prepareDraftOrder(cart(), pricingClient());
    let requestCount = 0;
    const client = {
      request: async <T>() => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            draftOrders: {
              nodes: [
                {
                  id: 'gid://shopify/DraftOrder/paid',
                  status: 'COMPLETED',
                  invoiceUrl: 'https://example.myshopify.com/invoice/paid',
                  customAttributes: [
                    {
                      key: 'wandini_checkout_fingerprint',
                      value: prepared.fingerprint,
                    },
                  ],
                },
              ],
            },
          } as T;
        }
        return {
          draftOrderCreate: {
            draftOrder: {
              id: 'gid://shopify/DraftOrder/new',
              invoiceUrl: 'https://example.myshopify.com/invoice/new',
            },
            userErrors: [],
          },
        } as T;
      },
    };

    await expect(findOrCreateDraftOrder(prepared, client)).resolves.toEqual({
      draftOrderId: 'gid://shopify/DraftOrder/new',
      invoiceUrl: 'https://example.myshopify.com/invoice/new',
      reused: false,
    });
    expect(requestCount).toBe(2);
  });
});
