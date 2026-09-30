export type CartUpsellVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: {amount: string; currencyCode: string};
  selectedOptions: Array<{name: string; value: string}>;
};

export function resolveCartUpsellVariant(
  variants: CartUpsellVariant[],
  selectedVariantId: string | null,
) {
  // Preserve Shopify order, including unavailable variants, on first render
  // and when a previously selected variant is removed from the product.
  return (
    variants.find(({id}) => id === selectedVariantId) ?? variants[0] ?? null
  );
}

function meaningfulOptions(variant: CartUpsellVariant) {
  return variant.selectedOptions.filter(
    ({value}) => value.trim() && value.trim().toLowerCase() !== 'default title',
  );
}

export function getCartUpsellVariantLabel(variant: CartUpsellVariant) {
  return (
    meaningfulOptions(variant)
      .map(({value}) => value.trim())
      .join(' / ') || variant.title
  );
}

export function getCartUpsellSelectorLabel(
  variants: CartUpsellVariant[],
  fallback: string,
) {
  const names = [
    ...new Set(
      variants.flatMap((variant) =>
        meaningfulOptions(variant)
          .map(({name}) => name.trim())
          .filter((name) => name && name.toLowerCase() !== 'title'),
      ),
    ),
  ];
  return names.join(' / ') || fallback;
}

export function getCartUpsellButtonState(
  variant: CartUpsellVariant | null,
  isPending = false,
) {
  return {
    disabled: !variant?.availableForSale || isPending,
    labelKey: isPending
      ? ('cart.adding' as const)
      : variant?.availableForSale
        ? ('product.addToCart' as const)
        : ('product.unavailable' as const),
  };
}
