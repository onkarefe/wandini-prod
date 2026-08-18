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
  calculateConfiguredWallpaperPrice,
  calculateConfiguratorAreaM2,
  createConfiguratorPayload,
  createConfiguratorInstanceId,
  resolveConfiguratorPricePerM2,
} from '~/lib/configurator-pricing';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
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
  const cartPath = usePrefixPathWithLocale('/cart');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [size, setSize] = useState({width: 0, height: 0});
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

  const materialStartingPrice = productOptions
    .find((option) => option.name.toLowerCase() === 'quality')
    ?.optionValues.map((value) => {
      const variant = value.firstSelectableVariant as
        | (NonNullable<typeof value.firstSelectableVariant> & {
            printQuality?: {
              reference?: {
                pricePerM2?: {value?: string | null} | null;
                priceWithoutDiscount?: {value?: string | null} | null;
              } | null;
            } | null;
          })
        | null
        | undefined;
      const pricePerM2 = resolveConfiguratorPricePerM2(
        variant?.printQuality?.reference?.pricePerM2?.value,
        variant?.price?.amount,
      );
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
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const wallAreaM2 = calculateConfiguratorAreaM2(size.width, size.height);
  const isSizeValid = size.width > 0 && size.height > 0;
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
  const formattedWallArea = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(wallAreaM2);

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
      selectedVariant?.printQuality?.reference?.title?.value === value.name &&
      selectedVariant?.printQuality?.reference?.properties?.value
    ) {
      return splitMaterialProperties(
        selectedVariant.printQuality.reference.properties.value,
      );
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
              (firstValue.firstSelectableVariant as any)?.printQuality?.reference
                ?.pricePerM2?.value,
              firstValue.firstSelectableVariant?.price?.amount,
            ),
          );
          const secondPrice = Number(
            resolveConfiguratorPricePerM2(
              (secondValue.firstSelectableVariant as any)?.printQuality
                ?.reference?.pricePerM2?.value,
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
          const pricePerM2 = resolveConfiguratorPricePerM2(
            printQuality?.pricePerM2?.value,
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
            id: `${qualityOption.name}-${name}`,
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
            isBestseller: optionTitle
              .trim()
              .toLowerCase()
              .includes('selbstklebend'),
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
        Bestätigen &amp; in den Warenkorb
      </AddToCartButton>
    ) : null;

  const tabTitles = [
    'Beschreibung',
    'Produktinformationen',
    'Lieferung & Versand',
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
      <p key="nodesc">Açıklama yok.</p>
    ),
    productInfoContent || <p key="noinfo">Ürün bilgisi bulunamadı.</p>,
    deliveryAndShippingContent || (
      <p key="noshipping">Teslimat &amp; kargo bilgisi yok.</p>
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
            headerNotice="Mit KI & Kreativität gestaltet. Motive und Visualisierungen können teilweise oder vollständig KI-generiert oder KI-bearbeitet sein."
          />
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
    </div>
  );
}
