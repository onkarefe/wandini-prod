import {
  CONFIGURATOR_INSTANCE_ATTRIBUTE,
  CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  calculateConfiguredWallpaperPrice,
  parseConfiguratorPayload,
  resolveConfiguratorPricePerM2,
  type ConfiguredMoney,
} from '~/lib/configurator-pricing';

const ADMIN_API_VERSION = '2026-07';
const ADMIN_REQUEST_TIMEOUT_MS = 15_000;
const CHECKOUT_FINGERPRINT_ATTRIBUTE = 'wandini_checkout_fingerprint';
const CHECKOUT_CART_ATTRIBUTE = 'wandini_cart_id';
const CHECKOUT_TAG = 'wandini-dynamic-pricing';

type DynamicPricingEnv = Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'SHOPIFY_SHOP'
  | 'SHOPIFY_PRICING_CLIENT_ID'
  | 'SHOPIFY_PRICING_CLIENT_SECRET'
>;

type CartAttribute = {key: string; value?: string | null};

export type DynamicPricingCartLine = {
  id: string;
  quantity: number;
  attributes: CartAttribute[];
  merchandise: {
    id: string;
    availableForSale?: boolean;
    price?: ConfiguredMoney | null;
  };
};

export type DynamicPricingCart = {
  id: string;
  updatedAt?: string;
  note?: string | null;
  attributes?: CartAttribute[];
  lines: {nodes: DynamicPricingCartLine[]};
  discountCodes?: Array<{code: string; applicable: boolean}>;
  appliedGiftCards?: Array<{id: string}>;
  buyerIdentity?: {
    countryCode?: string | null;
    email?: string | null;
    phone?: string | null;
    customer?: {id: string} | null;
  } | null;
};

export type DynamicPricingCartLineInput = {
  merchandiseId: string;
  quantity?: number | null;
  attributes?: CartAttribute[] | null;
};

type AdminVariant = {
  __typename: 'ProductVariant';
  id: string;
  availableForSale: boolean;
  product: {
    id: string;
    masterAssetId: {value: string} | null;
  };
  printQuality: {
    reference: {
      __typename: 'Metaobject';
      id: string;
      pricePerM2: {value: string} | null;
      minWidthCm: {value: string} | null;
      maxWidthCm: {value: string} | null;
      minHeightCm: {value: string} | null;
      maxHeightCm: {value: string} | null;
    } | null;
  } | null;
};

export type DraftOrderLineInput = {
  variantId: string;
  quantity: number;
  customAttributes?: Array<{key: string; value: string}>;
  priceOverride?: ConfiguredMoney;
};

export type DraftOrderInput = {
  lineItems: DraftOrderLineInput[];
  customAttributes: Array<{key: string; value: string}>;
  tags: string[];
  note?: string;
  email?: string;
  phone?: string;
  presentmentCurrencyCode: string;
  purchasingEntity?: {customerId: string};
  discountCodes?: string[];
  acceptAutomaticDiscounts: true;
  allowDiscountCodesInCheckout: true;
  visibleToCustomer: true;
  sessionToken: string;
  useCustomerDefaultAddress?: true;
};

export type PreparedDraftOrder = {
  input: DraftOrderInput;
  fingerprint: string;
  fingerprintTag: string;
  configuredLineCount: number;
};

export type DraftOrderPricingQuote = {
  subtotalAmount: ConfiguredMoney;
  totalAmount: ConfiguredMoney;
  discountCodes: string[];
};

export type CartPricingEvaluation = {
  checkoutMode: 'native' | 'draft';
  pricingQuote: DraftOrderPricingQuote | null;
};

export type DraftOrderCheckout = {
  draftOrderId: string;
  invoiceUrl: string;
  reused: boolean;
};

type AdminAccessToken = {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

type AdminGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{message: string; extensions?: {code?: string}}>;
};

export type AdminClient = {
  request<T>(query: string, variables: Record<string, unknown>): Promise<T>;
};

export type DynamicPricingErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'SHOPIFY_API_ERROR'
  | 'INVALID_CART'
  | 'INVALID_CONFIGURATION'
  | 'PRICING_UNAVAILABLE'
  | 'CURRENCY_MISMATCH'
  | 'DRAFT_ORDER_ERROR';

export class DynamicPricingError extends Error {
  code: DynamicPricingErrorCode;
  retryable: boolean;

