export const CONFIGURED_PRODUCT_CLASSIFICATION = {
  ORDINARY: 'ORDINARY',
  CONFIGURED: 'CONFIGURED',
  INVALID: 'INVALID',
} as const;

export type ConfiguredProductClassification =
  (typeof CONFIGURED_PRODUCT_CLASSIFICATION)[keyof typeof CONFIGURED_PRODUCT_CLASSIFICATION];

export type ShopifyMetaobjectReference =
  | {
      __typename?: string | null;
      id?: string | null;
    }
  | null
  | undefined;

export type ShopifyMasterAssetMetafield =
  | {value?: string | null}
  | null
  | undefined;

export type ShopifyPrintQualityMetafield =
  | {reference?: ShopifyMetaobjectReference}
  | null
  | undefined;

export function classifyConfiguredProductMetafields({
  masterAssetMetafield,
  printQualityMetafield,
}: {
  masterAssetMetafield: ShopifyMasterAssetMetafield;
  printQualityMetafield: ShopifyPrintQualityMetafield;
}) {
  return classifyConfiguredProduct({
    masterAssetId:
      masterAssetMetafield === undefined
        ? undefined
        : masterAssetMetafield === null
          ? null
          : (masterAssetMetafield.value ?? ''),
    printQualityReference:
      printQualityMetafield === undefined
        ? undefined
        : printQualityMetafield === null
          ? null
          : printQualityMetafield.reference === undefined
            ? undefined
            : (printQualityMetafield.reference ?? {}),
  });
}

export function classifyConfiguredProduct({
  masterAssetId,
  printQualityReference,
}: {
  masterAssetId: string | null | undefined;
  printQualityReference: ShopifyMetaobjectReference;
}): ConfiguredProductClassification {
  const masterAssetSignal = classifyMasterAssetSignal(masterAssetId);
  const printQualitySignal = classifyPrintQualitySignal(printQualityReference);

  if (masterAssetSignal === null || printQualitySignal === null) {
    return CONFIGURED_PRODUCT_CLASSIFICATION.INVALID;
  }
  if (masterAssetSignal && printQualitySignal) {
    return CONFIGURED_PRODUCT_CLASSIFICATION.CONFIGURED;
  }
  if (!masterAssetSignal && !printQualitySignal) {
    return CONFIGURED_PRODUCT_CLASSIFICATION.ORDINARY;
  }
  return CONFIGURED_PRODUCT_CLASSIFICATION.INVALID;
}

function classifyMasterAssetSignal(value: string | null | undefined) {
  if (value === undefined) return null;
  if (value === null) return false;
  return value.trim() ? true : null;
}

function classifyPrintQualitySignal(reference: ShopifyMetaobjectReference) {
  if (reference === undefined) return null;
  if (reference === null) return false;
  return reference.__typename === 'Metaobject' && Boolean(reference.id?.trim())
    ? true
    : null;
}
