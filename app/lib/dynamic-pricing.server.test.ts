import {createHmac} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  DynamicPricingError,
  canonicalCheckoutProofJson,
  canonicalCheckoutProofMoney,
  findOrCreateDraftOrder,
  getCartPricingEvaluation,
  getOrCreateDraftOrderCheckout,
  prepareDraftOrder as prepareDraftOrderForCheckout,
  validateCartLineInputsForAdd,
  validateCartLineInputsForUpdate,
  type AdminClient,
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
    sku: '20-140.1-3',
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

function prepareDraftOrder(cartValue: DynamicPricingCart, client: AdminClient) {
  return prepareDraftOrderForCheckout(cartValue, client, checkoutEnv());
}

function checkoutEnv(
  overrides: Partial<Env> = {},
): Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'SHOPIFY_SHOP'
  | 'SHOPIFY_PRICING_CLIENT_ID'
  | 'SHOPIFY_PRICING_CLIENT_SECRET'
  | 'DYNAMIC_PRICING_CHECKOUT_ENABLED'
  | 'WANDINI_CHECKOUT_HMAC_SECRET'
> {
  return {
    PUBLIC_STORE_DOMAIN: 'checkout-test.myshopify.com',
    SHOPIFY_SHOP: 'checkout-test.myshopify.com',
    SHOPIFY_PRICING_CLIENT_ID: 'checkout-test-client',
    SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
    DYNAMIC_PRICING_CHECKOUT_ENABLED: 'true',
    WANDINI_CHECKOUT_HMAC_SECRET: 'wandini-test-secret',
    ...overrides,
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
    const mixedCart = cart();
    mixedCart.lines.nodes[1].attributes = [{key: 'size', value: 'large'}];

    const prepared = await prepareDraftOrder(mixedCart, pricingClient());
    expect(prepared.input.lineItems).toEqual([
      expect.objectContaining({
        variantId: 'gid://shopify/ProductVariant/1',
        quantity: 1,
        priceOverride: {amount: '144.45', currencyCode: 'EUR'},
        customAttributes: expect.arrayContaining([
          {key: '_configurator_payload', value: payload},
          {
            key: '_configurator_instance_id',
            value: 'configuration-1',
          },
        ]),
      }),
      {
        variantId: 'gid://shopify/ProductVariant/2',
        quantity: 2,
        customAttributes: [{key: 'size', value: 'large'}],
      },
    ]);
    expect(prepared.input.discountCodes).toEqual(['WAND10']);
    expect(prepared.input).not.toHaveProperty('sessionToken');
    expect(prepared.input).not.toHaveProperty('visibleToCustomer');
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

  it('preserves and hashes the exact original configurator payload', async () => {
    const exactPayload = `{
  \u0022version\u0022: 1,
  \u0022master_asset_id\u0022: \u0022asset-1\u0022,
  \u0022output\u0022: {\u0022unit\u0022: \u0022mm\u0022, \u0022width\u0022: 2000, \u0022height\u0022: 2500},
  \u0022crop_ratio\u0022: {\u0022x\u0022: 0, \u0022y\u0022: 0, \u0022w\u0022: 1, \u0022h\u0022: 1}
}`;
    const configuredCart = cart();
    configuredCart.lines.nodes[0].attributes = [
      {key: 'configurator_payload', value: exactPayload},
      {key: 'configurator_instance_id', value: 'configuration-1'},
      {key: 'finish', value: 'matte'},
    ];

    const prepared = await prepareDraftOrder(configuredCart, pricingClient());
    const attributes = prepared.input.lineItems[0].customAttributes ?? [];
    const normalizedPayloadCart = cart();
    const normalized = await prepareDraftOrder(
      normalizedPayloadCart,
      pricingClient(),
    );

    expect(attributes).toEqual([
      {key: '_configurator_payload', value: exactPayload},
      {key: '_configurator_instance_id', value: 'configuration-1'},
      {key: 'finish', value: 'matte'},
    ]);
    expect(attributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({key: 'configurator_payload'}),
      ]),
    );
    expect(attributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({key: 'configurator_instance_id'}),
      ]),
    );
    expect(prepared.fingerprint).not.toBe(normalized.fingerprint);
  });

  it('canonicalizes semantically unordered checkout collections', async () => {
    const firstCart = cart();
    firstCart.attributes = [
      {key: 'second', value: '2'},
      {key: 'first', value: '1'},
    ];
    firstCart.discountCodes = [
      {code: 'VIP', applicable: true},
      {code: 'WAND10', applicable: true},
    ];
    const reorderedCart = structuredClone(firstCart);
    reorderedCart.attributes!.reverse();
    reorderedCart.discountCodes!.reverse();
    reorderedCart.lines.nodes[0].attributes.reverse();
    reorderedCart.lines.nodes.reverse();

    const first = await prepareDraftOrder(firstCart, pricingClient());
    const reordered = await prepareDraftOrder(reorderedCart, pricingClient());

    expect(reordered.fingerprint).toBe(first.fingerprint);
  });

  it('fingerprints every checkout-affecting cart and buyer field', async () => {
    const baseCart = cart();
    baseCart.attributes = [{key: 'delivery-note', value: 'front door'}];
    baseCart.note = 'Call on arrival';
    baseCart.buyerIdentity = {
      countryCode: 'DE',
      customer: {id: 'gid://shopify/Customer/1'},
      email: 'buyer@example.com',
      phone: '+49123456789',
    };
    const base = await prepareDraftOrder(baseCart, pricingClient());

    const mutations: Array<(value: DynamicPricingCart) => void> = [
      (value) => {
        value.id = 'gid://shopify/Cart/cart-2';
      },
      (value) => {
        value.lines.nodes[0].attributes[0].value = secondPayload;
      },
      (value) => {
        value.lines.nodes[0].attributes[1].value = 'configuration-2';
      },
      (value) => {
        value.lines.nodes[1].quantity = 3;
      },
      (value) => {
        value.lines.nodes[1].attributes = [{key: 'size', value: 'large'}];
      },
      (value) => {
        value.attributes = [{key: 'delivery-note', value: 'back door'}];
      },
      (value) => {
        value.discountCodes = [{code: 'VIP', applicable: true}];
      },
      (value) => {
        value.note = 'Leave silently';
      },
      (value) => {
        value.buyerIdentity!.countryCode = 'AT';
      },
      (value) => {
        value.buyerIdentity!.customer = {id: 'gid://shopify/Customer/2'};
      },
      (value) => {
        value.buyerIdentity!.email = 'other@example.com';
      },
      (value) => {
        value.buyerIdentity!.phone = '+43987654321';
      },
    ];

    for (const mutate of mutations) {
      const changedCart = structuredClone(baseCart);
      mutate(changedCart);
      const changed = await prepareDraftOrder(changedCart, pricingClient());
      expect(changed.fingerprint).not.toBe(base.fingerprint);
    }

    const changedVariantCart = structuredClone(baseCart);
    changedVariantCart.lines.nodes[1].merchandise.id =
      'gid://shopify/ProductVariant/3';
    const changedVariant = await prepareDraftOrder(changedVariantCart, {
      request: async <T>() =>
        ({
          shop: {currencyCode: 'EUR'},
          nodes: [
            configuredVariant(),
            {
              ...accessoryVariant(),
              id: 'gid://shopify/ProductVariant/3',
            },
          ],
        }) as T,
    });
    expect(changedVariant.fingerprint).not.toBe(base.fingerprint);

    const changedPrice = await prepareDraftOrder(
      baseCart,
      pricingClient({price: '30.00'}),
    );
    expect(changedPrice.fingerprint).not.toBe(base.fingerprint);

    const changedCurrencyCart = structuredClone(baseCart);
    changedCurrencyCart.lines.nodes[0].merchandise.price!.currencyCode = 'USD';
    await expect(
      prepareDraftOrder(changedCurrencyCart, {
        request: async <T>() =>
          ({
            shop: {currencyCode: 'USD'},
            nodes: [configuredVariant(), accessoryVariant()],
          }) as T,
      }),
    ).rejects.toMatchObject({code: 'CURRENCY_MISMATCH'});
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
            ({key}) => key === '_configurator_instance_id',
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
    const prepared = await prepareDraftOrderForCheckout(
      ordinaryOnly,
      pricingClient(),
      {},
    );
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

  it('keeps the hardcoded 562 cm maximum width authoritative', async () => {
    const atMaximum = cart();
    atMaximum.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      output: {unit: 'mm', width: 5620, height: 2500},
    });
    await expect(
      prepareDraftOrder(atMaximum, pricingClient()),
    ).resolves.toMatchObject({configuredLineCount: 1});

    const aboveMaximum = cart();
    aboveMaximum.lines.nodes[0].attributes[0].value = JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      output: {unit: 'mm', width: 5621, height: 2500},
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

  it('rejects forged ordinary and invalid configured line-add input', async () => {
    let operations = stubAdminApi({nodes: [accessoryVariant()]});
    await expect(
      validateCartLineInputsForAdd(
        [
          {
            merchandiseId: 'gid://shopify/ProductVariant/2',
            quantity: 1,
            attributes: [
              {key: 'configurator_payload', value: payload},
              {key: 'configurator_instance_id', value: 'forged'},
            ],
          },
        ],
        checkoutEnv(),
      ),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
    expect(operations).toEqual(['variant-pricing']);

    operations = stubAdminApi({nodes: [configuredVariant()]});
    await expect(
      validateCartLineInputsForAdd(
        [
          {
            merchandiseId: 'gid://shopify/ProductVariant/1',
            quantity: 2,
            attributes: [
              {key: 'configurator_payload', value: payload},
              {
                key: 'configurator_instance_id',
                value: 'configuration-new',
              },
            ],
          },
        ],
        checkoutEnv(),
      ),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURED_QUANTITY'});
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

  it('rejects duplicate reserved configurator attributes', async () => {
    const duplicatePayload = cart();
    duplicatePayload.lines.nodes[0].attributes.push({
      key: 'configurator_payload',
      value: secondPayload,
    });
    await expect(
      prepareDraftOrder(duplicatePayload, pricingClient()),
    ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});

    const duplicateIdentity = cart();
    duplicateIdentity.lines.nodes[0].attributes.push({
      key: 'configurator_instance_id',
      value: 'configuration-2',
    });
    await expect(
      prepareDraftOrder(duplicateIdentity, pricingClient()),
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

  it('rejects an unavailable configured variant', async () => {
    await expect(
      prepareDraftOrder(cart(), pricingClient({availableForSale: false})),
    ).rejects.toMatchObject({code: 'PRICING_UNAVAILABLE'});
  });

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

  it('keeps Storefront gift-card state out of Draft pricing and identity', async () => {
    const withoutGiftCard = await prepareDraftOrder(cart(), pricingClient());
    const withGiftCard = cart();
    withGiftCard.appliedGiftCards = [
      {
        id: 'gid://shopify/AppliedGiftCard/1',
        amountUsed: {amount: '9999.99', currencyCode: 'EUR'},
        clientClaimedValue: '9999.99',
      },
    ] as unknown as DynamicPricingCart['appliedGiftCards'];

    const prepared = await prepareDraftOrder(withGiftCard, pricingClient());

    expect(prepared.fingerprint).toBe(withoutGiftCard.fingerprint);
    expect(prepared.input).not.toHaveProperty('giftCardCodes');
    expect(prepared.input).not.toHaveProperty('appliedGiftCards');
    expect(prepared.input.discountCodes).toEqual(['WAND10']);
    expect(prepared.input.lineItems[0].priceOverride).toEqual({
      amount: '144.45',
      currencyCode: 'EUR',
    });
  });

  it('selects Draft Order checkout mode for a mixed cart with a gift card', async () => {
    const mixedCart = cart();
    mixedCart.appliedGiftCards = [{id: 'gid://shopify/AppliedGiftCard/1'}];
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
      getCartPricingEvaluation(mixedCart, {
        PUBLIC_STORE_DOMAIN: 'mode-draft.myshopify.com',
        SHOPIFY_SHOP: 'mode-draft.myshopify.com',
        SHOPIFY_PRICING_CLIENT_ID: 'draft-client',
        SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
        DYNAMIC_PRICING_CHECKOUT_ENABLED: 'true',
        WANDINI_CHECKOUT_HMAC_SECRET: 'wandini-test-secret',
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

  it('keeps a configured-only cart with a gift card on Draft checkout', async () => {
    const configuredOnly = cart();
    configuredOnly.lines.nodes = [configuredOnly.lines.nodes[0]];
    configuredOnly.appliedGiftCards = [{id: 'gid://shopify/AppliedGiftCard/1'}];
    const operations = stubAdminApi({
      nodes: [configuredVariant()],
      calculatedDraftOrder: {
        subtotalPriceSet: {
          presentmentMoney: {amount: '144.45', currencyCode: 'EUR'},
        },
        totalPriceSet: {
          presentmentMoney: {amount: '144.45', currencyCode: 'EUR'},
        },
        discountCodes: [],
      },
    });

    await expect(
      getCartPricingEvaluation(configuredOnly, checkoutEnv()),
    ).resolves.toMatchObject({checkoutMode: 'draft'});
    expect(operations).toEqual(['variant-pricing', 'draft-order-calculate']);
  });

  it('selects native checkout mode for an ordinary-only cart with a gift card', async () => {
    const ordinaryOnly = cart();
    ordinaryOnly.lines.nodes = [ordinaryOnly.lines.nodes[1]];
    ordinaryOnly.appliedGiftCards = [{id: 'gid://shopify/AppliedGiftCard/1'}];
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

  it.each([undefined, 'false', 'TRUE', '1', ''])(
    'fails closed for configured checkout when the flag is %s',
    async (flag) => {
      const operations = stubAdminApi({
        nodes: [configuredVariant(), accessoryVariant()],
      });

      await expect(
        getCartPricingEvaluation(
          cart(),
          checkoutEnv({DYNAMIC_PRICING_CHECKOUT_ENABLED: flag}),
        ),
      ).rejects.toMatchObject({code: 'DYNAMIC_CHECKOUT_DISABLED'});
      expect(operations).toEqual([]);
    },
  );

  it('blocks configured checkout execution before Admin when the flag is missing', async () => {
    const operations = stubAdminApi({
      nodes: [configuredVariant(), accessoryVariant()],
    });

    await expect(
      getOrCreateDraftOrderCheckout(
        cart(),
        checkoutEnv({DYNAMIC_PRICING_CHECKOUT_ENABLED: undefined}),
      ),
    ).rejects.toMatchObject({code: 'DYNAMIC_CHECKOUT_DISABLED'});
    expect(operations).toEqual([]);
  });

  it('allows configured Draft checkout execution when the flag is exactly true', async () => {
    const operations: string[] = [];
    let lookupCount = 0;
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
              data: {
                shop: {currencyCode: 'EUR'},
                nodes: [configuredVariant(), accessoryVariant()],
              },
            }),
            {status: 200, headers: {'Content-Type': 'application/json'}},
          );
        }
        if (request.query.includes('WandiniExistingDraftOrder')) {
          lookupCount += 1;
          operations.push('lookup');
          return new Response(
            JSON.stringify({data: {draftOrders: {nodes: []}}}),
            {status: 200, headers: {'Content-Type': 'application/json'}},
          );
        }
        if (request.query.includes('WandiniDraftOrderCreate')) {
          operations.push('create');
          return new Response(
            JSON.stringify({
              data: {
                draftOrderCreate: {
                  draftOrder: {
                    id: 'gid://shopify/DraftOrder/10',
                    invoiceUrl: 'https://example.myshopify.com/invoice/10',
                  },
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

    await expect(
      getOrCreateDraftOrderCheckout(cart(), checkoutEnv()),
    ).resolves.toEqual({
      draftOrderId: 'gid://shopify/DraftOrder/10',
      invoiceUrl: 'https://example.myshopify.com/invoice/10',
      reused: false,
    });
    expect(lookupCount).toBe(2);
    expect(operations).toEqual([
      'variant-pricing',
      'lookup',
      'create',
      'lookup',
    ]);
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
                customAttributes: prepared.input.customAttributes,
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

  it.each(['COMPLETED', 'INVOICE_SENT'] as const)(
    'does not reuse a %s Draft Order',
    async (status) => {
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
                    status,
                    invoiceUrl: 'https://example.myshopify.com/invoice/paid',
                    customAttributes: prepared.input.customAttributes,
                  },
                ],
              },
            } as T;
          }
          if (requestCount === 2) {
            return {
              draftOrderCreate: {
                draftOrder: {
                  id: 'gid://shopify/DraftOrder/new',
                  invoiceUrl: 'https://example.myshopify.com/invoice/new',
                },
                userErrors: [],
              },
            } as T;
          }
          return {draftOrders: {nodes: []}} as T;
        },
      };

      await expect(findOrCreateDraftOrder(prepared, client)).resolves.toEqual({
        draftOrderId: 'gid://shopify/DraftOrder/new',
        invoiceUrl: 'https://example.myshopify.com/invoice/new',
        reused: false,
      });
      expect(requestCount).toBe(3);
    },
  );

  it('does not reuse an exact OPEN Draft without a usable invoice URL', async () => {
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
                invoiceUrl: null,
                customAttributes: prepared.input.customAttributes,
              },
            ],
          },
        } as T;
      },
    };

    await expect(
      findOrCreateDraftOrder(prepared, client),
    ).rejects.toMatchObject({code: 'DRAFT_ORDER_ERROR'});
    expect(requestCount).toBe(1);
  });

  it('creates for a full-fingerprint mismatch and reconciles without updating a Draft', async () => {
    const prepared = await prepareDraftOrder(cart(), pricingClient());
    const operations: string[] = [];
    let requestCount = 0;
    const client = {
      request: async <T>(query: string) => {
        requestCount += 1;
        if (query.includes('WandiniExistingDraftOrder')) {
          operations.push('lookup');
          return {
            draftOrders: {
              nodes:
                requestCount === 1
                  ? [
                      {
                        id: 'gid://shopify/DraftOrder/1',
                        status: 'OPEN',
                        invoiceUrl:
                          'https://example.myshopify.com/invoice/stale',
                        customAttributes: [
                          {
                            key: 'wandini_checkout_fingerprint',
                            value: 'different-full-fingerprint',
                          },
                        ],
                      },
                    ]
                  : [],
            },
          } as T;
        }
        operations.push('create');
        return {
          draftOrderCreate: {
            draftOrder: {
              id: 'gid://shopify/DraftOrder/20',
              invoiceUrl: 'https://example.myshopify.com/invoice/20',
            },
            userErrors: [],
          },
        } as T;
      },
    };

    await expect(findOrCreateDraftOrder(prepared, client)).resolves.toEqual({
      draftOrderId: 'gid://shopify/DraftOrder/20',
      invoiceUrl: 'https://example.myshopify.com/invoice/20',
      reused: false,
    });
    expect(operations).toEqual(['lookup', 'create', 'lookup']);
    expect(operations).not.toContain('update');
  });

  it('selects one deterministic canonical Draft after a cross-worker create race', async () => {
    const prepared = await prepareDraftOrder(cart(), pricingClient());
    let requestCount = 0;
    const exactAttributes = prepared.input.customAttributes;
    const client = {
      request: async <T>() => {
        requestCount += 1;
        if (requestCount === 1) {
          return {draftOrders: {nodes: []}} as T;
        }
        if (requestCount === 2) {
          return {
            draftOrderCreate: {
              draftOrder: {
                id: 'gid://shopify/DraftOrder/20',
                invoiceUrl: 'https://example.myshopify.com/invoice/20',
              },
              userErrors: [],
            },
          } as T;
        }
        return {
          draftOrders: {
            nodes: [
              {
                id: 'gid://shopify/DraftOrder/20',
                status: 'OPEN',
                invoiceUrl: 'https://example.myshopify.com/invoice/20',
                customAttributes: exactAttributes,
              },
              {
                id: 'gid://shopify/DraftOrder/3',
                status: 'OPEN',
                invoiceUrl: 'https://example.myshopify.com/invoice/3',
                customAttributes: exactAttributes,
              },
              {
                id: 'gid://shopify/DraftOrder/1',
                status: 'OPEN',
                invoiceUrl: 'https://example.myshopify.com/invoice/mismatch',
                customAttributes: [
                  {
                    key: 'wandini_checkout_fingerprint',
                    value: 'different-full-fingerprint',
                  },
                ],
              },
              {
                id: 'gid://shopify/DraftOrder/2',
                status: 'COMPLETED',
                invoiceUrl: 'https://example.myshopify.com/invoice/completed',
                customAttributes: exactAttributes,
              },
              {
                id: 'gid://shopify/DraftOrder/0',
                status: 'OPEN',
                invoiceUrl: null,
                customAttributes: exactAttributes,
              },
            ],
          },
        } as T;
      },
    };

    await expect(findOrCreateDraftOrder(prepared, client)).resolves.toEqual({
      draftOrderId: 'gid://shopify/DraftOrder/3',
      invoiceUrl: 'https://example.myshopify.com/invoice/3',
      reused: true,
    });
    expect(requestCount).toBe(3);
  });
});

const expectedProof =
  '{"lines":[{"configurator_instance_id":"configuration-1","currency":"EUR","master_asset_id":"asset-1","output":{"height":2500,"unit":"mm","width":2000},"payload_sha256":"c607609acd8859a80406f95d819f61ead5c58da9bef5a801e8fe44a747bf4b73","price":"144.45","quantity":1,"sku":"20-140.1-3","variant_id":"1"}],"version":"1"}';
const expectedSignature =
  '759f540e1752986910dec719a8a1250267e251b11194eb86a84a15a67326d555';

function proofValue(
  prepared: Awaited<ReturnType<typeof prepareDraftOrder>>,
  key = 'wandini_checkout_proof',
) {
  return prepared.input.customAttributes.find(
    (attribute) => attribute.key === key,
  )!.value;
}

function parseProof(value: string) {
  return JSON.parse(value) as {
    lines: Array<{configurator_instance_id: string; price: string}>;
  };
}

describe('orchestrator checkout security proof', () => {
  it.each([false, true])(
    'matches the independent fixed vector (mixed: %s)',
    async (mixed) => {
      const value = cart();
      if (!mixed) value.lines.nodes = [value.lines.nodes[0]];
      const prepared = await prepareDraftOrder(value, pricingClient());
      expect(proofValue(prepared)).toBe(expectedProof);
      expect(proofValue(prepared, 'wandini_checkout_signature')).toBe(
        expectedSignature,
      );
      expect(
        prepared.input.customAttributes.filter(({key}) =>
          [
            'wandini_checkout_proof_version',
            'wandini_checkout_proof',
            'wandini_checkout_signature',
          ].includes(key),
        ),
      ).toEqual([
        {key: 'wandini_checkout_proof_version', value: '1'},
        {key: 'wandini_checkout_proof', value: expectedProof},
        {key: 'wandini_checkout_signature', value: expectedSignature},
      ]);
    },
  );

  it.each([undefined, '', ' \t\n '])(
    'blocks configured/mixed checkout for an absent or blank secret (%s)',
    async (secret) => {
      const operations = stubAdminApi({
        nodes: [configuredVariant(), accessoryVariant()],
      });
      for (const mixed of [false, true]) {
        const value = cart();
        if (!mixed) value.lines.nodes = [value.lines.nodes[0]];
        const env = checkoutEnv({WANDINI_CHECKOUT_HMAC_SECRET: secret});
        await expect(
          getOrCreateDraftOrderCheckout(value, env),
        ).rejects.toMatchObject({code: 'CONFIGURATION_ERROR'});
        await expect(
          getCartPricingEvaluation(value, env),
        ).rejects.toMatchObject({code: 'CONFIGURATION_ERROR'});
      }
      expect(
        operations.every((operation) => operation === 'variant-pricing'),
      ).toBe(true);
    },
  );

  it('keeps ordinary checkout native without a secret or proof', async () => {
    const value = cart();
    value.lines.nodes = [value.lines.nodes[1]];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getCartPricingEvaluation(
        value,
        checkoutEnv({WANDINI_CHECKOUT_HMAC_SECRET: undefined}),
      ),
    ).resolves.toEqual({checkoutMode: 'native', pricingQuote: null});
    expect(fetchMock).not.toHaveBeenCalled();
    const prepared = await prepareDraftOrderForCheckout(
      value,
      pricingClient(),
      {},
    );
    expect(
      prepared.input.customAttributes.some(
        ({key}) => key.includes('proof') || key.includes('signature'),
      ),
    ).toBe(false);
  });

  it.each([undefined, null, '', ' \t '])(
    'requires a nonempty Admin SKU (%s)',
    async (sku) => {
      await expect(
        prepareDraftOrder(cart(), pricingClient({sku})),
      ).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'});
    },
  );

  it('trims the authoritative SKU and ignores a forged client SKU', async () => {
    const value = cart();
    value.lines.nodes[0].attributes.push({key: 'sku', value: 'forged'});
    const prepared = await prepareDraftOrder(
      value,
      pricingClient({sku: ' 20-140.1-3 \t'}),
    );
    expect(proofValue(prepared)).toBe(expectedProof);
  });

  it('requests the Admin SKU and signs pre-discount prices during discounted calculation', async () => {
    stubAdminApi({
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
    const result = await getCartPricingEvaluation(cart(), checkoutEnv());
    expect(result.pricingQuote?.totalAmount.amount).toBe('151.61');
    const requests = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes('/graphql.json'))
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body)) as {
            query: string;
            variables: {input: unknown};
          },
      );
    expect(requests[0].query).toMatch(/price\s+sku/);
    expect(requests[1].variables.input).toMatchObject({
      acceptAutomaticDiscounts: true,
      allowDiscountCodesInCheckout: true,
      discountCodes: ['WAND10'],
      customAttributes: expect.arrayContaining([
        {key: 'wandini_checkout_proof', value: expectedProof},
      ]),
    });
    const noDiscount = cart();
    noDiscount.discountCodes = [];
    const plain = await prepareDraftOrder(noDiscount, pricingClient());
    const discounted = await prepareDraftOrder(cart(), pricingClient());
    expect(proofValue(plain)).toBe(proofValue(discounted));
    expect(plain.fingerprint).not.toBe(discounted.fingerprint);
  });

  it('sorts only proof lines by raw code-unit instance order', async () => {
    const value = cart();
    value.lines.nodes = ['a', 'Z', 'A', 'a_', 'a-'].map((id) => {
      const line = structuredClone(cart().lines.nodes[0]);
      line.id = id;
      line.attributes[1].value = id;
      return line;
    });
    const first = await prepareDraftOrder(value, pricingClient());
    const proof = parseProof(proofValue(first));
    expect(
      proof.lines.map(
        (line: {configurator_instance_id: string}) =>
          line.configurator_instance_id,
      ),
    ).toEqual(['A', 'Z', 'a', 'a-', 'a_']);
    value.lines.nodes.reverse();
    const second = await prepareDraftOrder(value, pricingClient());
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.input.customAttributes).toEqual(first.input.customAttributes);
  });

  it('hashes payload semantics while retaining the exact private payload text', async () => {
    const value = cart();
    const reformatted = JSON.stringify(
      {
        crop_ratio: {h: 1, w: 1, y: 0, x: 0},
        output: {height: 2500, width: 2000, unit: 'mm'},
        master_asset_id: 'asset-1',
        version: 1,
      },
      null,
      2,
    );
    value.lines.nodes[0].attributes[0].value = reformatted;
    const prepared = await prepareDraftOrder(value, pricingClient());
    expect(proofValue(prepared)).toBe(expectedProof);
    expect(proofValue(prepared, 'wandini_checkout_signature')).toBe(
      expectedSignature,
    );
    expect(prepared.input.lineItems[0].customAttributes).toContainEqual({
      key: '_configurator_payload',
      value: reformatted,
    });
  });

  it('signs 20.00 as 20 without changing the Draft priceOverride', async () => {
    const prepared = await prepareDraftOrder(
      cart(),
      pricingClient({price: '4.00'}),
    );
    expect(prepared.input.lineItems[0].priceOverride?.amount).toBe('20.00');
    expect(parseProof(proofValue(prepared)).lines[0].price).toBe('20');
  });

  it('excludes injected server-owned attributes at both cart and line levels', async () => {
    const value = cart();
    const keys = [
      'wandini_checkout_fingerprint',
      'wandini_cart_id',
      'wandini_checkout_proof_version',
      'wandini_checkout_proof',
      'wandini_checkout_signature',
      '_configurator_payload',
      '_configurator_instance_id',
    ];
    value.attributes = keys.flatMap((key) => [
      {key, value: 'forged'},
      {key, value: 'duplicate'},
    ]);
    for (const line of value.lines.nodes)
      line.attributes.push(...value.attributes);
    const prepared = await prepareDraftOrder(value, pricingClient());
    const clean = await prepareDraftOrder(cart(), pricingClient());
    expect(prepared).toEqual(clean);
    for (const key of keys.slice(0, 5)) {
      expect(
        prepared.input.customAttributes.filter(
          (attribute) => attribute.key === key,
        ),
      ).toHaveLength(1);
    }
    expect(prepared.input.lineItems[0].customAttributes).toEqual([
      {key: '_configurator_payload', value: payload},
      {key: '_configurator_instance_id', value: 'configuration-1'},
    ]);
  });

  it('uses exact UTF-8 secret bytes, including surrounding whitespace', async () => {
    const secret = ' \tsecret-\u00e9\n';
    const prepared = await prepareDraftOrderForCheckout(
      cart(),
      pricingClient(),
      checkoutEnv({WANDINI_CHECKOUT_HMAC_SECRET: secret}),
    );
    // Independent Node crypto is test-only; runtime implementation uses Web Crypto.
    expect(proofValue(prepared, 'wandini_checkout_signature')).toBe(
      createHmac('sha256', secret).update(expectedProof, 'utf8').digest('hex'),
    );
    const trimmed = await prepareDraftOrderForCheckout(
      cart(),
      pricingClient(),
      checkoutEnv({WANDINI_CHECKOUT_HMAC_SECRET: secret.trim()}),
    );
    expect(prepared.fingerprint).not.toBe(trimmed.fingerprint);
  });

  it('changes identity for changed authoritative SKU', async () => {
    const first = await prepareDraftOrder(cart(), pricingClient());
    const changed = await prepareDraftOrder(
      cart(),
      pricingClient({sku: 'new-sku'}),
    );
    expect(first.fingerprint).not.toBe(changed.fingerprint);
  });

  it.each(['unsigned', 'other-secret', 'altered-proof', 'duplicate-signature'])(
    'never reuses an OPEN Draft with %s security',
    async (kind) => {
      const prepared = await prepareDraftOrder(cart(), pricingClient());
      const previous = await prepareDraftOrderForCheckout(
        cart(),
        pricingClient(),
        checkoutEnv({WANDINI_CHECKOUT_HMAC_SECRET: 'previous-secret'}),
      );
      expect(previous.fingerprint).not.toBe(prepared.fingerprint);
      let attributes = structuredClone(prepared.input.customAttributes);
      if (kind === 'unsigned')
        attributes = attributes.filter(
          ({key}) => !key.includes('proof') && !key.includes('signature'),
        );
      if (kind === 'other-secret') attributes = previous.input.customAttributes;
      if (kind === 'altered-proof')
        attributes.find(({key}) => key === 'wandini_checkout_proof')!.value =
          '{}';
      if (kind === 'duplicate-signature')
        attributes.push({key: 'wandini_checkout_signature', value: 'forged'});
      const operations: string[] = [];
      const client: AdminClient = {
        async request<T>(query: string) {
          if (query.includes('WandiniExistingDraftOrder')) {
            operations.push('lookup');
            return {
              draftOrders: {
                nodes: [
                  {
                    id: 'gid://shopify/DraftOrder/1',
                    status: 'OPEN',
                    invoiceUrl: 'https://example.myshopify.com/invoice/old',
                    customAttributes: attributes,
                  },
                ],
              },
            } as T;
          }
          operations.push('create');
          expect(query).toContain('WandiniDraftOrderCreate');
          return {
            draftOrderCreate: {
              draftOrder: {
                id: 'gid://shopify/DraftOrder/2',
                invoiceUrl: 'https://example.myshopify.com/invoice/new',
              },
              userErrors: [],
            },
          } as T;
        },
      };
      await expect(
        findOrCreateDraftOrder(prepared, client),
      ).resolves.toMatchObject({
        draftOrderId: 'gid://shopify/DraftOrder/2',
        reused: false,
      });
      expect(operations).toEqual(['lookup', 'create', 'lookup']);
    },
  );

  it('permits 100 configured lines and rejects 101 before any Draft request', async () => {
    const value = cart();
    value.lines.nodes = Array.from({length: 101}, (_, index) => {
      const line = structuredClone(cart().lines.nodes[0]);
      line.id = String(index);
      line.attributes[1].value = 'configuration-' + index;
      return line;
    });
    const operations = stubAdminApi({nodes: [configuredVariant()]});
    await expect(
      getOrCreateDraftOrderCheckout(value, checkoutEnv()),
    ).rejects.toMatchObject({code: 'INVALID_CART'});
    expect(operations).toEqual(['variant-pricing']);
    value.lines.nodes.pop();
    expect(
      parseProof(proofValue(await prepareDraftOrder(value, pricingClient())))
        .lines,
    ).toHaveLength(100);
  });

  it('enforces the proof size limit in UTF-8 bytes at the exact boundary', async () => {
    const base = await prepareDraftOrder(cart(), pricingClient());
    const overhead =
      new TextEncoder().encode(proofValue(base)).byteLength -
      '20-140.1-3'.length;
    const maxSku = 'x'.repeat(65_536 - overhead);
    const atLimit = await prepareDraftOrder(
      cart(),
      pricingClient({sku: maxSku}),
    );
    expect(new TextEncoder().encode(proofValue(atLimit)).byteLength).toBe(
      65_536,
    );
    const operations = stubAdminApi({
      nodes: [configuredVariant({sku: maxSku + '\u00e9'}), accessoryVariant()],
    });
    await expect(
      getOrCreateDraftOrderCheckout(cart(), checkoutEnv()),
    ).rejects.toMatchObject({code: 'INVALID_CART'});
    expect(operations).toEqual(['variant-pricing']);
  });
});

