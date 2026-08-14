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
                priceWithoutDiscount?: {value?: string | null} | null;
              } | null;
            } | null;
          })
        | null
        | undefined;
      const amount = Number(variant?.price?.amount);

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

  const wallAreaM2 =
    size.width > 0 && size.height > 0 ? (size.width * size.height) / 10_000 : 0;
  const isSizeValid = size.width > 0 && size.height > 0;
  const billingUnitM2 = 0.01;
  const areaM2 = isSizeValid ? (size.width * size.height) / 10_000 : 0;
  const billingUnits = isSizeValid
    ? Math.max(1, Math.ceil(areaM2 / billingUnitM2))
    : 0;
  const startingTotalPrice = materialStartingPrice
    ? wallAreaM2 * materialStartingPrice.amount
    : 0;
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
      return value.firstSelectableVariant.printQuality.reference.properties.value.split(
        ' - ',
      );
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
      return selectedVariant.printQuality.reference.properties.value.split(
        ' - ',
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
            firstValue.firstSelectableVariant?.price?.amount,
          );
          const secondPrice = Number(
            secondValue.firstSelectableVariant?.price?.amount,
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
          const unitPrice = Number(variant?.price?.amount);
          const currencyCode = variant?.price?.currencyCode;
          const hasPrice =
            Number.isFinite(unitPrice) &&
            unitPrice >= 0 &&
            Boolean(currencyCode);

          return {
            id: `${qualityOption.name}-${name}`,
            title: optionTitle,
            calculatedPrice:
              hasPrice && isSizeValid
                ? formatMaterialPrice(unitPrice * areaM2, String(currencyCode))
                : '—',
            properties: getPropertiesForQuality(value),
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
    </div>
  );
}
