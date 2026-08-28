import {
  buildCanonicalUrl,
  buildLocaleSeoUrl,
  resolveSeoDescription,
} from '~/lib/seo';
import {
  CONFIGURED_PRODUCT_CLASSIFICATION,
  type ConfiguredProductClassification,
} from '~/lib/configured-product-classification';

type ProductImage = {
  url?: string | null;
};

type ProductVariant = {
  id?: string | null;
  title?: string | null;
  availableForSale?: boolean | null;
  price?: {
    amount?: string | null;
    currencyCode?: string | null;
  } | null;
  sku?: string | null;
  image?: ProductImage | null;
  selectedOptions?: Array<{
    name?: string | null;
    value?: string | null;
  }> | null;
};

export type ProductStructuredDataInput = {
  id?: string | null;
  title?: string | null;
  vendor?: string | null;
  description?: string | null;
  seo?: {
    description?: string | null;
  } | null;
  images?: {
    edges?: Array<{
      node?: ProductImage | null;
    } | null> | null;
  } | null;
  variants?: {
    nodes?: Array<ProductVariant | null> | null;
  } | null;
  selectedOrFirstAvailableVariant?: ProductVariant | null;
};

export type ProductBreadcrumbItem = {
  name: string;
  url: string;
};

function getText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getProductDescription(product: ProductStructuredDataInput) {
  return resolveSeoDescription({
    explicit: product.seo?.description,
    fallback: product.description,
  });
}

function getProductImageUrls(product: ProductStructuredDataInput) {
  return (
    product.images?.edges
      ?.map((edge) => getText(edge?.node?.url))
      .filter((url): url is string => Boolean(url)) ?? []
  );
}

function getStructuredDataVariants(product: ProductStructuredDataInput) {
  const variants = product.variants?.nodes?.filter(
    (variant): variant is ProductVariant => Boolean(variant?.id),
  );

  if (variants?.length) return variants;

  return product.selectedOrFirstAvailableVariant?.id
    ? [product.selectedOrFirstAvailableVariant]
    : [];
}

function getSchemaId(canonicalUrl: string, type: string, id: string) {
  return `${canonicalUrl}#${type}-${encodeURIComponent(id)}`;
}

