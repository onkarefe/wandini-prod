import React, { useState } from 'react';
import { redirect, useLoaderData, useNavigate } from 'react-router';
import '~/styles/productDetail.css';
import type { Route } from './+types/products.$handle';

import { ProductDetailTabs } from '~/components/ProductDetailTabs';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import { ProductImage } from '~/components/ProductImage';
import { ProductForm } from '~/components/ProductForm';
import { ProductSize } from '~/components/productSize';
import { AddToCartButton } from '~/components/AddToCartButton';
import {
  ConfiguratorModal,
  type ConfiguratorMaterialOption,
} from '~/components/ConfiguratorModal';
import { redirectIfHandleIsLocalized } from '~/lib/redirect';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
import {getRobotsDirective} from '~/lib/seo';
import {
  calculateConfiguratorAreaM2,
  calculateConfiguratorBillingUnits,
  calculateConfiguratorLineTotal,
  resolveConfiguratorPricePerM2,
} from '~/lib/configurator-pricing';

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
  return html.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match, quote, rawStyle) => {
    const sanitizedStyle = String(rawStyle)
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\1\s*\)/gi, '')
      .replace(/-moz-binding\s*:[^;]+;?/gi, '')
      .trim();

    return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : '';
  });
}

function sanitizeProductDescriptionHtml(html: string | null | undefined) {
  if (!html) {
    return '';
  }

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

  sanitizedHtml = sanitizeInlineStyles(sanitizedHtml)
    .replace(/\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(
      /\s(href|src|xlink:href|formaction|poster|srcdoc)\s*=\s*(["'])\s*(javascript:|vbscript:|data:(?!image\/))[\s\S]*?\2/gi,
      (_match, attributeName, quote) => ` ${attributeName}=${quote}#${quote}`,
    );

  return sanitizedHtml;
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
  if (!value) {
    return '';
  }

  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateMetaDescription(value: string) {
  if (value.length <= PRODUCT_META_DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  const clipped = value.slice(0, PRODUCT_META_DESCRIPTION_MAX_LENGTH + 1);
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const truncated =
    lastSpaceIndex > 80 ? clipped.slice(0, lastSpaceIndex) : clipped.slice(0, PRODUCT_META_DESCRIPTION_MAX_LENGTH);

  return `${truncated.trim()}...`;
}

function getProductMetaTitle(product?: ProductMetaInput | null) {
  const seoTitle = normalizeMetaText(product?.seo?.title);

  if (seoTitle) {
    return seoTitle;
  }

  const productTitle = normalizeMetaText(product?.title);
  const brand = normalizeMetaText(product?.vendor) || PRODUCT_META_BRAND;

  if (!productTitle) {
    return brand;
  }

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
  return product?.images?.edges?.find((edge) => edge?.node?.url)?.node?.url ?? null;
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
          availability: product.selectedOrFirstAvailableVariant?.availableForSale
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

export const meta: Route.MetaFunction = ({ data }) => {
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
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
    {property: 'og:type', content: 'product'},
    {property: 'og:title', content: title},
    ...(description ? [{property: 'og:description', content: description}] : []),
    {property: 'og:url', content: canonicalUrl},
    ...(imageUrl ? [{property: 'og:image', content: imageUrl}] : []),
    {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary',
    },
    {name: 'twitter:title', content: title},
    ...(description ? [{name: 'twitter:description', content: description}] : []),
    ...(imageUrl ? [{name: 'twitter:image', content: imageUrl}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return { ...deferredData, ...criticalData };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({ context, params, request }: Route.LoaderArgs) {
  const { handle } = params;
  const { storefront } = context;

  if (!handle) {
    throw new Error('Expected product handle to be defined');
  }

  const [{ product }] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: { handle, selectedOptions: getSelectedProductOptions(request) },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!product?.id) {
    throw new Response(null, { status: 404 });
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, { handle, data: product });

  const url = new URL(request.url);

  return {
    canonicalUrl: `${url.origin}${url.pathname}`,
    product: {
      ...product,
      descriptionHtml: sanitizeProductDescriptionHtml(product.descriptionHtml),
    },
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({ context, params }: Route.LoaderArgs) {
  // Put any API calls that is not critical to be available on first page render
  // For example: product reviews, product recommendations, social feeds.
  return {};
}

// Shopify rich text JSON'unu JSX'e çeviren yardımcı fonksiyon
function renderShopifyRichText(richText: any) {
  if (!richText || !richText.children) return null;

  return richText.children.map((block: any) => {
    if (block.type === 'paragraph') {
      const paragraphText = block.children
        ?.map((child: any) => child.value)
        .filter(Boolean)
        .join(' ')
        .trim();

      return (
        <p key={paragraphText || 'paragraph'}>
          {block.children.map((child: any) => child.value)}
        </p>
      );
    }
    // Diğer block tipleri için ekleme yapılabilir
    return null;
  });
}

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SelectedQualitySummary = {
  title: string;
  properties: string[];
} | null;

type ShopifyRichTextChild = {
  value?: string | null;
};

type ShopifyRichTextBlock = {
  type?: string | null;
  children?: ShopifyRichTextChild[] | null;
};

type ShopifyRichText = {
  children?: ShopifyRichTextBlock[] | null;
};

function parseJsonMetafield<T>(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export default function Product() {
  const { product, canonicalUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const cartPath = usePrefixPathWithLocale('/cart');
  const productJsonLd = buildProductJsonLd(product, canonicalUrl);
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd(product, canonicalUrl);

  // Configurator modu
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Height ve width state
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Crop (Configurator'dan gelen natural piksel koordinatları)
  const [crop, setCrop] = useState<CropRect | null>(null);

  // Modal (ConfigratorScene) açık mı?

  const handleCloseConfigurator = () => {
    setCrop(null);
    setIsConfiguring(false);
  };

  // Optimistically selects a variant with given available variant information
  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  // Sets the search param to the selected variant without navigation
  // only when no search params are set in the url
  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  // Get the product options array
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const materialStartingPrice = productOptions
    .find((option) => option.name.toLowerCase() === 'quality')
    ?.optionValues.map((value) => {
      const variant = value.firstSelectableVariant as
        | (NonNullable<typeof value.firstSelectableVariant> & {
            printQuality?: {
              reference?: {
                priceWithoutDiscount?: {value?: string | null} | null;
              } | null;
            } | null;
          })
        | null
        | undefined;
      const amount = Number(variant?.price?.amount);

      if (!variant || !Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      const priceWithoutDiscount = Number(
        variant.printQuality?.reference?.priceWithoutDiscount?.value,
      );

      return {
        amount,
        currencyCode: String(variant.price.currencyCode),
        priceWithoutDiscount:
          Number.isFinite(priceWithoutDiscount) && priceWithoutDiscount > amount
            ? priceWithoutDiscount
            : null,
      };
    })
    .filter(
      (
        price,
      ): price is {
        amount: number;
        currencyCode: string;
        priceWithoutDiscount: number | null;
      } => price !== null,
    )
    .sort((firstPrice, secondPrice) => firstPrice.amount - secondPrice.amount)[0];

  const formatMaterialPrice = (amount: number, currencyCode: string) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const wallAreaM2 =
    size.width > 0 && size.height > 0
      ? (size.width * size.height) / 10_000
      : 0;
  const isSizeValid = size.width > 0 && size.height > 0;
  const BILLING_UNIT_M2 = 0.01;
  const areaM2 = isSizeValid
    ? (size.width * size.height) / 10_000
    : 0;
  const billingUnits = isSizeValid
    ? Math.max(1, Math.ceil(areaM2 / BILLING_UNIT_M2))
    : 0;
  const startingTotalPrice = materialStartingPrice
    ? wallAreaM2 * materialStartingPrice.amount
    : 0;
  const formattedWallArea = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(wallAreaM2);

  const {
    title,
    descriptionHtml,
    productInfo,
    deliveryAndShipping,
  } = product;

  const parsedProductInfo = parseJsonMetafield<ShopifyRichText>(
    productInfo?.value,
  );
  const parsedDeliveryAndShipping = parseJsonMetafield<ShopifyRichText>(
    deliveryAndShipping?.value,
  );
  function getPropertiesForQuality(value: any) {
    if (value?.firstSelectableVariant?.printQuality?.reference?.properties?.value) {
      return value.firstSelectableVariant.printQuality.reference.properties.value.split(' - ');
    }
    if (value?.printQuality?.reference?.properties?.value) {
      return value.printQuality.reference.properties.value.split(' - ');
    }
    if (value?.properties?.value) {
      return value.properties.value.split(' - ');
    }
    if (
      selectedVariant?.printQuality?.reference?.title?.value === value.name &&
      selectedVariant?.printQuality?.reference?.properties?.value
    ) {
      return selectedVariant.printQuality.reference.properties.value.split(' - ');
    }
    return [];
  }

  const qualityOption = productOptions.find(
    (option) => option.name.toLowerCase() === 'quality',
  );

  const selectedQualitySummary: SelectedQualitySummary = qualityOption
    ? (() => {
        const selectedQualityValue =
          qualityOption.optionValues.find((value) => value.selected) ??
          qualityOption.optionValues[0];
        if (!selectedQualityValue) return null;

        let printQuality: any;
        if (selectedQualityValue?.firstSelectableVariant) {
          const v = selectedQualityValue.firstSelectableVariant;
          if ((v as any).printQuality?.reference) {
            printQuality = (v as any).printQuality.reference;
          }
        }

        const title = printQuality?.title?.value || selectedQualityValue.name;
        const properties = getPropertiesForQuality(selectedQualityValue);
        return {title, properties};
      })()
    : null;

  const materialOptions: ConfiguratorMaterialOption[] = qualityOption
    ? [...qualityOption.optionValues]
      .sort((firstValue, secondValue) => {
        const firstPrice = Number(
          firstValue.firstSelectableVariant?.price?.amount,
        );
        const secondPrice = Number(
          secondValue.firstSelectableVariant?.price?.amount,
        );

        return (
          (Number.isFinite(firstPrice) ? firstPrice : Number.POSITIVE_INFINITY) -
          (Number.isFinite(secondPrice)
            ? secondPrice
            : Number.POSITIVE_INFINITY)
        );
      })
      .map((value) => {
        const {name, variantUriQuery, selected, exists} = value;
        const variant = value.firstSelectableVariant;
        const printQuality = (variant as any)?.printQuality?.reference;
        const title = printQuality?.title?.value || name;
        const unitPrice = Number(variant?.price?.amount);
        const priceBeforeDiscount = Number(
          printQuality?.priceWithoutDiscount?.value,
        );
        const currencyCode = variant?.price?.currencyCode;
        const hasPrice =
          Number.isFinite(unitPrice) && unitPrice >= 0 && Boolean(currencyCode);
        const hasPriceBeforeDiscount =
          hasPrice &&
          Number.isFinite(priceBeforeDiscount) &&
          priceBeforeDiscount > unitPrice;

        return {
          id: `${qualityOption.name}-${name}`,
          title,
          pricePerSquareMeter: hasPrice
            ? formatMaterialPrice(unitPrice, String(currencyCode))
            : '—',
          priceBeforeDiscount: hasPriceBeforeDiscount
            ? formatMaterialPrice(
                priceBeforeDiscount,
                String(currencyCode),
              )
            : null,
          calculatedPrice: hasPrice && isSizeValid
            ? formatMaterialPrice(unitPrice * areaM2, String(currencyCode))
            : '—',
          properties: getPropertiesForQuality(value),
          isBestseller: title.trim().toLowerCase() === 'premium',
          selected,
          exists,
          variantUriQuery,
        };
      })
    : [];

  const configuratorPayload = crop
    ? {
        version: 1, // Payload schema version
        master_asset_id: product.masterAssetId?.value ?? '', // Shopify metafield: source/master design asset id
        output: {
          unit: 'mm', // Output dimension unit
          width: Math.round(size.width * 10), // Final print width in mm
          height: Math.round(size.height * 10), // Final print height in mm
        },
        // Panel count/width should be calculated in backend from output + recipe rules.
        crop_ratio: {
          x: crop.x, // Crop start X (0..1, relative to source image)
          y: crop.y, // Crop start Y (0..1, relative to source image)
          w: crop.w, // Crop width (0..1, relative to source image)
          h: crop.h, // Crop height (0..1, relative to source image)
        },
      }
    : null;

  const confirmButton =
    selectedVariant && configuratorPayload ? (
        <AddToCartButton
          disabled={!selectedVariant.availableForSale || !isSizeValid || !crop}
          onClick={() => {
          setTimeout(() => {
            void navigate(cartPath);
          }, 0);
          }}
        lines={[
          {
            merchandiseId: selectedVariant.id,
            quantity: billingUnits,
            attributes: [
              {
                key: 'configurator_payload',
                value: JSON.stringify(configuratorPayload),
              },
            ],
            selectedVariant,
          },
        ]}
      >
        Bestätigen &amp; in den Warenkorb
      </AddToCartButton>
    ) : null;

  const tabTitles = [
    'Description',
    'Product Info',
    'Delivery & Shipping',
  ];

  const productInfoContent = parsedProductInfo
    ? renderShopifyRichText(parsedProductInfo)
    : null;

  const deliveryAndShippingContent = parsedDeliveryAndShipping
    ? renderShopifyRichText(parsedDeliveryAndShipping)
    : null;

  const tabContents = [
    // Description tab
    descriptionHtml ? (
      <div
        key="desc"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      />
    ) : (
      <p key="nodesc">Açıklama yok.</p>
    ),

    // Product Info tab
    productInfoContent ? (
      productInfoContent
    ) : (
      <p key="noinfo">Ürün bilgisi bulunamadı.</p>
    ),

    // Delivery & Shipping tab
    deliveryAndShippingContent ? (
      deliveryAndShippingContent
    ) : (
      <p key="noshipping">Teslimat &amp; kargo bilgisi yok.</p>
    ),

  ];


  return (
    <div className="container productDetailMainContainer">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(productJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(breadcrumbJsonLd)}}
      />
      {/* bütün datayı kontrol için gerekiyorsa aç */}
      {/* <pre style={{ whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(product, null, 2)}
      </pre> */}
      <div className="productDetailRow1">
        <div className="productDetailLeft">
          <ProductImage images={product.images} productTitle={title} />

          <ProductDetailTabs tabTitles={tabTitles} tabContents={tabContents} />
        </div>

        <div className="productDetailRight">
          <div className="product-main productPurchaseCard">
            <section className="productPurchaseCardIntro">
              <h1 className="productDetailTitle">{title}</h1>
              <p className="productPurchaseNote">
                Bitte planen Sie bei Ihrer Bestellung umlaufend 6 cm
                Beschnittzugabe für eine passgenaue Montage ein.
              </p>

              {materialStartingPrice && (
                <div
                  className="productStartingPrice"
                  aria-label="Startpreis pro Quadratmeter"
                >
                  <span className="productStartingPriceLabel">Ab</span>
                  <strong className="productStartingPriceAmount">
                    {formatMaterialPrice(
                      materialStartingPrice.amount,
                      materialStartingPrice.currencyCode,
                    )}
                  </strong>
                  <span className="productStartingPriceUnit">/ m²</span>
                  {materialStartingPrice.priceWithoutDiscount && (
                    <del className="productStartingPricePrevious">
                      {formatMaterialPrice(
                        materialStartingPrice.priceWithoutDiscount,
                        materialStartingPrice.currencyCode,
                      )}
                    </del>
                  )}
                </div>
              )}
            </section>

            <div className="productPurchaseCardDivider" aria-hidden="true" />

            <section className="productPurchaseCardConfiguration">
              <ProductSize onChange={setSize} />

              <div className="productOrderSummary" aria-live="polite">
                <div className="productOrderSummaryItem">
                  <span className="productOrderSummaryLabel">Wandfläche</span>
                  <strong className="productOrderSummaryValue">
                    {wallAreaM2 > 0 ? `${formattedWallArea} m²` : '— m²'}
                  </strong>
                </div>
                <div className="productOrderSummaryItem productOrderSummaryItemPrice">
                  <span className="productOrderSummaryLabel">Preis ab</span>
                  <strong className="productOrderSummaryValue">
                    {wallAreaM2 > 0 && materialStartingPrice
                      ? formatMaterialPrice(
                          startingTotalPrice,
                          materialStartingPrice.currencyCode,
                        )
                      : '—'}
                  </strong>
                </div>
              </div>

              <ProductForm
                productOptions={productOptions}
                selectedVariant={selectedVariant}
                size={size}
                crop={crop}
                isConfiguring={isConfiguring}
                onConfigure={() => setIsConfiguring(true)}
                masterAssetId={product.masterAssetId?.value}
                showQualityOptions={false}
              />
            </section>
          </div>
        </div>
      </div>

      <ConfiguratorModal
        isOpen={isConfiguring}
        onClose={handleCloseConfigurator}
        imageUrl={product.images?.edges?.[0]?.node?.url || ''}
        widthCm={size.width}
        heightCm={size.height}
        crop={crop}
        onCropChange={setCrop}
        materialOptions={materialOptions}
        onMaterialSelect={async (material) => {
          if (material.selected) return;

          await navigate(`?${material.variantUriQuery}`, {
            replace: true,
            preventScrollReset: true,
          });
        }}
        selectedQualitySummary={selectedQualitySummary}
        confirmButton={confirmButton}
      />

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
    </div>
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
