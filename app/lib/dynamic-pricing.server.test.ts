import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  DynamicPricingError,
  findOrCreateDraftOrder,
  getCartPricingEvaluation,
  prepareDraftOrder,
  validateCartLineInputsForAdd,
  validateCartLineInputsForUpdate,
  type DynamicPricingCart,
} from '~/lib/dynamic-pricing.server';

const payload = JSON.stringify({
  version: 1,
  master_asset_id: 'asset-1',
  output: {unit: 'mm', width: 2000, height: 2500},
  crop_ratio: {x: 0, y: 0, w: 1, h: 1},
});

const secondPayload = JSON.stringify({
  version: 1,
  master_asset_id: 'asset-1',
  output: {unit: 'mm', width: 1000, height: 1000},
  crop_ratio: {x: 0.1, y: 0.1, w: 0.8, h: 0.8},
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
            price: {amount: '28.89', currencyCode: 'EUR'},
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
          id: 'line-adhesive',
          quantity: 2,
          attributes: [],
          merchandise: {
            id: 'gid://shopify/ProductVariant/2',
            price: {amount: '12.00', currencyCode: 'EUR'},
            product: {masterAssetId: null},
            printQuality: null,
          },
        },
      ],
    },
    discountCodes: [{code: 'WAND10', applicable: false}],
    buyerIdentity: {countryCode: 'DE', email: 'buyer@example.com'},
  };
}

function configuredVariant(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'ProductVariant',
    id: 'gid://shopify/ProductVariant/1',
    availableForSale: true,
    price: '28.89',
    product: {
      id: 'gid://shopify/Product/1',
      masterAssetId: {value: 'asset-1'},
    },
    printQuality: {
      reference: materialReference(),
    },
    ...overrides,
  };
}

function materialReference(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Metaobject',
    id: 'gid://shopify/Metaobject/1',
    pricePerM2: {value: '28.89'},
    minWidthCm: {value: '50'},
    minHeightCm: {value: '50'},
    ...overrides,
  };
}

function accessoryVariant() {
  return {
    __typename: 'ProductVariant',
    id: 'gid://shopify/ProductVariant/2',
    availableForSale: true,
    price: '12.00',
    product: {
      id: 'gid://shopify/Product/2',
      masterAssetId: null,
    },
    printQuality: null,
  };
}

function pricingClient(overrides: Record<string, unknown> = {}) {
  const variant = configuredVariant(overrides);
  const accessory = accessoryVariant();

  return {
    request: async <T>() =>
      ({shop: {currencyCode: 'EUR'}, nodes: [variant, accessory]}) as T,
  };
}