  constructor(
    code: DynamicPricingErrorCode,
    message: string,
    options?: {cause?: unknown; retryable?: boolean},
  ) {
    super(message, {cause: options?.cause});
    this.name = 'DynamicPricingError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

let cachedAdminAccessToken: AdminAccessToken | null = null;
const pendingCheckouts = new Map<string, Promise<DraftOrderCheckout>>();

export async function getCartPricingEvaluation(
  cart: DynamicPricingCart,
  env: DynamicPricingEnv,
): Promise<CartPricingEvaluation> {
  const client = createAdminClient(env);
  const prepared = await prepareDraftOrder(cart, client);
  if (prepared.configuredLineCount === 0) {
    return {checkoutMode: 'native', pricingQuote: null};
  }

  const result = await client.request<DraftOrderCalculateResponse>(
    DRAFT_ORDER_CALCULATE_MUTATION,
    {input: prepared.input},
  );
  const errors = result.draftOrderCalculate.userErrors;
  const calculated = result.draftOrderCalculate.calculatedDraftOrder;

  if (errors.length || !calculated) {
    throw new DynamicPricingError(
      'DRAFT_ORDER_ERROR',
      errors[0]?.message ?? 'Shopify could not calculate the configured cart.',
      {retryable: true},
    );
  }

  return {
    checkoutMode: 'draft',
    pricingQuote: {
      subtotalAmount: calculated.subtotalPriceSet.presentmentMoney,
      totalAmount: calculated.totalPriceSet.presentmentMoney,
      discountCodes: calculated.discountCodes,
    },
  };
}

export async function validateCartLineInputsForAdd(
  lines: DynamicPricingCartLineInput[],
  env: DynamicPricingEnv,
) {
  if (!lines.length) {
    throw new DynamicPricingError('INVALID_CART', 'No cart lines were provided.');
  }

  const normalizedLines: DynamicPricingCartLine[] = lines.map((line, index) => {
    const quantity = line.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new DynamicPricingError('INVALID_CART', 'A cart quantity is invalid.');
    }
    return {
      id: `pending-${index}`,
      quantity,
      attributes: line.attributes ?? [],
      merchandise: {id: line.merchandiseId},
    };
  });
  const client = createAdminClient(env);
  const variants = await getAdminVariants(normalizedLines, client);

  for (const line of normalizedLines) {
    const variant = getAvailableAdminVariant(line, variants);
    validateLineConfiguration(line, variant);
  }
}

export async function getOrCreateDraftOrderCheckout(
  cart: DynamicPricingCart,
  env: DynamicPricingEnv,
): Promise<DraftOrderCheckout> {
  const client = createAdminClient(env);
  const prepared = await prepareDraftOrder(cart, client);
  if (prepared.configuredLineCount === 0) {
    throw new DynamicPricingError(
      'INVALID_CART',
      'The cart does not contain a configurable wallpaper.',
    );
  }
  const existingPending = pendingCheckouts.get(prepared.fingerprint);
  if (existingPending) return existingPending;

  const operation = findOrCreateDraftOrder(prepared, client);
  pendingCheckouts.set(prepared.fingerprint, operation);

  try {
    return await operation;
  } finally {
    pendingCheckouts.delete(prepared.fingerprint);
  }
}

export async function prepareDraftOrder(
  cart: DynamicPricingCart,
  client: AdminClient,
): Promise<PreparedDraftOrder> {
  if (!cart.id || cart.lines.nodes.length === 0) {
    throw new DynamicPricingError('INVALID_CART', 'The cart is empty.');
  }

  const pricingData = await getAdminVariantPricing(cart.lines.nodes, client);
  const shopCurrency = pricingData.shop.currencyCode.toUpperCase();
  const variants = new Map(
    pricingData.nodes
      .filter((node): node is AdminVariant => node?.__typename === 'ProductVariant')
      .map((variant) => [variant.id, variant]),
  );
  let configuredLineCount = 0;

  const lineItems = cart.lines.nodes.map((line) => {
    const variant = getAvailableAdminVariant(line, variants);
    if (isTrustedConfigurableVariant(variant)) configuredLineCount += 1;
    return mapCartLineToDraftOrderLine(line, variants, shopCurrency);
  });
  const discountCodes = [
    ...new Set(
      (cart.discountCodes ?? [])
        .map((discount) => discount.code.trim())
        .filter(Boolean),
    ),
  ];
  const copiedCartAttributes = (cart.attributes ?? [])
    .filter(hasStringValue)
    .map(({key, value}) => ({key, value}));
  const fingerprintSource = canonicalJson({
    cartId: cart.id,
    lineItems,
    discountCodes,
    cartAttributes: copiedCartAttributes,
    note: cart.note ?? null,
    buyerCountry: cart.buyerIdentity?.countryCode ?? null,
    buyerCustomerId: cart.buyerIdentity?.customer?.id ?? null,
    buyerEmail: cart.buyerIdentity?.email ?? null,
    buyerPhone: cart.buyerIdentity?.phone ?? null,
  });
  const fingerprint = await sha256(fingerprintSource);
  const fingerprintTag = `wandini-checkout-${fingerprint.slice(0, 20)}`;
  const customAttributes = [
    {key: CHECKOUT_FINGERPRINT_ATTRIBUTE, value: fingerprint},
    {key: CHECKOUT_CART_ATTRIBUTE, value: cart.id},
    ...copiedCartAttributes,
  ];

  const input: DraftOrderInput = {
    lineItems,
    customAttributes,
    tags: [CHECKOUT_TAG, fingerprintTag],
    presentmentCurrencyCode: shopCurrency,
    sessionToken: fingerprint,
    acceptAutomaticDiscounts: true,
    allowDiscountCodesInCheckout: true,
    visibleToCustomer: true,
    ...(cart.note ? {note: cart.note} : {}),
    ...(cart.buyerIdentity?.email ? {email: cart.buyerIdentity.email} : {}),
    ...(cart.buyerIdentity?.phone ? {phone: cart.buyerIdentity.phone} : {}),
    ...(cart.buyerIdentity?.customer?.id
      ? {
          purchasingEntity: {customerId: cart.buyerIdentity.customer.id},
          useCustomerDefaultAddress: true as const,
        }
      : {}),
    ...(discountCodes.length ? {discountCodes} : {}),
  };

  return {
    input,
    fingerprint,
    fingerprintTag,
    configuredLineCount,
  };
}

export function mapCartLineToDraftOrderLine(
  line: DynamicPricingCartLine,
  variants: Map<string, AdminVariant>,
  shopCurrency: string,
): DraftOrderLineInput {
  const variantId = getVariantId(line);
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
    throw new DynamicPricingError('INVALID_CART', 'A cart quantity is invalid.');
  }

