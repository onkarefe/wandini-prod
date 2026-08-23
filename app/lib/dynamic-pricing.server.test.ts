import {afterEach, describe, expect, it, vi} from 'vitest';
import {createCheckoutProof} from '~/lib/checkout-proof.server';
import {
  DynamicPricingError,
  findOrCreateDraftOrder,
  getCartPricingEvaluation,
  getOrCreateDraftOrderCheckout,
  prepareDraftOrder as prepareDraftOrderForCheckout,
  validateCartLineInputsForAdd,
  validateCartLineInputsForUpdate,
  type AdminClient,
  type DynamicPricingCart,
} from '~/lib/dynamic-pricing.server';

const CHECKOUT_GUARD_SECRET = 'wandini-checkpoint-4a-fixture-secret-2026';

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

function prepareDraftOrder(
  cartValue: DynamicPricingCart,
  client: AdminClient,
  checkoutGuardSecret: string | undefined = CHECKOUT_GUARD_SECRET,
) {
  return prepareDraftOrderForCheckout(cartValue, client, checkoutGuardSecret);
}

function checkoutEnv(
  overrides: Partial<Env> = {},
): Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'SHOPIFY_SHOP'
  | 'SHOPIFY_PRICING_CLIENT_ID'
  | 'SHOPIFY_PRICING_CLIENT_SECRET'
  | 'SHOPIFY_CHECKOUT_GUARD_SECRET'
  | 'DYNAMIC_PRICING_CHECKOUT_ENABLED'
> {
  return {
    PUBLIC_STORE_DOMAIN: 'checkout-test.myshopify.com',
    SHOPIFY_SHOP: 'checkout-test.myshopify.com',
    SHOPIFY_PRICING_CLIENT_ID: 'checkout-test-client',
    SHOPIFY_PRICING_CLIENT_SECRET: 'secret',
    SHOPIFY_CHECKOUT_GUARD_SECRET: CHECKOUT_GUARD_SECRET,
    DYNAMIC_PRICING_CHECKOUT_ENABLED: 'true',
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
    expect(prepared.input).not.toHaveProperty('visibleToCustomer');
    const configuredProof = prepared.input.lineItems[0].customAttributes?.find(
      ({key}) => key === '_wandini_checkout_proof',
    )?.value;
    expect(configuredProof).toMatch(
      /^v1\.[^.]+\.[^.]+\.[^.]+\.1\.14445\.EUR\.[^.]+$/,
    );
    expect(prepared.input.lineItems[1].customAttributes).toBeUndefined();
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
    expect(
      retry.input.lineItems[0].customAttributes?.find(
        ({key}) => key === '_wandini_checkout_proof',
      )?.value,
    ).toBe(
      first.input.lineItems[0].customAttributes?.find(
        ({key}) => key === '_wandini_checkout_proof',
      )?.value,
    );
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changedBuyerDraft.fingerprint).not.toBe(first.fingerprint);
  });

  it('preserves and hashes the exact original payload while replacing a client proof', async () => {
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
      {key: '_wandini_checkout_proof', value: 'client-forgery'},
    ];

    const prepared = await prepareDraftOrder(configuredCart, pricingClient());
    const attributes = prepared.input.lineItems[0].customAttributes ?? [];
    const proofAttributes = attributes.filter(
      ({key}) => key === '_wandini_checkout_proof',
    );
    const expected = await createCheckoutProof(
      {
        variantId: 'gid://shopify/ProductVariant/1',
        instanceId: 'configuration-1',
        payload: exactPayload,
        quantity: 1,
        amount: '144.45',
        currencyCode: 'EUR',
      },
      CHECKOUT_GUARD_SECRET,
    );

    expect(attributes).toEqual(
      expect.arrayContaining([
        {key: 'configurator_payload', value: exactPayload},
        {key: 'configurator_instance_id', value: 'configuration-1'},
        {key: 'finish', value: 'matte'},
      ]),
    );
    expect(proofAttributes).toEqual([
      {key: '_wandini_checkout_proof', value: expected.proof},
    ]);
    expect(proofAttributes[0].value).not.toBe('client-forgery');
  });

  it('includes the generated proof in fingerprint and reuse identity', async () => {
    const first = await prepareDraftOrder(
      cart(),
      pricingClient(),
      CHECKOUT_GUARD_SECRET,
    );
    const changedSecret = await prepareDraftOrder(
      cart(),
      pricingClient(),
      'wandini-checkpoint-4b-different-fixture-secret',
    );

    expect(changedSecret.fingerprint).not.toBe(first.fingerprint);
    expect(
      changedSecret.input.lineItems[0].customAttributes?.find(
        ({key}) => key === '_wandini_checkout_proof',
      )?.value,
    ).not.toBe(
      first.input.lineItems[0].customAttributes?.find(
        ({key}) => key === '_wandini_checkout_proof',
      )?.value,
    );
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace', ' '.repeat(32)],
    ['too short', 'x'.repeat(31)],
    ['too long', 'x'.repeat(129)],
    ['malformed', `${'x'.repeat(32)}\n`],
  ] as Array<[string, string | undefined]>)(
    'fails closed for a %s checkout proof secret',
    async (_label, secret) => {
      await expect(
        prepareDraftOrderForCheckout(cart(), pricingClient(), secret),
      ).rejects.toMatchObject({code: 'CONFIGURATION_ERROR'});
    },
  );

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
            ({key}) => key === 'configurator_instance_id',
          )?.value,
      ),
    ).toEqual(['configuration-1', 'configuration-2']);
    const proofs = prepared.input.lineItems.map(
      (line) =>
        line.customAttributes?.find(
          ({key}) => key === '_wandini_checkout_proof',
        )?.value,
    );
    expect(proofs.every(Boolean)).toBe(true);
    expect(proofs[0]).not.toBe(proofs[1]);
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
    ordinaryOnly.lines.nodes[0].attributes = [
      {key: '_wandini_checkout_proof', value: 'client-forgery'},
    ];
    const prepared = await prepareDraftOrderForCheckout(
      ordinaryOnly,
      pricingClient(),
      undefined,
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
        SHOPIFY_CHECKOUT_GUARD_SECRET: CHECKOUT_GUARD_SECRET,
        DYNAMIC_PRICING_CHECKOUT_ENABLED: 'true',
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
    const exactAttributes = [
      {
        key: 'wandini_checkout_fingerprint',
        value: prepared.fingerprint,
      },
    ];
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