function getVariantUrl(canonicalUrl: string, variant: ProductVariant) {
  const selectedOptions = variant.selectedOptions?.filter(
    (option) => getText(option.name) && getText(option.value),
  );

  if (!selectedOptions?.length) return canonicalUrl;

  const isAbsolute = /^https?:\/\//i.test(canonicalUrl);
  const url = new URL(canonicalUrl, 'https://canonical.invalid');

  selectedOptions.forEach((option) => {
    url.searchParams.set(option.name!.trim(), option.value!.trim());
  });

  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

function getOptionSchemaProperty(name?: string | null) {
  const normalizedName = getText(name)?.toLocaleLowerCase('de-DE');

  if (!normalizedName) return null;
  if (
    ['material', 'qualität', 'qualitaet', 'quality'].includes(normalizedName)
  ) {
    return 'material';
  }
  if (['farbe', 'color', 'colour'].includes(normalizedName)) return 'color';
  if (['größe', 'groesse', 'size'].includes(normalizedName)) return 'size';
  if (['muster', 'pattern'].includes(normalizedName)) return 'pattern';

  return null;
}

function getVariantProperties(variant: ProductVariant) {
  const properties: Record<string, string> = {};

  variant.selectedOptions?.forEach((option) => {
    const schemaProperty = getOptionSchemaProperty(option.name);
    const value = getText(option.value);

    if (schemaProperty && value) properties[schemaProperty] = value;
  });

  return properties;
}

function getAdditionalProperties(variant: ProductVariant) {
  const properties =
    variant.selectedOptions
      ?.map((option) => {
        const name = getText(option.name);
        const value = getText(option.value);

        if (
          !name ||
          !value ||
          (name === 'Title' && value === 'Default Title')
        ) {
          return null;
        }

        return {'@type': 'PropertyValue', name, value};
      })
      .filter((property): property is NonNullable<typeof property> =>
        Boolean(property),
      ) ?? [];

  return properties;
}

function getVariesBy(variants: ProductVariant[]) {
  const valuesByProperty = new Map<string, Set<string>>();

  variants.forEach((variant) => {
    variant.selectedOptions?.forEach((option) => {
      const schemaProperty = getOptionSchemaProperty(option.name);
      const value = getText(option.value);

      if (!schemaProperty || !value) return;

      const values = valuesByProperty.get(schemaProperty) ?? new Set<string>();
      values.add(value);
      valuesByProperty.set(schemaProperty, values);
    });
  });

  return [...valuesByProperty.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([property]) => `https://schema.org/${property}`);
}

function getVariantName(productTitle: string, variant: ProductVariant) {
  const optionValues =
    variant.selectedOptions
      ?.map((option) => getText(option.value))
      .filter((value): value is string => Boolean(value))
      .filter((value) => value !== 'Default Title') ?? [];

  const variantTitle = getText(variant.title);
  const distinguishingTitle =
    optionValues.join(', ') ||
    (variantTitle !== 'Default Title' ? variantTitle : null);

  return distinguishingTitle
    ? `${productTitle} - ${distinguishingTitle}`
    : productTitle;
}

function buildOffer(
  variant: ProductVariant,
  variantUrl: string,
  classification: ConfiguredProductClassification,
) {
  if (classification !== CONFIGURED_PRODUCT_CLASSIFICATION.ORDINARY) {
    return null;
  }

  const price = getText(variant.price?.amount);
  const priceCurrency = getText(variant.price?.currencyCode);

  if (!price || !priceCurrency) return null;

  const offer = {
    '@type': 'Offer',
    url: variantUrl,
    availability: variant.availableForSale
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
  };

  return {...offer, price, priceCurrency};
}

function buildVariantProduct({
  canonicalUrl,
  description,
  groupId,
  productImageUrls,
  productTitle,
  classification,
  variant,
}: {
  canonicalUrl: string;
  description: string | null;
  groupId?: string;
  productImageUrls: string[];
  productTitle: string;
  classification: ConfiguredProductClassification;
  variant: ProductVariant;
}) {
  const variantId = getText(variant.id)!;
  const variantUrl = getVariantUrl(canonicalUrl, variant);
  const variantImage = getText(variant.image?.url);
  const images = [
    ...new Set([variantImage, ...productImageUrls].filter(Boolean)),
  ];
  const sku = getText(variant.sku);
  const additionalProperty = getAdditionalProperties(variant);
  const offer = buildOffer(variant, variantUrl, classification);

  return {
    '@type': 'Product',
    '@id': getSchemaId(canonicalUrl, 'product-variant', variantId),
    name: getVariantName(productTitle, variant),
    url: variantUrl,
    ...(groupId ? {isVariantOf: {'@id': groupId}} : {}),
    ...(description ? {description} : {}),
    ...(images.length ? {image: images} : {}),
    ...getVariantProperties(variant),
    ...(additionalProperty.length ? {additionalProperty} : {}),
    ...(sku ? {sku} : {}),
    ...(offer ? {offers: offer} : {}),
  };
}

export function buildProductStructuredData(
  product: ProductStructuredDataInput,
  canonicalInput: string | URL,
  {
    classification = CONFIGURED_PRODUCT_CLASSIFICATION.INVALID,
  }: {classification?: ConfiguredProductClassification} = {},
) {
  const canonicalUrl = buildCanonicalUrl(canonicalInput);
  const productTitle = getText(product.title) ?? 'Wandini';
  const productId = getText(product.id);
  const variants = getStructuredDataVariants(product);
  const description = getProductDescription(product);
  const productImageUrls = getProductImageUrls(product);
  const brand = getText(product.vendor);
  const hasVariantGroup = variants.length > 1 && Boolean(productId);
  const groupId = hasVariantGroup
    ? getSchemaId(canonicalUrl, 'product-group', productId!)
    : undefined;
  const structuredVariants = variants.map((variant) =>
    buildVariantProduct({
      canonicalUrl,
      description,
      groupId,
      productImageUrls,
      productTitle,
      classification,
      variant,
    }),
  );

  if (!hasVariantGroup) {
    const productNode = structuredVariants[0] ?? {
      '@type': 'Product',
      name: productTitle,
      url: canonicalUrl,
      ...(description ? {description} : {}),
      ...(productImageUrls.length ? {image: productImageUrls} : {}),
    };

    return {
      '@context': 'https://schema.org',
      ...productNode,
      ...(brand ? {brand: {'@type': 'Brand', name: brand}} : {}),
    };
  }

  const variesBy = getVariesBy(variants);

  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    '@id': groupId,
    name: productTitle,
    url: canonicalUrl,
    productGroupID: productId,
    ...(description ? {description} : {}),
    ...(productImageUrls.length ? {image: productImageUrls} : {}),
    ...(brand ? {brand: {'@type': 'Brand', name: brand}} : {}),
    ...(variesBy.length ? {variesBy} : {}),
    hasVariant: structuredVariants,
  };
}

export function buildProductBreadcrumbItems(
  productTitle: string,
  canonicalInput: string | URL,
): ProductBreadcrumbItem[] {
  const canonicalUrl = buildCanonicalUrl(canonicalInput);
  const pathname = new URL(canonicalUrl, 'https://canonical.invalid').pathname;
  const isEnglish = pathname === '/en' || pathname.startsWith('/en/');

  return [
    {
      name: isEnglish ? 'Home' : 'Startseite',
      url: buildLocaleSeoUrl(canonicalUrl, '/'),
    },
    {name: productTitle, url: canonicalUrl},
  ];
}

export function buildProductBreadcrumbStructuredData(
  items: ProductBreadcrumbItem[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
