export const CONFIGURATOR_PAYLOAD_ATTRIBUTE = 'configurator_payload';
export const CONFIGURATOR_INSTANCE_ATTRIBUTE = 'configurator_instance_id';
export const CONFIGURATOR_PAYLOAD_VERSION = 1;

export type ConfiguratorCropRatio = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ConfiguratorPayload = {
  version: 1;
  master_asset_id: string;
  output: {
    unit: 'mm';
    width: number;
    height: number;
  };
  crop_ratio: ConfiguratorCropRatio;
};

export type ConfiguredMoney = {
  amount: string;
  currencyCode: string;
};

export function createConfiguratorInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `cfg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type DecimalFraction = {
  numerator: bigint;
  denominator: bigint;
};

export function calculateConfiguratorAreaM2(
  widthCm: number,
  heightCm: number,
): number {
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return 0;
  if (widthCm <= 0 || heightCm <= 0) return 0;
  return (widthCm * heightCm) / 10_000;
}

export function createConfiguratorPayload({
  widthCm,
  heightCm,
  crop,
  masterAssetId,
}: {
  widthCm: number;
  heightCm: number;
  crop: ConfiguratorCropRatio | null | undefined;
  masterAssetId: string | null | undefined;
}): ConfiguratorPayload | null {
  if (!crop) return null;

  const payload: ConfiguratorPayload = {
    version: CONFIGURATOR_PAYLOAD_VERSION,
    master_asset_id: masterAssetId?.trim() ?? '',
    output: {
      unit: 'mm',
      width: Math.round(widthCm * 10),
      height: Math.round(heightCm * 10),
    },
    crop_ratio: {...crop},
  };

  return validateConfiguratorPayload(payload) ? payload : null;
}

export function parseConfiguratorPayload(
  value: string | null | undefined,
): ConfiguratorPayload | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return validateConfiguratorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function validateConfiguratorPayload(
  value: unknown,
): value is ConfiguratorPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<ConfiguratorPayload>;
  const output = payload.output as ConfiguratorPayload['output'] | undefined;
  const crop = payload.crop_ratio as ConfiguratorCropRatio | undefined;

  if (payload.version !== CONFIGURATOR_PAYLOAD_VERSION) return false;
  if (
    typeof payload.master_asset_id !== 'string' ||
    !payload.master_asset_id.trim()
  ) {
    return false;
  }
  if (!output || output.unit !== 'mm') return false;
  if (!isPositiveSafeInteger(output.width)) return false;
  if (!isPositiveSafeInteger(output.height)) return false;
  if (!crop) return false;

  const coordinates = [crop.x, crop.y, crop.w, crop.h];
  if (!coordinates.every((coordinate) => Number.isFinite(coordinate))) {
    return false;
  }
  if (crop.x < 0 || crop.y < 0 || crop.w <= 0 || crop.h <= 0) return false;
  if (crop.x > 1 || crop.y > 1 || crop.w > 1 || crop.h > 1) return false;

  const tolerance = 1e-6;
  return crop.x + crop.w <= 1 + tolerance && crop.y + crop.h <= 1 + tolerance;
}

export function resolveConfiguratorPricePerM2(
  configuredPricePerM2Value: string | number | null | undefined,
  catalogPriceValue: string | number | null | undefined,
): string | null {
  const configuredPrice = normalizePositiveDecimal(configuredPricePerM2Value);
  if (configuredPrice) return configuredPrice;

  // The accepted storefront UI treats the catalog amount directly as a per-m²
  // fallback. It is never scaled to reverse the removed billing-unit model.
  return normalizePositiveDecimal(catalogPriceValue);
}

export function calculateConfiguredWallpaperPrice({
  pricePerM2,
  widthMm,
  heightMm,
  currencyCode,
}: {
  pricePerM2: string | number;
  widthMm: number;
  heightMm: number;
  currencyCode: string;
}): ConfiguredMoney | null {
  if (!isPositiveSafeInteger(widthMm) || !isPositiveSafeInteger(heightMm)) {
    return null;
  }

  const price = parsePositiveDecimal(pricePerM2);
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  if (!price || !/^[A-Z]{3}$/.test(normalizedCurrency)) return null;

  const fractionDigits = getCurrencyFractionDigits(normalizedCurrency);
  const minorUnitScale = 10n ** BigInt(fractionDigits);
  const squareMillimetres = BigInt(widthMm) * BigInt(heightMm);
  const denominator = price.denominator * 1_000_000n;
  const unroundedMinorUnits =
    price.numerator * squareMillimetres * minorUnitScale;
  const minorUnits = divideAndRoundHalfUp(unroundedMinorUnits, denominator);

  return {
    amount: formatMinorUnits(minorUnits, fractionDigits),
    currencyCode: normalizedCurrency,
  };
}

export function addMoneyAmounts(
  amounts: Array<ConfiguredMoney | null | undefined>,
): ConfiguredMoney | null {
  const validAmounts = amounts.filter(
    (amount): amount is ConfiguredMoney => Boolean(amount),
  );
  if (validAmounts.length === 0) return null;

  const currencyCode = validAmounts[0].currencyCode.toUpperCase();
  const fractionDigits = getCurrencyFractionDigits(currencyCode);
  let totalMinorUnits = 0n;

  for (const money of validAmounts) {
    if (money.currencyCode.toUpperCase() !== currencyCode) return null;
    const fraction = parseNonNegativeDecimal(money.amount);
    if (!fraction) return null;
    totalMinorUnits += divideAndRoundHalfUp(
      fraction.numerator * 10n ** BigInt(fractionDigits),
      fraction.denominator,
    );
  }

  return {
    amount: formatMinorUnits(totalMinorUnits, fractionDigits),
    currencyCode,
  };
}

export function getCurrencyFractionDigits(currencyCode: string): number {
  try {
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;

    return typeof digits === 'number' &&
      Number.isInteger(digits) &&
      digits >= 0 &&
      digits <= 4
      ? digits
      : 2;
  } catch {
    return 2;
  }
}

function isPositiveSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizePositiveDecimal(
  value: string | number | null | undefined,
): string | null {
  const fraction = parsePositiveDecimal(value);
  if (!fraction) return null;
  return String(value).trim();
}

function parsePositiveDecimal(
  value: string | number | null | undefined,
): DecimalFraction | null {
  const parsed = parseNonNegativeDecimal(value);
  return parsed && parsed.numerator > 0n ? parsed : null;
}

function parseNonNegativeDecimal(
  value: string | number | null | undefined,
): DecimalFraction | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;

  const whole = match[1];
  const decimals = match[2] ?? '';
  const denominator = 10n ** BigInt(decimals.length);
  const numerator = BigInt(`${whole}${decimals}`);
  return {numerator, denominator};
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / 2n) / denominator;
}

function formatMinorUnits(minorUnits: bigint, fractionDigits: number) {
  if (fractionDigits === 0) return minorUnits.toString();

  const scale = 10n ** BigInt(fractionDigits);
  const whole = minorUnits / scale;
  const fraction = (minorUnits % scale).toString().padStart(fractionDigits, '0');
  return `${whole}.${fraction}`;
}