function stubAdminApi({
  nodes,
  calculatedDraftOrder,
}: {
  nodes: Array<Record<string, unknown>>;
  calculatedDraftOrder?: {
    subtotalPriceSet: {
      presentmentMoney: {amount: string; currencyCode: string};
    };
    totalPriceSet: {presentmentMoney: {amount: string; currencyCode: string}};
    discountCodes: string[];
  };
}) {
  const operations: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/admin/oauth/access_token')) {
        return new Response(
          JSON.stringify({access_token: 'test-token', expires_in: 3600}),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        );
      }

      const request = JSON.parse(String(init?.body)) as {query: string};
      if (request.query.includes('WandiniConfiguredVariantPricing')) {
        operations.push('variant-pricing');
        return new Response(
          JSON.stringify({
            data: {shop: {currencyCode: 'EUR'}, nodes},
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        );
      }
      if (request.query.includes('WandiniDraftOrderCalculate')) {
        operations.push('draft-order-calculate');
        return new Response(
          JSON.stringify({
            data: {
              draftOrderCalculate: {
                calculatedDraftOrder: calculatedDraftOrder ?? null,
                userErrors: [],
              },
            },
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        );
      }

      throw new Error('Unexpected Admin API operation in test.');
    }),
  );

  return operations;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('keeps differently configured wallpapers as separate lines and identities', async () => {
    const configuredCart = cart();
    const first = configuredCart.lines.nodes[0];
    configuredCart.lines.nodes = [
      first,
      {
        ...first,
        id: 'line-wallpaper-2',
        attributes: [
          {key: 'configurator_payload', value: secondPayload},
          {key: 'configurator_instance_id', value: 'configuration-2'},
        ],
      },
    ];

    const prepared = await prepareDraftOrder(configuredCart, pricingClient());

    expect(prepared.configuredLineCount).toBe(2);
    expect(prepared.input.lineItems).toHaveLength(2);
    expect(prepared.input.lineItems.map((line) => line.priceOverride)).toEqual([
      {amount: '144.45', currencyCode: 'EUR'},
      {amount: '28.89', currencyCode: 'EUR'},
    ]);
    expect(
      prepared.input.lineItems.map(
        (line) =>
          line.customAttributes?.find(
            ({key}) => key === 'configurator_instance_id',
          )?.value,
      ),
    ).toEqual(['configuration-1', 'configuration-2']);
  });

  it('rejects merged/tampered configured quantities', async () => {
    await expect(
      prepareDraftOrder(cart(2), pricingClient()),
    ).rejects.toMatchObject({
      code: 'INVALID_CONFIGURED_QUANTITY',
    } satisfies Partial<DynamicPricingError>);
  });

  it('rejects malformed configurator payload JSON at checkout preparation', async () => {
    const malformed = cart();
    malformed.lines.nodes[0].attributes[0].value = '{not-json';

    await expect(
      prepareDraftOrder(malformed, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
  });

  it('rejects crop ratios that extend beyond the master asset', async () => {
    const invalidCrop = cart();
    invalidCrop.lines.nodes[0].attributes[0].value = JSON.stringify({
      version: 1,
      master_asset_id: 'asset-1',
      output: {unit: 'mm', width: 2000, height: 2500},
      crop_ratio: {x: 0.75, y: 0, w: 0.5, h: 1},
    });

    await expect(
      prepareDraftOrder(invalidCrop, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
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

  it('fails closed for either partially configured Admin metadata state', async () => {
    await expect(
      prepareDraftOrder(cart(), pricingClient({printQuality: null})),
    ).rejects.toMatchObject({code: 'PARTIALLY_CONFIGURED_PRODUCT'});

    await expect(
      prepareDraftOrder(
        cart(),
        pricingClient({
          product: {
            id: 'gid://shopify/Product/1',
            masterAssetId: null,
          },
        }),
      ),
    ).rejects.toMatchObject({code: 'PARTIALLY_CONFIGURED_PRODUCT'});
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
  });

  it.each([
    ['below minimum width', {minWidthCm: {value: '201'}}],
    ['below minimum height', {minHeightCm: {value: '251'}}],
  ])('rejects dimensions %s', async (_label, limits) => {
    await expect(
      prepareDraftOrder(
        cart(),
        pricingClient({
          printQuality: {reference: materialReference(limits)},
        }),
      ),
    ).rejects.toMatchObject({code: 'DIMENSION_LIMIT_VIOLATION'});
  });

  it('accepts dimensions exactly on all material boundaries', async () => {
    const prepared = await prepareDraftOrder(
      cart(),
      pricingClient({
        printQuality: {
          reference: materialReference({
            minWidthCm: {value: '200'},
            minHeightCm: {value: '250'},
          }),
        },
      }),
    );

    expect(prepared.input.lineItems[0].priceOverride).toEqual({
      amount: '144.45',
      currencyCode: 'EUR',
    });
  });

  it('accepts very wide wallpaper because width has no maximum', async () => {
    const wideWallpaper = cart();
    wideWallpaper.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      output: {unit: 'mm', width: 100_000, height: 2500},
    });

    const prepared = await prepareDraftOrder(wideWallpaper, pricingClient());

    expect(prepared.input.lineItems[0].priceOverride).toEqual({
      amount: '7222.50',
      currencyCode: 'EUR',
    });
  });

  it('keeps the hardcoded 312 cm maximum height authoritative', async () => {
    const atMaximum = cart();
    atMaximum.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      output: {unit: 'mm', width: 2000, height: 3120},
    });
    await expect(
      prepareDraftOrder(atMaximum, pricingClient()),
    ).resolves.toMatchObject({configuredLineCount: 1});

    const aboveMaximum = cart();
    aboveMaximum.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      output: {unit: 'mm', width: 2000, height: 3121},
    });
    await expect(
      prepareDraftOrder(aboveMaximum, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
  });

  it('rejects duplicate configured instance IDs within one cart', async () => {
    const duplicate = cart();
    const first = duplicate.lines.nodes[0];
    duplicate.lines.nodes = [
      first,
      {
        ...first,
        id: 'line-wallpaper-2',
        attributes: [
          {key: 'configurator_payload', value: secondPayload},
          {key: 'configurator_instance_id', value: 'configuration-1'},
        ],
      },
    ];

    await expect(
      prepareDraftOrder(duplicate, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATOR_INSTANCE_ID'});
  });

  it('rejects a duplicate configured instance ID before adding a new line', async () => {
    const operations = stubAdminApi({nodes: [configuredVariant()]});

    await expect(
      validateCartLineInputsForAdd(
        [
          {
            merchandiseId: 'gid://shopify/ProductVariant/1',
            quantity: 1,
            attributes: [
              {key: 'configurator_payload', value: secondPayload},
              {
                key: 'configurator_instance_id',
                value: 'configuration-1',
              },
            ],
          },
        ],
        {
          PUBLIC_STORE_DOMAIN: 'duplicate-add.myshopify.com',
          SHOPIFY_SHOP: 'duplicate-add.myshopify.com',
          SHOPIFY_PRICING_CLIENT_ID: 'duplicate-add-client',
          SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
        },
        cart(),
      ),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATOR_INSTANCE_ID'});
    expect(operations).toEqual(['variant-pricing']);
  });

  it('does not apply configured instance uniqueness to ordinary lines', async () => {
    const ordinary = cart();
    const first = ordinary.lines.nodes[1];
    ordinary.lines.nodes = [
      {
        ...first,
        attributes: [
          {key: 'configurator_instance_id', value: 'shared-ordinary-id'},
        ],
      },
      {
        ...first,
        id: 'line-adhesive-2',
        attributes: [
          {key: 'configurator_instance_id', value: 'shared-ordinary-id'},
        ],
      },
    ];

    await expect(
      prepareDraftOrder(ordinary, pricingClient()),
    ).resolves.toMatchObject({configuredLineCount: 0});
  });

  it('rejects malformed configured instance IDs deterministically', async () => {
    const malformedIdentity = cart();
    malformedIdentity.lines.nodes[0].attributes[1].value = 'invalid identity';

    await expect(
      prepareDraftOrder(malformedIdentity, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATOR_INSTANCE_ID'});
  });

  it('blocks configured quantity and attribute changes through LinesUpdate', () => {
    const configuredCart = cart();

    expect(() =>
      validateCartLineInputsForUpdate(
        [{id: 'line-wallpaper', quantity: 2}],
        configuredCart,
      ),
    ).toThrowError(
      expect.objectContaining({code: 'INVALID_CONFIGURED_QUANTITY'}),
    );
    expect(() =>
      validateCartLineInputsForUpdate(
        [
          {
            id: 'line-wallpaper',
            attributes: [
              {key: 'configurator_payload', value: secondPayload},
              {key: 'configurator_instance_id', value: 'forged'},
            ],
          },
        ],
        configuredCart,
      ),
    ).toThrowError(expect.objectContaining({code: 'INVALID_CONFIGURATION'}));
    expect(() =>
      validateCartLineInputsForUpdate(
        [
          {
            id: 'line-wallpaper',
            merchandiseId: 'gid://shopify/ProductVariant/2',
          },
        ],
        configuredCart,
      ),
    ).toThrowError(expect.objectContaining({code: 'INVALID_CONFIGURATION'}));
  });

  it('preserves ordinary accessory quantity updates', () => {
    expect(() =>
      validateCartLineInputsForUpdate(
        [{id: 'line-adhesive', quantity: 3}],
        cart(),
      ),
    ).not.toThrow();
  });

  it.each(['0', 'not-a-price'])(
    'rejects invalid Admin variant price %s',
    async (price) => {
      await expect(
        prepareDraftOrder(cart(), pricingClient({price})),
      ).rejects.toMatchObject({code: 'PRICING_UNAVAILABLE'});
    },
  );

  it('rejects a Storefront cart currency that differs from shop currency', async () => {
    const mismatchedCurrency = cart();
    mismatchedCurrency.lines.nodes[0].merchandise.price = {
      amount: '28.89',
      currencyCode: 'USD',
    };

    await expect(
      prepareDraftOrder(mismatchedCurrency, pricingClient()),
    ).rejects.toMatchObject({code: 'CURRENCY_MISMATCH'});
  });

  it('ignores fabricated client pricing and uses only Admin variant.price', async () => {
    const tampered = cart();
    tampered.lines.nodes[0].merchandise.price = {
      amount: '0.01',
      currencyCode: 'EUR',
    };
    tampered.lines.nodes[0].attributes.push(
      {key: 'price_per_m2', value: '0.01'},
      {key: 'price_wo_disc', value: '0.01'},
      {key: 'priceOverride', value: '0.01'},
    );
    tampered.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      price_per_m2: '0.01',
      price_wo_disc: '0.01',
    });

    const prepared = await prepareDraftOrder(tampered, pricingClient());

    expect(prepared.input.lineItems[0]).toMatchObject({
      variantId: 'gid://shopify/ProductVariant/1',
      quantity: 1,
      priceOverride: {amount: '144.45', currencyCode: 'EUR'},
    });
  });

  it('copies trimmed, de-duplicated discount codes for Draft Order validation', async () => {
    const discounted = cart();
    discounted.discountCodes = [
      {code: ' WAND10 ', applicable: false},
      {code: 'WAND10', applicable: true},
      {code: 'VIP', applicable: true},
      {code: ' ', applicable: false},
    ];

    const prepared = await prepareDraftOrder(discounted, pricingClient());

    expect(prepared.input.discountCodes).toEqual(['WAND10', 'VIP']);
    expect(prepared.input.acceptAutomaticDiscounts).toBe(true);
    expect(prepared.input.allowDiscountCodesInCheckout).toBe(true);
  });

  it('selects Draft Order checkout mode for a configured cart', async () => {
    const operations = stubAdminApi({
      nodes: [configuredVariant(), accessoryVariant()],
      calculatedDraftOrder: {
        subtotalPriceSet: {
          presentmentMoney: {amount: '168.45', currencyCode: 'EUR'},
        },
        totalPriceSet: {
          presentmentMoney: {amount: '151.61', currencyCode: 'EUR'},
        },
        discountCodes: ['WAND10'],
      },
    });

    await expect(
      getCartPricingEvaluation(cart(), {
        PUBLIC_STORE_DOMAIN: 'mode-draft.myshopify.com',
        SHOPIFY_SHOP: 'mode-draft.myshopify.com',
        SHOPIFY_PRICING_CLIENT_ID: 'draft-client',
        SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
      }),
    ).resolves.toEqual({
      checkoutMode: 'draft',
      pricingQuote: {
        subtotalAmount: {amount: '168.45', currencyCode: 'EUR'},
        totalAmount: {amount: '151.61', currencyCode: 'EUR'},
        discountCodes: ['WAND10'],
      },
    });
    expect(operations).toEqual(['variant-pricing', 'draft-order-calculate']);
  });

  it('selects native checkout mode for an ordinary-only cart', async () => {
    const ordinaryOnly = cart();
    ordinaryOnly.lines.nodes = [ordinaryOnly.lines.nodes[1]];
    const operations = stubAdminApi({nodes: [accessoryVariant()]});

    await expect(
      getCartPricingEvaluation(ordinaryOnly, {
        PUBLIC_STORE_DOMAIN: 'mode-native.myshopify.com',
        SHOPIFY_SHOP: 'mode-native.myshopify.com',
        SHOPIFY_PRICING_CLIENT_ID: 'native-client',
        SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
      }),
    ).resolves.toEqual({checkoutMode: 'native', pricingQuote: null});
    expect(operations).toEqual([]);
  });

  it('fails closed on partial Storefront classification without calling Admin', async () => {
    const partial = cart();
    partial.lines.nodes[0].merchandise.printQuality = null;
    const operations = stubAdminApi({
      nodes: [configuredVariant(), accessoryVariant()],
    });

    await expect(
      getCartPricingEvaluation(partial, {
        PUBLIC_STORE_DOMAIN: 'mode-partial.myshopify.com',
        SHOPIFY_SHOP: 'mode-partial.myshopify.com',
        SHOPIFY_PRICING_CLIENT_ID: 'partial-client',
        SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
      }),
    ).rejects.toMatchObject({code: 'PARTIALLY_CONFIGURED_PRODUCT'});
    expect(operations).toEqual([]);
  });

  it('rejects configurator payload on an ordinary Storefront line without calling Admin', async () => {
    const forgedOrdinary = cart();
    forgedOrdinary.lines.nodes = [forgedOrdinary.lines.nodes[1]];
    forgedOrdinary.lines.nodes[0].attributes = [
      {key: 'configurator_payload', value: payload},
      {key: 'configurator_instance_id', value: 'forged'},
    ];
    const operations = stubAdminApi({nodes: [accessoryVariant()]});

    await expect(
      getCartPricingEvaluation(forgedOrdinary, {
        PUBLIC_STORE_DOMAIN: 'mode-forged.myshopify.com',
        SHOPIFY_SHOP: 'mode-forged.myshopify.com',
        SHOPIFY_PRICING_CLIENT_ID: 'forged-client',
        SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
      }),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
    expect(operations).toEqual([]);
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
