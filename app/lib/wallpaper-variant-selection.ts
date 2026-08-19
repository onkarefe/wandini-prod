const DEFAULT_WALLPAPER_OPTION_NAME = 'quality';
const DEFAULT_WALLPAPER_OPTION_VALUE = 'selbstklebend';

type AvailableVariant = {
  availableForSale: boolean;
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

const normalizeOptionValue = (value: string) => value.trim().toLowerCase();

export function hasExplicitProductOptionSelection<
  TVariant extends AvailableVariant,
>(
  options: ReadonlyArray<ProductOption<TVariant>>,
  selectedOptions: ReadonlyArray<SelectedOption>,
) {
  const productOptionNames = new Set(
    options.map((option) => normalizeOptionValue(option.name)),
  );

  return selectedOptions.some((option) =>
    productOptionNames.has(normalizeOptionValue(option.name)),
  );
}

export function resolveInitialWallpaperVariant<
  TVariant extends AvailableVariant,
>(
  options: ReadonlyArray<ProductOption<TVariant>>,
  nativeVariant: TVariant | null | undefined,
  hasExplicitSelection: boolean,
) {
  if (hasExplicitSelection) return nativeVariant;

  const qualityOption = options.find(
    (option) =>
      normalizeOptionValue(option.name) === DEFAULT_WALLPAPER_OPTION_NAME,
  );
  const preferredVariant = qualityOption?.optionValues.find(
    (value) =>
      normalizeOptionValue(value.name) === DEFAULT_WALLPAPER_OPTION_VALUE,
  )?.firstSelectableVariant;

  return preferredVariant?.availableForSale ? preferredVariant : nativeVariant;
}
