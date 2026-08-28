import {lazy, Suspense} from 'react';
import {Await, useLoaderData} from 'react-router';
import {Analytics, getSelectedProductOptions} from '@shopify/hydrogen';
import type {Route} from './+types/products.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {
  buildCanonicalUrl,
  buildResourceSeoAlternateUrls,
  buildSeoMetadata,
  resolveSeoDescription,
} from '~/lib/seo';
import {ProductBreadcrumb} from '~/components/ProductBreadcrumb';
import {
  buildProductBreadcrumbItems,
  buildProductBreadcrumbStructuredData,
  buildProductStructuredData,
} from '~/lib/product-seo';
import {getSimilarMotifsPreview} from '~/lib/similar-products-preview';
import {useTranslation} from '~/i18n/useTranslation';
import {resolveResourceLanguageSwitchLinks} from '~/lib/language-switcher';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import {
  hasExplicitProductOptionSelection,
  isWallpaperMaterialOption,
  resolveInitialWallpaperVariant,
} from '~/lib/wallpaper-variant-selection';

const ZUBEHOR_PRODUCT_LAYOUT = 'zubehor';

const WallpaperProductLayout = lazy(
  () => import('~/components/WallpaperProductLayout'),
);
const ZubehorProductLayout = lazy(
  () => import('~/components/ZubehorProductLayout'),
);
const SimilarMotifsCarousel = lazy(
  () => import('~/components/SimilarMotifsCarousel'),
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

function getProductMetaDescription(product?: ProductMetaInput | null) {
  return resolveSeoDescription({
    explicit: product?.seo?.description,
    fallback: product?.description,
  });
}

function getProductMetaImage(product?: ProductMetaInput | null) {
  return (
    product?.images?.edges?.find((edge) => edge?.node?.url)?.node?.url ?? null
  );
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data}) => {
  const product = data?.product;

  return buildSeoMetadata({
    title: {
      explicit: product?.seo?.title,
      fallback: product?.title,
      systemFallback: product?.vendor || PRODUCT_META_BRAND,
      brand: product?.vendor || PRODUCT_META_BRAND,
    },
    description: {
      explicit: product?.seo?.description,
      fallback: product?.description,
    },
    canonicalUrl: data?.canonicalUrl ?? `/products/${product?.handle ?? ''}`,
    alternates: buildResourceSeoAlternateUrls(
      data?.canonicalUrl ?? `/products/${product?.handle ?? ''}`,
      data?.languageSwitchLinks,
    ),
    openGraphType: 'product',
    image: getProductMetaImage(product),
  });
};

export async function loader(args: Route.LoaderArgs) {
  const criticalData = await loadCriticalData(args);
  const deferredData = loadDeferredData(args, criticalData.product);
  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) throw new Error('Expected product handle to be defined');

  const requestedSelectedOptions = getSelectedProductOptions(request);
  const {product} = await storefront.query(PRODUCT_QUERY, {
    variables: {handle, selectedOptions: requestedSelectedOptions},
  });

  if (!product?.id) throw new Response(null, {status: 404});

  redirectIfHandleIsLocalized(request, {handle, data: product});

  const hasExplicitVariantSelection = hasExplicitProductOptionSelection(
    product.options,
    requestedSelectedOptions,
  );
  const initialVariant = isZubehorProduct(product)
    ? product.selectedOrFirstAvailableVariant
    : resolveInitialWallpaperVariant(
        product.options,
        product.selectedOrFirstAvailableVariant,
        hasExplicitVariantSelection,
      );
  const materialOption = product.options.find(isWallpaperMaterialOption);
  const seoVariants = isZubehorProduct(product)
    ? initialVariant
      ? [initialVariant]
      : []
    : (materialOption?.optionValues
        .map((optionValue) => optionValue.firstSelectableVariant)
        .filter((variant): variant is NonNullable<typeof variant> =>
          Boolean(variant?.id),
        ) ?? []);
  const languageSwitchLinks = await resolveResourceLanguageSwitchLinks({
    storefront,
    request,
    resourceId: product.id,
    resourceType: 'Product',
  });

  return {
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
    languageSwitchLinks,
    seoVariants,
    product: {
      ...product,
      selectedOrFirstAvailableVariant: initialVariant,
      descriptionHtml: sanitizeProductDescriptionHtml(product.descriptionHtml),
    },
  };
}

function loadDeferredData(
  {context}: Route.LoaderArgs,
  product: Awaited<ReturnType<typeof loadCriticalData>>['product'],
) {
  if (isZubehorProduct(product)) {
    return {similarMotifsPreview: null};
  }

  const mainMotif = product.mainMotif?.value?.trim();
  const mainTheme = product.mainTheme?.value?.trim();

  if (!mainMotif || !mainTheme) {
    return {similarMotifsPreview: null};
  }

  const similarMotifsPreview = getSimilarMotifsPreview({
    storefront: context.storefront,
    sourceProductId: product.id,
    sourceProductTitle: product.title,
    sourceProductImageUrl: product.images.edges[0]?.node.url ?? null,
    mainMotif,
    mainTheme,
  }).catch((error: unknown) => {
    console.error('Similar motifs preview could not be loaded.', error);
    return null;
  });

  return {similarMotifsPreview};
}

function isZubehorProduct(product: {
  productLayout?: {value?: string | null} | null;
}) {
  return (
    product.productLayout?.value?.trim().toLowerCase() ===
    ZUBEHOR_PRODUCT_LAYOUT
  );
}

export default function Product() {
  const {t} = useTranslation();
  const {product, canonicalUrl, seoVariants, similarMotifsPreview} =
    useLoaderData<typeof loader>();
  const selectedVariant = product.selectedOrFirstAvailableVariant;
  const isZubehor = isZubehorProduct(product);
  const productJsonLd = buildProductStructuredData(
    {...product, variants: {nodes: seoVariants}},
    canonicalUrl,
    {priceBasis: isZubehor ? 'item' : 'squareMeter'},
  );
  const breadcrumbItems = buildProductBreadcrumbItems(
    product.title,
    canonicalUrl,
  );
  const breadcrumbJsonLd =
    buildProductBreadcrumbStructuredData(breadcrumbItems);
  const ProductLayout = isZubehor
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

      <ProductBreadcrumb items={breadcrumbItems} />

      <Suspense
        fallback={
          <div
            className="container"
            style={{minHeight: '50vh'}}
            aria-busy="true"
            aria-label={t('product.loading')}
          />
        }
      >
        <ProductLayout product={product} />
      </Suspense>

      {!isZubehor ? (
        <Suspense fallback={null}>
          <Await resolve={similarMotifsPreview} errorElement={null}>
            {(preview) =>
              preview ? <SimilarMotifsCarousel data={preview} /> : null
            }
          </Await>
        </Suspense>
      ) : null}

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
          badge: field(key: "badge") {
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
          image: field(key: "image") {
            reference {
              ... on MediaImage {
                image {
                  url
                  altText
                }
              }
            }
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
    mainMotif: metafield(namespace: "custom", key: "main_motif") {
      value
    }
    mainTheme: metafield(namespace: "custom", key: "main_theme") {
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
