import {
  CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  addMoneyAmounts,
  calculateConfiguredWallpaperPrice,
  parseConfiguratorPayload,
  resolveConfiguratorPricePerM2,
  type ConfiguredMoney,
  type ConfiguratorPayload,
} from '~/lib/configurator-pricing';

export type CartAttributeLike = {
  key: string;
  value?: string | null;
};

export type CartLinePricingLike = {
  id?: string;
  quantity: number;
  attributes?: CartAttributeLike[] | null;
  cost?: {
    subtotalAmount?: ConfiguredMoney | null;
    totalAmount?: ConfiguredMoney | null;
  } | null;
  merchandise: {
    id: string;
    price?: ConfiguredMoney | null;
    printQuality?: {
      reference?: {
        pricePerM2?: {value?: string | null} | null;
      } | null;
    } | null;
  };
};

export type ConfiguredCartLine = {
  payload: ConfiguratorPayload;
  pricePerM2: string;
  total: ConfiguredMoney;
};

export function getConfiguratorPayloadAttribute(
  line: Pick<CartLinePricingLike, 'attributes'>,
) {
  return line.attributes?.find(
    (attribute) => attribute.key === CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  );
}

export function isConfiguredCartLine(
  line: Pick<CartLinePricingLike, 'attributes'>,
) {
  return Boolean(getConfiguratorPayloadAttribute(line));
}

export function resolveConfiguredCartLine(
  line: CartLinePricingLike,
): ConfiguredCartLine | null {
  const attribute = getConfiguratorPayloadAttribute(line);
  if (!attribute) return null;

  const payload = parseConfiguratorPayload(attribute.value);
  const currencyCode = line.merchandise.price?.currencyCode;
  const pricePerM2 = resolveConfiguratorPricePerM2(
    line.merchandise.price?.amount,
  );

  if (!payload || !currencyCode || !pricePerM2) return null;

  const total = calculateConfiguredWallpaperPrice({
    pricePerM2,
    widthMm: payload.output.width,
    heightMm: payload.output.height,
    currencyCode,
  });

  return total ? {payload, pricePerM2, total} : null;
}

export function getCartLineDisplayTotal(
  line: CartLinePricingLike,
  beforeLineDiscounts = false,
): ConfiguredMoney | null {
  if (isConfiguredCartLine(line)) {
    return resolveConfiguredCartLine(line)?.total ?? null;
  }

  return beforeLineDiscounts
    ? line.cost?.subtotalAmount ?? line.cost?.totalAmount ?? null
    : line.cost?.totalAmount ?? null;
}

export function calculateCartDisplaySubtotal(
  lines: CartLinePricingLike[],
): ConfiguredMoney | null {
  const lineTotals = lines.map((line) => getCartLineDisplayTotal(line, true));
  if (lineTotals.some((total) => !total)) return null;
  return addMoneyAmounts(lineTotals);
}

export function hasConfiguredCartLines(lines: CartLinePricingLike[]) {
  return lines.some(isConfiguredCartLine);
}