describe('checkout proof canonicalization', () => {
  it('sorts nested keys using code units and preserves array order', () => {
    expect(
      canonicalCheckoutProofJson({
        a: 1,
        Z: {b: 2, A: true},
        list: [2, null, 'x', false, -0],
      }),
    ).toBe('{"Z":{"A":true,"b":2},"a":1,"list":[2,null,"x",false,0]}');
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol('x'),
    () => 1,
    new Date(),
    {a: undefined},
    new Array<unknown>(2),
  ])('rejects unsupported or non-finite values (%s)', (value) => {
    expect(() => canonicalCheckoutProofJson(value)).toThrow(
      DynamicPricingError,
    );
  });

  it('accepts depth 32 and rejects depth 33 and cycles', () => {
    let nested: unknown = null;
    for (let i = 0; i < 32; i++) nested = {x: nested};
    expect(() => canonicalCheckoutProofJson(nested)).not.toThrow();
    expect(() => canonicalCheckoutProofJson({x: nested})).toThrow(
      DynamicPricingError,
    );
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalCheckoutProofJson(cycle)).toThrow(
      DynamicPricingError,
    );
  });

  it.each([
    ['144.45', '144.45'],
    ['20.00', '20'],
    ['123.40', '123.4'],
    ['0.00', '0'],
    ['100', '100'],
    ['999999999999999999999.0100', '999999999999999999999.01'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(canonicalCheckoutProofMoney(input)).toBe(expected);
  });

  it.each([
    '-1',
    '-0',
    '1e2',
    '01',
    '01.5',
    '.5',
    '1.',
    '+1',
    ' 1',
    '1 ',
    '',
    'NaN',
  ])('rejects noncanonical money syntax %s', (input) => {
    expect(() => canonicalCheckoutProofMoney(input)).toThrow(
      DynamicPricingError,
    );
  });
});
