/**
 * Shopify cart line quantities are integers. Configured wall coverings are
 * therefore sold in hundredths of a square metre:
 *
 *   1 Shopify quantity = 0.01 m²
 *   Shopify variant price = price for 0.01 m²
 *   custom.price_per_m2 = customer-facing price for 1 m²
 *
 * Example: 28.89 EUR/m² is stored as 0.2889 EUR on the variant. A 10 m²
 * wall is added with quantity 1000, resulting in 288.90 EUR.
 */
export const CONFIGURATOR_BILLING_UNIT_M2 = 0.01;
export const CONFIGURATOR_BILLING_UNITS_PER_M2 =
  1 / CONFIGURATOR_BILLING_UNIT_M2;

export function calculateConfiguratorAreaM2(
  widthCm: number,
  heightCm: number,
): number {
  if (widthCm <= 0 || heightCm <= 0) return 0;
  return (widthCm * heightCm) / 10_000;
}

export function calculateConfiguratorBillingUnits(areaM2: number): number {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return 0;
  return Math.max(1, Math.ceil(areaM2 / CONFIGURATOR_BILLING_UNIT_M2));
}

export function resolveConfiguratorPricePerM2(
  billingUnitPriceValue: string | number | null | undefined,
  configuredPricePerM2Value: string | number | null | undefined,
): number | null {
  const configuredPricePerM2 = Number(configuredPricePerM2Value);
  if (Number.isFinite(configuredPricePerM2) && configuredPricePerM2 > 0) {
    return configuredPricePerM2;
  }

  const billingUnitPrice = Number(billingUnitPriceValue);
  if (!Number.isFinite(billingUnitPrice) || billingUnitPrice < 0) return null;

  return billingUnitPrice * CONFIGURATOR_BILLING_UNITS_PER_M2;
}

export function calculateConfiguratorLineTotal(
  billingUnitPriceValue: string | number | null | undefined,
  billingUnits: number,
): number | null {
  const billingUnitPrice = Number(billingUnitPriceValue);
  if (
    !Number.isFinite(billingUnitPrice) ||
    billingUnitPrice < 0 ||
    !Number.isInteger(billingUnits) ||
    billingUnits <= 0
  ) {
    return null;
  }

  return billingUnitPrice * billingUnits;
}