  const customAttributes = line.attributes
    .filter(hasStringValue)
    .map(({key, value}) => ({key, value}));
  const payloadAttribute = line.attributes.find(
    ({key}) => key === CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  );
  const variant = getAvailableAdminVariant(line, variants);
  const isConfigurable = isTrustedConfigurableVariant(variant);

  if (!isConfigurable) {
    if (payloadAttribute) {
      throw new DynamicPricingError(
        'INVALID_CONFIGURATION',
        'A non-configurable product cannot contain wallpaper configuration.',
      );
    }
    return {
      variantId,
      quantity: line.quantity,
      ...(customAttributes.length ? {customAttributes} : {}),
    };
  }

  if (!payloadAttribute) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The configurable wallpaper is missing its configuration.',
    );
  }

  const payload = validateLineConfiguration(line, variant);
  if (!payload) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The configurable wallpaper is missing its configuration.',
    );
  }

  const lineCurrency = line.merchandise.price?.currencyCode?.toUpperCase();
  if (!lineCurrency || lineCurrency !== shopCurrency) {
    throw new DynamicPricingError(
      'CURRENCY_MISMATCH',
      'Configured pricing is unavailable in the current cart currency.',
    );
  }

  const pricePerM2 = resolveConfiguratorPricePerM2(
    variant.printQuality?.reference?.pricePerM2?.value,
    null,
  );
  if (!pricePerM2) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'The selected wallpaper material has no valid price.',
    );
  }

  const priceOverride = calculateConfiguredWallpaperPrice({
    pricePerM2,
    widthMm: payload.output.width,
    heightMm: payload.output.height,
    currencyCode: shopCurrency,
  });
  if (!priceOverride) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'The configured wallpaper price could not be calculated.',
    );
  }

  return {variantId, quantity: 1, priceOverride, customAttributes};
}

