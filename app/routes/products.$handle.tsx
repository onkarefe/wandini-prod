import {lazy, Suspense} from 'react';
import {useLoaderData} from 'react-router';
import {Analytics, getSelectedProductOptions} from '@shopify/hydrogen';
import type {Route} from './+types/products.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {getRobotsDirective} from '~/lib/seo';

const ZUBEHOR_PRODUCT_LAYOUT = 'zubehor';

const WallpaperProductLayout = lazy(
  () => import('~/components/WallpaperProductLayout'),
);
const ZubehorProductLayout = lazy(
  () => import('~/components/ZubehorProductLayout'),
);

const BLOCKED_HTML_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'link',
  'meta',
  'base',
] as const;

function sanitizeInlineStyles(html: string) {
  return html.replace(
    /\sstyle\s*=\s*(["'])(.*?)\1/gi,
    (_match, quote, rawStyle) => {
      const sanitizedStyle = String(rawStyle)
        .replace(/expression\s*\([^)]*\)/gi, '')
        .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\1\s*\)/gi, '')
        .replace(/-moz-binding\s*:[^;]+;?/gi, '')
        .trim();

      return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : '';
    },
  );
}

function sanitizeProductDescriptionHtml(html: string | null | undefined) {
  if (!html) return '';

  let sanitizedHtml = html;

  for (const tagName of BLOCKED_HTML_TAGS) {
    const blockTagPattern = new RegExp(
      `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      'gi',
    );
    const selfClosingTagPattern = new RegExp(`<${tagName}\\b[^>]*\\/?>`, 'gi');

    sanitizedHtml = sanitizedHtml
      .replace(blockTagPattern, '')
      .replace(selfClosingTagPattern, '');
  }

  return sanitizeInlineStyles(sanitizedHtml)
    .replace(/\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(
      /\s(href|src|xlink:href|formaction|poster|srcdoc)\s*=\s*(["'])\s*(javascript:|vbscript:|data:(?!image\/))[\s\S]*?\2/gi,
      (_match, attributeName, quote) => ` ${attributeName}=${quote}#${quote}`,
    );
}

const PRODUCT_META_BRAND = 'Wandini';
const PRODUCT_META_DESCRIPTION_MAX_LENGTH = 160;

type ProductMetaInput = {
  title?: string | null;
  vendor?: string | null;
  handle?: string | null;
  description?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  images?: {
    edges?: Array<{
      node?: {
        url?: string | null;
      } | null;
    } | null> | null;
  } | null;
};

function normalizeMetaText(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMetaDescription(value: string) {
  if (value.length <= PRODUCT_META_DESCRIPTION_MAX_LENGTH) return value;

  const clipped = value.slice(0, PRODUCT_META_DESCRIPTION_MAX_LENGTH + 1);
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const truncated =
    lastSpaceIndex > 80
      ? clipped.slice(0, lastSpaceIndex)
      : clipped.slice(0, PRODUCT_META_DESCRIPTION_MAX_LENGTH);

  return `${truncated.trim()}...`;
}

function getProductMetaTitle(product?: ProductMetaInput | null) {
  const seoTitle = normalizeMetaText(product?.seo?.title);
  if (seoTitle) return seoTitle;

  const productTitle = normalizeMetaText(product?.title);
  const brand = normalizeMetaText(product?.vendor) || PRODUCT_META_BRAND;

  if (!productTitle) return brand;

  return productTitle.toLowerCase().includes(brand.toLowerCase())
    ? productTitle
    : `${productTitle} | ${brand}`;
}

function getProductMetaDescription(product?: ProductMetaInput | null) {
  const description =
    normalizeMetaText(product?.seo?.description) ||
    normalizeMetaText(product?.description);

  return description ? truncateMetaDescription(description) : null;
}

function getProductMetaImage(product?: ProductMetaInput | null) {
  return (
    product?.images?.edges?.find((edge) => edge?.node?.url)?.node?.url ?? null
  );
}

type ProductStructuredDataInput = ProductMetaInput & {
  selectedOrFirstAvailableVariant?: {
    availableForSale?: boolean | null;
    price?: {
      amount?: string | null;
      currencyCode?: string | null;
    } | null;
    sku?: string | null;
  } | null;
};

function getProductImageUrls(product?: ProductMetaInput | null) {
  return (
    product?.images?.edges
      ?.map((edge) => edge?.node?.url)
      .filter((url): url is string => Boolean(url)) ?? []
  );
}

function buildProductJsonLd(
  product: ProductStructuredDataInput,
  canonicalUrl: string,
) {
  const description = getProductMetaDescription(product);
  const imageUrls = getProductImageUrls(product);
  const brand = normalizeMetaText(product.vendor);
  const sku = normalizeMetaText(product.selectedOrFirstAvailableVariant?.sku);
  const price = product.selectedOrFirstAvailableVariant?.price?.amount;
  const priceCurrency =
    product.selectedOrFirstAvailableVariant?.price?.currencyCode;
  const offer =
    price && priceCurrency
      ? {
          '@type': 'Offer',
          url: canonicalUrl,
          price,
          priceCurrency,
          availability: product.selectedOrFirstAvailableVariant
            ?.availableForSale
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
        }
      : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    ...(description ? {description} : {}),
    ...(imageUrls.length > 0 ? {image: imageUrls} : {}),
    ...(brand ? {brand: {'@type': 'Brand', name: brand}} : {}),
    ...(sku ? {sku} : {}),
    ...(offer ? {offers: offer} : {}),
  };
}

function getBreadcrumbHomeUrl(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  const [firstSegment] = url.pathname.split('/').filter(Boolean);

  return firstSegment?.toLowerCase() === 'de-de'
    ? `${url.origin}/de-de`
    : `${url.origin}/`;
}

function buildProductBreadcrumbJsonLd(
  product: ProductStructuredDataInput,
  canonicalUrl: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: getBreadcrumbHomeUrl(canonicalUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: product.title,
        item: canonicalUrl,
      },
    ],
  };
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data}) => {
  const product = data?.product;
  const title = getProductMetaTitle(product);
  const description = getProductMetaDescription(product);
  const imageUrl = getProductMetaImage(product);
  const canonicalUrl =
    data?.canonicalUrl ?? `/products/${product?.handle ?? ''}`;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {name: 'robots', content: getRobotsDirective()},
    {tagName: 'link', rel: 'canonical', href: canonicalUrl},
    {property: 'og:type', content: 'product'},
    {property: 'og:title', content: title},
    ...(description
      ? [{property: 'og:description', content: description}]
      : []),
    {property: 'og:url', content: canonicalUrl},
    ...(imageUrl ? [{property: 'og:image', content: imageUrl}] : []),
    {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary',
    },
    {name: 'twitter:title', content: title},
    ...(description
      ? [{name: 'twitter:description', content: description}]
      : []),
    ...(imageUrl ? [{name: 'twitter:image', content: imageUrl}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData();
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) throw new Error('Expected product handle to be defined');

  const {product} = await storefront.query(PRODUCT_QUERY, {
    variables: {handle, selectedOptions: getSelectedProductOptions(request)},
  });

  if (!product?.id) throw new Response(null, {status: 404});

  redirectIfHandleIsLocalized(request, {handle, data: product});

  const url = new URL(request.url);

  return {
    canonicalUrl: `${url.origin}${url.pathname}`,
    product: {
      ...product,
      descriptionHtml: sanitizeProductDescriptionHtml(product.descriptionHtml),
    },
  };
}

function loadDeferredData() {
  return {};
}

function isZubehorProduct(
  product: Awaited<ReturnType<typeof loadCriticalData>>['product'],
) {
  return (
    product.productLayout?.value?.trim().toLowerCase() ===
    ZUBEHOR_PRODUCT_LAYOUT
  );
}

export default function Product() {
  const {product, canonicalUrl} = useLoaderData<typeof loader>();
  const productJsonLd = buildProductJsonLd(product, canonicalUrl);
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd(product, canonicalUrl);
  const selectedVariant = product.selectedOrFirstAvailableVariant;
  const ProductLayout = isZubehorProduct(product)
    ? ZubehorProductLayout
    : WallpaperProductLayout;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(productJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(breadcrumbJsonLd)}}
      />

      <Suspense
        fallback={
          <div
            className="container"
            style={{minHeight: '50vh'}}
            aria-busy="true"
            aria-label="Produkt wird geladen"
          />
        }
      >
        <ProductLayout product={product} />
      </Suspense>

      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: selectedVariant?.price.amount || '0',
              vendor: product.vendor,
              variantId: selectedVariant?.id || '',
              variantTitle: selectedVariant?.title || '',
              quantity: 1,
            },
          ],
        }}
      />
    </>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
    printQuality: metafield(namespace: "custom", key: "print_quality") {
      reference {
        ... on Metaobject {
          id
          handle
          title: field(key: "title") {
            value
          }
          pricePerM2: field(key: "price_per_m2") {
            value
          }
          priceWithoutDiscount: field(key: "price_wo_disc") {
            value
          }
          minWidthCm: field(key: "min_width_cm") {
            value
          }
          maxWidthCm: field(key: "max_width_cm") {
            value
          }
          minHeightCm: field(key: "min_height_cm") {
            value
          }
          maxHeightCm: field(key: "max_height_cm") {
            value
          }
          properties: field(key: "properties") {
            value
          }
        }
      }
    }
  }
` as const;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    images(first: 20) {
      edges {
        node {
          id
          url
          altText
          width
          height
        }
      }
    }
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(
      selectedOptions: $selectedOptions
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      ...ProductVariant
    }
    adjacentVariants(selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo {
      description
      title
    }
    productInfo: metafield(namespace: "custom", key: "product_info") {
      value
      type
    }
    deliveryAndShipping: metafield(namespace: "custom", key: "delivery_and_shipping") {
      value
      type
    }
    masterAssetId: metafield(namespace: "custom", key: "master_asset_id") {
      value
      type
    }
    productLayout: metafield(namespace: "custom", key: "product_layout") {
      value
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;
