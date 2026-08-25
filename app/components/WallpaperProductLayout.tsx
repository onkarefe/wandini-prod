import {Fragment, useState, type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {
  getAdjacentAndFirstAvailableVariants,
  getProductOptions,
  useOptimisticVariant,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {AddToCartButton} from '~/components/AddToCartButton';
import {
  ConfiguratorModal,
  type ConfiguratorMaterialOption,
} from '~/components/ConfiguratorModal';
import {ProductDetailTabs} from '~/components/ProductDetailTabs';
import {ProductForm} from '~/components/ProductForm';
import {ProductImage} from '~/components/ProductImage';
import {ProductSize} from '~/components/productSize';
import {
  CONFIGURATOR_INSTANCE_ATTRIBUTE,
  CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  MAX_CONFIGURATOR_HEIGHT_CM,
  calculateConfiguredWallpaperPrice,
  calculateConfiguratorAreaM2,
  createConfiguratorPayload,
  createConfiguratorInstanceId,
  resolveConfiguratorPricePerM2,
} from '~/lib/configurator-pricing';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {
  formatLocaleCurrency,
  formatLocaleNumber,
} from '~/lib/locale-format';
import {isWallpaperMaterialOption} from '~/lib/wallpaper-variant-selection';
import '~/styles/productDetail.css';

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
  bold?: boolean | null;
  italic?: boolean | null;
};

type ShopifyRichTextBlock = {
  type?: string | null;
  children?: ShopifyRichTextChild[] | null;
};

type ShopifyRichText = {
  children?: ShopifyRichTextBlock[] | null;
};

function renderShopifyRichTextChild(
  child: ShopifyRichTextChild,
  index: number,
) {
  let content: ReactNode = child.value ?? '';

  if (child.bold) {
    content = <strong>{content}</strong>;
  }

  if (child.italic) {
    content = <em>{content}</em>;
  }

  return <Fragment key={`text-${index}`}>{content}</Fragment>;
}

function renderShopifyRichText(richText: ShopifyRichText | null) {
  if (!richText?.children) return null;

  return richText.children.map((block, index) => {
    if (block.type !== 'paragraph') return null;

    const paragraphText = block.children
      ?.map((child) => child.value)
      .filter(Boolean)
      .join(' ')
      .trim();

    return (
      <p key={paragraphText || `paragraph-${index}`}>
        {block.children?.map(renderShopifyRichTextChild)}
      </p>
    );
  });
}

function parseJsonMetafield<T>(value?: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function splitMaterialProperties(value?: string | null) {
  if (!value) return [];

  return value
    .split(/\s+[-\u2010-\u2015\u2212]\s+/u)
    .map((property) => property.trim())
    .filter(Boolean);
}

export type WallpaperProductLayoutProps = {
  product: ProductFragment;
};

export default function WallpaperProductLayout({
  product,
}: WallpaperProductLayoutProps) {
  const navigate = useNavigate();
  const {locale, t} = useTranslation();
  const cartPath = usePrefixPathWithLocale('/cart');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [size, setSize] = useState({width: 0, height: 0});
  const [showSizeErrors, setShowSizeErrors] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [configurationInstanceId, setConfigurationInstanceId] = useState(
    createConfiguratorInstanceId,
  );

  const handleCloseConfigurator = () => {
    setCrop(null);
    setIsConfiguring(false);
  };

  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });
  const qualityOption = productOptions.find(isWallpaperMaterialOption);

  const materialStartingPrice = qualityOption?.optionValues.map((value) => {
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
      const pricePerM2 = resolveConfiguratorPricePerM2(variant?.price?.amount);
      const amount = Number(pricePerM2);

      if (!variant || !Number.isFinite(amount) || amount <= 0) return null;

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
    .sort(
      (firstPrice, secondPrice) => firstPrice.amount - secondPrice.amount,
    )[0];

  const formatMaterialPrice = (amount: number, currencyCode: string) =>
    formatLocaleCurrency(amount, currencyCode, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const wallAreaM2 = calculateConfiguratorAreaM2(size.width, size.height);
  const isSizeValid =
    size.width > 0 &&
    size.height > 0 &&
    size.height <= MAX_CONFIGURATOR_HEIGHT_CM;
  const widthError =
    showSizeErrors && !(Number.isFinite(size.width) && size.width > 0)
      ? t('product.widthRequired')
      : undefined;
  const heightError =
    showSizeErrors && !(Number.isFinite(size.height) && size.height > 0)
      ? t('product.heightRequired')
      : showSizeErrors && size.height > MAX_CONFIGURATOR_HEIGHT_CM
        ? t('product.maxHeight', {height: MAX_CONFIGURATOR_HEIGHT_CM})
        : undefined;
  const outputWidthMm = Math.round(size.width * 10);
  const outputHeightMm = Math.round(size.height * 10);
  const startingTotalPrice = materialStartingPrice
    ? calculateConfiguredWallpaperPrice({
        pricePerM2: materialStartingPrice.amount,
        widthMm: outputWidthMm,
        heightMm: outputHeightMm,
        currencyCode: materialStartingPrice.currencyCode,
      })
    : null;
  const formattedWallArea = formatLocaleNumber(wallAreaM2, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const {title, descriptionHtml, productInfo, deliveryAndShipping} = product;
  const parsedProductInfo = parseJsonMetafield<ShopifyRichText>(
    productInfo?.value,
  );
  const parsedDeliveryAndShipping = parseJsonMetafield<ShopifyRichText>(
    deliveryAndShipping?.value,
  );

  function getPropertiesForQuality(value: any) {
    if (
      value?.firstSelectableVariant?.printQuality?.reference?.properties?.value
    ) {
      return splitMaterialProperties(
        value.firstSelectableVariant.printQuality.reference.properties.value,
      );
    }
    if (value?.printQuality?.reference?.properties?.value) {
      return splitMaterialProperties(
        value.printQuality.reference.properties.value,
      );
    }
    if (value?.properties?.value) {
      return splitMaterialProperties(value.properties.value);
    }
    if (
      value?.selected &&
      selectedVariant?.printQuality?.reference?.properties?.value
    ) {
      return splitMaterialProperties(
        selectedVariant.printQuality.reference.properties.value,
      );
    }
    return [];
  }

  const selectedQualitySummary: SelectedQualitySummary = qualityOption
    ? (() => {
        const selectedQualityValue =
          qualityOption.optionValues.find((value) => value.selected) ??
          qualityOption.optionValues[0];
        if (!selectedQualityValue) return null;

        let printQuality: any;
        if (selectedQualityValue.firstSelectableVariant) {
          const variant = selectedQualityValue.firstSelectableVariant;
          if ((variant as any).printQuality?.reference) {
            printQuality = (variant as any).printQuality.reference;
          }
        }

        const selectedTitle =
          printQuality?.title?.value || selectedQualityValue.name;
        const properties = getPropertiesForQuality(selectedQualityValue);
        return {title: selectedTitle, properties};
      })()
    : null;

  const materialOptions: ConfiguratorMaterialOption[] = qualityOption
    ? [...qualityOption.optionValues]
        .sort((firstValue, secondValue) => {
          const firstPrice = Number(
            resolveConfiguratorPricePerM2(
              firstValue.firstSelectableVariant?.price?.amount,
            ),
          );
          const secondPrice = Number(
            resolveConfiguratorPricePerM2(
              secondValue.firstSelectableVariant?.price?.amount,
            ),
          );

          return (
            (Number.isFinite(firstPrice)
              ? firstPrice
              : Number.POSITIVE_INFINITY) -
            (Number.isFinite(secondPrice)
              ? secondPrice
              : Number.POSITIVE_INFINITY)
          );
        })
        .map((value) => {
          const {name, variantUriQuery, selected, exists} = value;
          const variant = value.firstSelectableVariant;
          const printQuality = (variant as any)?.printQuality?.reference;
          const optionTitle = printQuality?.title?.value || name;
          const materialImage = printQuality?.image?.reference?.image;
          const materialBadge = printQuality?.badge?.value?.trim() || null;
          const pricePerM2 = resolveConfiguratorPricePerM2(
            variant?.price?.amount,
          );
          const currencyCode = variant?.price?.currencyCode;
          const configuredPrice =
            pricePerM2 && currencyCode && isSizeValid
              ? calculateConfiguredWallpaperPrice({
                  pricePerM2,
                  widthMm: outputWidthMm,
                  heightMm: outputHeightMm,
                  currencyCode: String(currencyCode),
                })
              : null;

          return {
            id: String(
              printQuality?.id ??
                variant?.id ??
                `${qualityOption.name}-${name}`,
            ),
            identity: String(
              printQuality?.handle ?? printQuality?.id ?? variant?.id ?? '',
            ),
            title: optionTitle,
            calculatedPrice:
              configuredPrice
                ? formatMaterialPrice(
                    Number(configuredPrice.amount),
                    configuredPrice.currencyCode,
                  )
                : '—',
            properties: getPropertiesForQuality(value),
            image: materialImage?.url
              ? {
                  url: materialImage.url,
                  altText: materialImage.altText,
                }
              : null,
            badge: materialBadge,
            selected,
            exists,
            variantUriQuery,
          };
        })
    : [];

  const configuratorPayload = createConfiguratorPayload({
    widthCm: size.width,
    heightCm: size.height,
    crop,
    masterAssetId: product.masterAssetId?.value,
  });

  const confirmButton =
    selectedVariant && configuratorPayload ? (
      <AddToCartButton
        disabled={!selectedVariant.availableForSale || !isSizeValid || !crop}
        onSuccess={() => {
          setConfigurationInstanceId(createConfiguratorInstanceId());
          void navigate(cartPath);
        }}
        lines={[
          {
            merchandiseId: selectedVariant.id,
            quantity: 1,
            attributes: [
              {
                key: CONFIGURATOR_PAYLOAD_ATTRIBUTE,
                value: JSON.stringify(configuratorPayload),
              },
              {
                key: CONFIGURATOR_INSTANCE_ATTRIBUTE,
                value: configurationInstanceId,
              },
            ],
            selectedVariant,
          },
        ]}
      >
        {t('product.confirmAddToCart')}
      </AddToCartButton>
    ) : null;

  const tabTitles = [
    t('product.description'),
    t('product.information'),
    t('product.deliveryShipping'),
  ];
  const productInfoContent = parsedProductInfo
    ? renderShopifyRichText(parsedProductInfo)
    : null;
  const deliveryAndShippingContent = parsedDeliveryAndShipping
    ? renderShopifyRichText(parsedDeliveryAndShipping)
    : null;
  const tabContents = [
    descriptionHtml ? (
      <div key="desc" dangerouslySetInnerHTML={{__html: descriptionHtml}} />
    ) : (
      <p key="nodesc">{t('product.noDescription')}</p>
    ),
    productInfoContent || (
      <p key="noinfo">{t('product.noInformation')}</p>
    ),
    deliveryAndShippingContent || (
      <p key="noshipping">{t('product.noDeliveryShipping')}</p>
    ),
  ];

  return (
    <div className="container productDetailMainContainer">
      <div className="productDetailRow1">
        <div className="productDetailLeft">
          <ProductImage images={product.images} productTitle={title} />
          <ProductDetailTabs
            tabTitles={tabTitles}
            tabContents={tabContents}
            headerNotice={t('product.aiNotice')}
          />
        </div>

        <div className="productDetailRight">
          <div className="product-main productPurchaseCard">
            <section className="productPurchaseCardIntro">
              <h1 className="productDetailTitle">{title}</h1>
              <p className="productPurchaseNote">
                {t('product.trimNotice')}
              </p>

              {materialStartingPrice && (
                <div
                  className="productStartingPrice"
                  aria-label={t('product.startingPriceLabel')}
                >
                  <span className="productStartingPriceLabel">
                    {t('product.startingPrice')}
                  </span>
                  <strong className="productStartingPriceAmount">
                    {formatMaterialPrice(
                      materialStartingPrice.amount,
                      materialStartingPrice.currencyCode,
                    )}
                  </strong>
                  <span className="productStartingPriceUnit">
                    {t('product.perSquareMeter')}
                  </span>
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
              <ProductSize
                onChange={setSize}
                widthError={widthError}
                heightError={heightError}
              />

              <div className="productOrderSummary" aria-live="polite">
                <div className="productOrderSummaryItem">
                  <span className="productOrderSummaryLabel">
                    {t('product.wallArea')}
                  </span>
                  <strong className="productOrderSummaryValue">
                    {wallAreaM2 > 0 ? `${formattedWallArea} m²` : '— m²'}
                  </strong>
                </div>
                <div className="productOrderSummaryItem productOrderSummaryItemPrice">
                  <span className="productOrderSummaryLabel">
                    {t('product.priceFrom')}
                  </span>
                  <strong className="productOrderSummaryValue">
                    {wallAreaM2 > 0 && startingTotalPrice
                      ? formatMaterialPrice(
                          Number(startingTotalPrice.amount),
                          startingTotalPrice.currencyCode,
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
                onConfigure={() => {
                  setShowSizeErrors(false);
                  setIsConfiguring(true);
                }}
                onSizeValidationError={() => setShowSizeErrors(true)}
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
    </div>
  );
}
