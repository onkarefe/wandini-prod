import React, { useState } from 'react';
import { redirect, useLoaderData, useNavigate } from 'react-router';
import '~/styles/productDetail.css';
import type { Route } from './+types/products.$handle';

import ProductDetailTabs from '~/components/ProductDetailTabs';
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
import { ConfiguratorModal } from '~/components/ConfiguratorModal';
import { redirectIfHandleIsLocalized } from '~/lib/redirect';

export const meta: Route.MetaFunction = ({ data }) => {
  return [
    { title: `Hydrogen | ${data?.product.title ?? ''}` },
    {
      rel: 'canonical',
      href: `/products/${data?.product.handle}`,
    },
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

  return {
    product,
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

  return richText.children.map((block: any, i: number) => {
    if (block.type === 'paragraph') {
      return (
        <p key={i}>
          {block.children.map((child: any, j: number) => child.value)}
        </p>
      );
    }
    // Diğer block tipleri için ekleme yapılabilir
    return null;
  });
}

// YouTube / (ileri de istersen Vimeo, MP4) videoları embed eden yardımcı fonksiyon
function renderVideoFromUrl(rawUrl: string) {
  if (!rawUrl) return null;

  // YouTube normal link: https://www.youtube.com/watch?v=AxNNDIDHDb8
  const ytMatch = rawUrl.match(/v=([a-zA-Z0-9_-]+)/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    return (
      <div className="productVideoWrapper">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title="Installation video"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  // YouTube kısa link: https://youtu.be/xxxxxx
  const shortMatch = rawUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) {
    const videoId = shortMatch[1];
    return (
      <div className="productVideoWrapper">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title="Installation video"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  // Bilinmeyen format → en azından link ver
  return (
    <a href={rawUrl} target="_blank" rel="noopener noreferrer">
      Kurulum videosunu aç
    </a>
  );
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

export default function Product() {
  const { product } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

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

  const {
    title,
    descriptionHtml,
    productInfo,
    deliveryAndShipping,
    installationVideo,
  } = product;

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

  const qualityOptionsNode = qualityOption ? (
    <div className="configratorProps" key={qualityOption.name}>
      <div className="configratorPropsRow">
        {qualityOption.optionValues.map((value) => {
          const { name, variantUriQuery, selected, exists } = value;

          let printQuality: any;
          let m2Price: string | null = null;
          let m2Currency = '';

          if (value?.firstSelectableVariant) {
            const v = value.firstSelectableVariant;
            if ((v as any).printQuality?.reference) {
              printQuality = (v as any).printQuality.reference;
            }
            if (v.price?.amount && v.price?.currencyCode) {
              m2Price = (Number(v.price.amount) * 100).toFixed(2);
              m2Currency = v.price.currencyCode;
            }
          }
          if (
            !m2Currency &&
            selectedVariant?.price?.amount &&
            selectedVariant?.price?.currencyCode
          ) {
            m2Price = (Number(selectedVariant.price.amount) * 100).toFixed(2);
            m2Currency = selectedVariant.price.currencyCode;
          }

          const title = printQuality?.title?.value || name;

          return (
            <label
              key={qualityOption.name + name}
              className={`configratorPropsCard${selected ? ' selectedVariant' : ''}`}
            >
              <div className="configratorPropsTitleRow">
                <input
                  type="radio"
                  checked={selected}
                  disabled={!exists}
                  onChange={() => {
                    if (!selected) {
                      void navigate(`?${variantUriQuery}`, {
                        replace: true,
                        preventScrollReset: true,
                      });
                    }
                  }}
                />
                <span className="configratorPropsTitle">{title}</span>
              </div>
              {!!m2Price && (
                <div className="configratorPropsPrice">
                  {m2Price} {m2Currency} /m²
                </div>
              )}
            </label>
          );
        })}
      </div>
    </div>
  ) : null;

  const isSizeValid = size.width > 0 && size.height > 0;
  const BILLING_UNIT_M2 = 0.01;
  const areaM2 = isSizeValid
    ? (size.width * size.height) / 10_000
    : 0;
  const billingUnits = isSizeValid
    ? Math.max(1, Math.ceil(areaM2 / BILLING_UNIT_M2))
    : 0;

  const configuratorPayload = crop
    ? {
        version: 1,
        master_asset_id: product.masterAssetId?.value ?? '',
        output: {
          unit: 'mm',
          width: Math.round(size.width * 10),
          height: Math.round(size.height * 10),
        },
        crop_ratio: {
          x: crop.x,
          y: crop.y,
          w: crop.w,
          h: crop.h,
        },
      }
    : null;

  const confirmButton =
    selectedVariant && configuratorPayload ? (
      <AddToCartButton
        disabled={!selectedVariant.availableForSale || !isSizeValid || !crop}
        onClick={() => {
          setTimeout(() => navigate('/cart'), 0);
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
        Confirm & Add to Cart
      </AddToCartButton>
    ) : null;

  const tabTitles = [
    'Description',
    'Product Info',
    'Delivery & Shipping',
    'Installation Video',
  ];

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
    productInfo?.value ? (
      renderShopifyRichText(JSON.parse(productInfo.value))
    ) : (
      <p key="noinfo">Ürün bilgisi bulunamadı.</p>
    ),

    // Delivery & Shipping tab
    deliveryAndShipping?.value ? (
      renderShopifyRichText(JSON.parse(deliveryAndShipping.value))
    ) : (
      <p key="noshipping">Teslimat &amp; kargo bilgisi yok.</p>
    ),

    // Installation Video tab
    installationVideo?.value
      ? (() => {
        try {
          const videoObj = JSON.parse(installationVideo.value) as {
            url?: string;
          };

          if (videoObj?.url) {
            const videoNode = renderVideoFromUrl(videoObj.url);
            return (
              videoNode ?? (
                <p key="novideo">Kurulum videosu bulunamadı.</p>
              )
            );
          }

          return <p key="novideo">Kurulum videosu bulunamadı.</p>;
        } catch {
          return <p key="novideo">Kurulum videosu bulunamadı.</p>;
        }
      })()
      : (
        <p key="novideo">Kurulum videosu bulunamadı.</p>
      ),
  ];


  return (
    <div className="container productDetailMainContainer">
      {/* bütün datayı kontrol için gerekiyorsa aç */}
      {/* <pre style={{ whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(product, null, 2)}
      </pre> */}
      <div className="productDetailRow1">
        <div className="productDetailLeft">
          <ProductImage images={product.images} />

          <ProductDetailTabs tabTitles={tabTitles} tabContents={tabContents} />
        </div>

        <div className="productDetailRight">
          <div className="product-main">
            <h1 className="productDetailTitle">{title}</h1>
            {/* Height ve width inputları */}
            <ProductSize onChange={setSize} />

            <ProductForm
              productOptions={productOptions}
              selectedVariant={selectedVariant}
              size={size}
              crop={crop}
              isConfiguring={isConfiguring}
              onConfigure={() => setIsConfiguring(true)}
              masterAssetId={product.masterAssetId?.value}
            />
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
        qualityOptions={qualityOptionsNode}
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
    installationVideo: metafield(namespace: "custom", key: "installation_video") {
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