function validateLineConfiguration(
  line: DynamicPricingCartLine,
  variant: AdminVariant,
) {
  const payloadAttribute = line.attributes.find(
    ({key}) => key === CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  );

  if (!isTrustedConfigurableVariant(variant)) {
    if (payloadAttribute) {
      throw new DynamicPricingError(
        'INVALID_CONFIGURATION',
        'A non-configurable product cannot contain wallpaper configuration.',
      );
    }
    return null;
  }

  if (!payloadAttribute) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The configurable wallpaper is missing its configuration.',
    );
  }

  if (line.quantity !== 1) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'Configured wallpaper quantity must be one.',
    );
  }

  const instanceId = line.attributes.find(
    ({key}) => key === CONFIGURATOR_INSTANCE_ATTRIBUTE,
  )?.value;
  if (!instanceId || instanceId.length > 100) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'Configured wallpaper identity is missing.',
    );
  }

  const payload = parseConfiguratorPayload(payloadAttribute.value);
  if (!payload) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The wallpaper configuration is malformed.',
    );
  }

  const authoritativeAssetId = variant.product.masterAssetId?.value?.trim();
  if (!authoritativeAssetId || authoritativeAssetId !== payload.master_asset_id) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The wallpaper artwork does not match the selected variant.',
    );
  }

  validateMaterialDimensions(payload.output.width, payload.output.height, variant);
  if (
    !resolveConfiguratorPricePerM2(
      variant.printQuality?.reference?.pricePerM2?.value,
      null,
    )
  ) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'The selected wallpaper material has no valid price.',
    );
  }
  return payload;
}

export async function findOrCreateDraftOrder(
  prepared: PreparedDraftOrder,
  client: AdminClient,
): Promise<DraftOrderCheckout> {
  const existing = await client.request<ExistingDraftOrdersResponse>(
    EXISTING_DRAFT_ORDER_QUERY,
    {query: `status:OPEN tag:${prepared.fingerprintTag}`},
  );
  const matchingDraft = existing.draftOrders.nodes.find((draftOrder) => {
    const fingerprint = draftOrder.customAttributes.find(
      ({key}) => key === CHECKOUT_FINGERPRINT_ATTRIBUTE,
    )?.value;
    return (
      draftOrder.status === 'OPEN' && fingerprint === prepared.fingerprint
    );
  });

  if (matchingDraft?.invoiceUrl) {
    return {
      draftOrderId: matchingDraft.id,
      invoiceUrl: matchingDraft.invoiceUrl,
      reused: true,
    };
  }
  if (matchingDraft) {
    throw new DynamicPricingError(
      'DRAFT_ORDER_ERROR',
      'The existing checkout no longer has an invoice URL.',
    );
  }

  const result = await client.request<DraftOrderCreateResponse>(
    DRAFT_ORDER_CREATE_MUTATION,
    {input: prepared.input},
  );
  const errors = result.draftOrderCreate.userErrors;
  const draftOrder = result.draftOrderCreate.draftOrder;

  if (errors.length || !draftOrder) {
    throw new DynamicPricingError(
      'DRAFT_ORDER_ERROR',
      errors[0]?.message ?? 'Shopify did not create a Draft Order.',
      {retryable: true},
    );
  }
  if (!draftOrder.invoiceUrl) {
    throw new DynamicPricingError(
      'DRAFT_ORDER_ERROR',
      'The Draft Order does not have a checkout URL.',
      {retryable: true},
    );
  }

  return {
    draftOrderId: draftOrder.id,
    invoiceUrl: draftOrder.invoiceUrl,
    reused: false,
  };
}

function validateMaterialDimensions(
  widthMm: number,
  heightMm: number,
  variant: AdminVariant,
) {
  const material = variant.printQuality?.reference;
  if (!material) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'The selected variant has no print-quality configuration.',
    );
  }

  const widthCm = widthMm / 10;
  const heightCm = heightMm / 10;
  const limits = {
    minWidth: parseOptionalPositiveNumber(material.minWidthCm?.value),
    maxWidth: parseOptionalPositiveNumber(material.maxWidthCm?.value),
    minHeight: parseOptionalPositiveNumber(material.minHeightCm?.value),
    maxHeight: parseOptionalPositiveNumber(material.maxHeightCm?.value),
  };

  if (
    (limits.minWidth !== null && widthCm < limits.minWidth) ||
    (limits.maxWidth !== null && widthCm > limits.maxWidth) ||
    (limits.minHeight !== null && heightCm < limits.minHeight) ||
    (limits.maxHeight !== null && heightCm > limits.maxHeight)
  ) {
    throw new DynamicPricingError(
      'INVALID_CONFIGURATION',
      'The configured dimensions are outside the selected material limits.',
    );
  }
}

