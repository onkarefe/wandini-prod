export const DEFAULT_WALLPAPER_MATERIAL_HANDLE = 'selbstklebend';

type AvailableVariant = {
  availableForSale: boolean;
  printQuality?: {
    reference?: {
      id?: string | null;
      handle?: string | null;
    } | null;
  } | null;
};

type ProductOption<TVariant extends AvailableVariant> = {
  name: string;
  optionValues: ReadonlyArray<{
    name: string;
    firstSelectableVariant?: TVariant | null;
  }>;
};

type SelectedOption = {
  name: string;
};

const NON_PRODUCT_QUERY_PARAMETERS = new Set([
  'gclid',
  'fbclid',
  'ref',
  'source',
]);

function isTrackingParameter(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return (
    normalizedName.startsWith('utm_') ||
    NON_PRODUCT_QUERY_PARAMETERS.has(normalizedName)
  );
}

function getMaterialHandle(variant: AvailableVariant | null | undefined) {
  return variant?.printQuality?.reference?.handle?.trim().toLowerCase() ?? null;
}

export function isWallpaperMaterialOption<
  TVariant extends AvailableVariant,
>(option: ProductOption<TVariant>) {
  return option.optionValues.some(
    (value) => Boolean(value.firstSelectableVariant?.printQuality?.reference),
  );
}

export function hasExplicitProductOptionSelection<
  TVariant extends AvailableVariant,
>(
  _options: ReadonlyArray<ProductOption<TVariant>>,
  selectedOptions: ReadonlyArray<SelectedOption>,
) {
  return selectedOptions.some((option) => !isTrackingParameter(option.name));
}

export function resolveInitialWallpaperVariant<
  TVariant extends AvailableVariant,
>(
  options: ReadonlyArray<ProductOption<TVariant>>,
  nativeVariant: TVariant | null | undefined,
  hasExplicitSelection: boolean,
) {
  if (hasExplicitSelection) return nativeVariant;

  const materialOption = options.find(isWallpaperMaterialOption);
  const preferredVariant = materialOption?.optionValues.find(
    (value) =>
      getMaterialHandle(value.firstSelectableVariant) ===
      DEFAULT_WALLPAPER_MATERIAL_HANDLE,
  )?.firstSelectableVariant;

  return preferredVariant?.availableForSale ? preferredVariant : nativeVariant;
}