function parseOptionalPositiveNumber(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'A material dimension constraint is invalid.',
    );
  }
  return parsed;
}

async function getAdminVariantPricing(
  lines: DynamicPricingCartLine[],
  client: AdminClient,
) {
  const variantIds = [...new Set(lines.map(getVariantId))];
  return client.request<VariantPricingResponse>(VARIANT_PRICING_QUERY, {
    ids: variantIds,
  });
}

async function getAdminVariants(
  lines: DynamicPricingCartLine[],
  client: AdminClient,
) {
  const pricingData = await getAdminVariantPricing(lines, client);
  return new Map(
    pricingData.nodes
      .filter((node): node is AdminVariant => node?.__typename === 'ProductVariant')
      .map((variant) => [variant.id, variant]),
  );
}

function getAvailableAdminVariant(
  line: DynamicPricingCartLine,
  variants: Map<string, AdminVariant>,
) {
  const variant = variants.get(getVariantId(line));
  if (!variant || !variant.availableForSale) {
    throw new DynamicPricingError(
      'PRICING_UNAVAILABLE',
      'A selected product variant is no longer available.',
    );
  }
  return variant;
}

function isTrustedConfigurableVariant(variant: AdminVariant) {
  return Boolean(
    variant.product.masterAssetId?.value?.trim() ||
      variant.printQuality?.reference?.__typename === 'Metaobject',
  );
}

function getVariantId(line: DynamicPricingCartLine) {
  const variantId = line.merchandise.id;
  if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId)) {
    throw new DynamicPricingError('INVALID_CART', 'A cart variant is invalid.');
  }
  return variantId;
}

function hasStringValue(
  attribute: CartAttribute,
): attribute is {key: string; value: string} {
  return Boolean(attribute.key && typeof attribute.value === 'string');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createAdminClient(env: DynamicPricingEnv): AdminClient {
  return {
    async request<T>(query: string, variables: Record<string, unknown>) {
      const config = getPricingConfig(env);
      let token = await getAdminAccessToken(config);
      let response = await fetchAdminGraphql(config.shop, token, query, variables);

      if (response.status === 401) {
        cachedAdminAccessToken = null;
        token = await getAdminAccessToken(config);
        response = await fetchAdminGraphql(config.shop, token, query, variables);
      }

      let body: AdminGraphqlResponse<T>;
      try {
        body = (await response.json()) as AdminGraphqlResponse<T>;
      } catch (cause) {
        throw new DynamicPricingError(
          'SHOPIFY_API_ERROR',
          'Shopify returned an unreadable Admin API response.',
          {cause, retryable: response.status >= 500},
        );
      }

      if (!response.ok || body.errors?.length || !body.data) {
        throw new DynamicPricingError(
          response.status === 401
            ? 'AUTHENTICATION_ERROR'
            : 'SHOPIFY_API_ERROR',
          body.errors?.[0]?.message ??
            `Shopify Admin API failed with status ${response.status}.`,
          {retryable: response.status === 429 || response.status >= 500},
        );
      }

      return body.data;
    },
  };
}

function getPricingConfig(env: DynamicPricingEnv) {
  const shopValue = env.SHOPIFY_SHOP ?? env.PUBLIC_STORE_DOMAIN;
  const clientId = env.SHOPIFY_PRICING_CLIENT_ID;
  const clientSecret = env.SHOPIFY_PRICING_CLIENT_SECRET;
  if (!shopValue || !clientId || !clientSecret) {
    throw new DynamicPricingError(
      'CONFIGURATION_ERROR',
      'Dynamic Pricing credentials are not configured.',
    );
  }

  const candidate = shopValue.includes('://') ? shopValue : `https://${shopValue}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch (cause) {
    throw new DynamicPricingError(
      'CONFIGURATION_ERROR',
      'The Shopify shop domain is invalid.',
      {cause},
    );
  }
  if (!hostname.endsWith('.myshopify.com')) {
    throw new DynamicPricingError(
      'CONFIGURATION_ERROR',
      'Dynamic Pricing requires a myshopify.com shop domain.',
    );
  }

  return {shop: hostname, clientId, clientSecret};
}

async function getAdminAccessToken(config: {
  shop: string;
  clientId: string;
  clientSecret: string;
}) {
  const cacheKey = `${config.shop}:${config.clientId}`;
  if (
    cachedAdminAccessToken?.cacheKey === cacheKey &&
    Date.now() < cachedAdminAccessToken.expiresAt - 60_000
  ) {
    return cachedAdminAccessToken.accessToken;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://${config.shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      },
    );
  } catch (cause) {
    throw new DynamicPricingError(
      'AUTHENTICATION_ERROR',
      'Dynamic Pricing authentication failed.',
      {cause, retryable: true},
    );
  }

  if (!response.ok) {
    throw new DynamicPricingError(
      'AUTHENTICATION_ERROR',
      `Dynamic Pricing authentication failed with status ${response.status}.`,
      {retryable: response.status === 429 || response.status >= 500},
    );
  }

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new DynamicPricingError(
      'AUTHENTICATION_ERROR',
      'Dynamic Pricing authentication returned no access token.',
    );
  }

  cachedAdminAccessToken = {
    cacheKey,
    accessToken: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 86_400) * 1000,
  };
  return body.access_token;
}

async function fetchAdminGraphql(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
) {
  try {
    return await fetchWithTimeout(
      `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({query, variables}),
      },
    );
  } catch (cause) {
    throw new DynamicPricingError(
      'SHOPIFY_API_ERROR',
      'The Shopify Admin API request failed.',
      {cause, retryable: true},
    );
  }
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timeout);
  }
}

type VariantPricingResponse = {
  shop: {currencyCode: string};
  nodes: Array<AdminVariant | {__typename: string} | null>;
};

type DraftOrderCalculateResponse = {
  draftOrderCalculate: {
    calculatedDraftOrder: {
      subtotalPriceSet: {presentmentMoney: ConfiguredMoney};
      totalPriceSet: {presentmentMoney: ConfiguredMoney};
      discountCodes: string[];
    } | null;
    userErrors: Array<{field?: string[] | null; message: string}>;
  };
};

type ExistingDraftOrdersResponse = {
  draftOrders: {
    nodes: Array<{
      id: string;
      status: 'OPEN' | 'INVOICE_SENT' | 'COMPLETED';
      invoiceUrl: string | null;
      customAttributes: Array<{key: string; value: string}>;
    }>;
  };
};

type DraftOrderCreateResponse = {
  draftOrderCreate: {
    draftOrder: {id: string; invoiceUrl: string | null} | null;
    userErrors: Array<{field?: string[] | null; message: string}>;
  };
};

// Raw Admin API documents: intentionally not tagged with #graphql so Hydrogen's
// Storefront codegen does not validate them against the Storefront schema.
const VARIANT_PRICING_QUERY = `
  query WandiniConfiguredVariantPricing($ids: [ID!]!) {
    shop {
      currencyCode
    }
    nodes(ids: $ids) {
      __typename
      ... on ProductVariant {
        id
        availableForSale
        product {
          id
          masterAssetId: metafield(namespace: "custom", key: "master_asset_id") {
            value
          }
        }
        printQuality: metafield(namespace: "custom", key: "print_quality") {
          reference {
            __typename
            ... on Metaobject {
              id
              pricePerM2: field(key: "price_per_m2") { value }
              minWidthCm: field(key: "min_width_cm") { value }
              maxWidthCm: field(key: "max_width_cm") { value }
              minHeightCm: field(key: "min_height_cm") { value }
              maxHeightCm: field(key: "max_height_cm") { value }
            }
          }
        }
      }
    }
  }
`;

const DRAFT_ORDER_CALCULATE_MUTATION = `
  mutation WandiniDraftOrderCalculate($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) {
      calculatedDraftOrder {
        subtotalPriceSet {
          presentmentMoney { amount currencyCode }
        }
        totalPriceSet {
          presentmentMoney { amount currencyCode }
        }
        discountCodes
      }
      userErrors { field message }
    }
  }
`;

const EXISTING_DRAFT_ORDER_QUERY = `
  query WandiniExistingDraftOrder($query: String!) {
    draftOrders(first: 10, query: $query, reverse: true) {
      nodes {
        id
        status
        invoiceUrl
        customAttributes { key value }
      }
    }
  }
`;

const DRAFT_ORDER_CREATE_MUTATION = `
  mutation WandiniDraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id invoiceUrl }
      userErrors { field message }
    }
  }
`;
