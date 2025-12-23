import { Link, useNavigate } from 'react-router';
import { type MappedProductOptions } from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import { AddToCartButton } from './AddToCartButton';
import { useAside } from './Aside';
import type { ProductFragment } from 'storefrontapi.generated';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function ProductForm({
  productOptions,
  selectedVariant,
  size,
  crop,
  isConfiguring,
  onConfigure,
}: {
  productOptions: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  size: { width: number; height: number };
  crop?: CropRect | null;
  isConfiguring: boolean;
  onConfigure: () => void;
}) {
  const navigate = useNavigate();
  const { open } = useAside();

  // Quality opsiyonu için, her value'nun property bilgisini bulmak için yardımcı fonksiyon
  function getPropertiesForQuality(value: any) {
    // Öncelik: firstSelectableVariant.printQuality.reference.properties.value
    if (value?.firstSelectableVariant?.printQuality?.reference?.properties?.value) {
      return value.firstSelectableVariant.printQuality.reference.properties.value.split(' - ');
    }
    // Sonra: value.printQuality.reference.properties.value
    if (value?.printQuality?.reference?.properties?.value) {
      return value.printQuality.reference.properties.value.split(' - ');
    }
    // Sonra: value.properties.value
    if (value?.properties && value.properties.value) {
      return value.properties.value.split(' - ');
    }
    // En son: seçili varyant fallback
    if (
      selectedVariant?.printQuality?.reference?.title?.value === value.name &&
      selectedVariant?.printQuality?.reference?.properties?.value
    ) {
      return selectedVariant.printQuality.reference.properties.value.split(' - ');
    }
    return [];
  }

  // Check if size is valid
  const isSizeValid = size.width > 0 && size.height > 0;

  // ---- Area / billing unit hesaplaması (cm -> m² -> 0.01 m² units) ----
  const BILLING_UNIT_M2 = 0.01;

  const areaM2 = isSizeValid
    ? (size.width * size.height) / 10_000 // cm² -> m²
    : 0;

  const billingUnits = isSizeValid
    ? Math.max(1, Math.ceil(areaM2 / BILLING_UNIT_M2)) // 0.01 m² birimi
    : 0;

  return (
    <div className="product-form">
      {productOptions.map((option) => {
        if (option.optionValues.length === 1) return null;

        if (option.name.toLowerCase() === 'quality') {
          return (
            <div className="product-options" key={option.name}>
              {/* <h5>{option.name}</h5> orjinal başlık */}
              <h5>Select Material</h5>
              <div>
                {option.optionValues.map((value) => {
                  const {
                    name,
                    variantUriQuery,
                    selected,
                    exists,
                  } = value;

                  let printQuality: any = undefined;
                  let m2Price: string | null = null;
                  let m2Currency = '';

                  if (value?.firstSelectableVariant) {
                    const v = value.firstSelectableVariant;

                    if ((v as any).printQuality?.reference) {
                      printQuality = (v as any).printQuality.reference;
                    }

                    // UI'da gösterilecek m² fiyatını hesapla (variant.price = 0.01 m² fiyatı)
                    if (v.price?.amount && v.price?.currencyCode) {
                      const unitPrice = Number(v.price.amount); // 0.01 m² fiyatı (ör: 1, 2, 3)
                      if (!Number.isNaN(unitPrice)) {
                        const displayPricePerM2 = (unitPrice * 100).toFixed(2); // m² fiyatı
                        m2Price = displayPricePerM2;
                        m2Currency = v.price.currencyCode;
                      }
                    }
                  }

                  const ratio = printQuality?.ratio?.value || '';
                  const title = printQuality?.title?.value || name;
                  const propertyList = getPropertiesForQuality(value);

                  return (
                    <label
                      key={option.name + name}
                      className={`propertyLabelBox${selected ? ' selectedVariant' : ''}`}
                    >
                      <div className="propertyRatioTitle">
                        <input
                          type="radio"
                          name="quality"
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
                        <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
                          {title}
                        </span>
                        {!!m2Price && (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: '1em',
                              color: '#222',
                            }}
                          >
                            {m2Price} {m2Currency} /m²
                          </span>
                        )}
                        {ratio && (
                          <span
                            style={{
                              marginLeft: '0.5em',
                              fontSize: '0.95em',
                              color: '#888',
                            }}
                          >
                            ({ratio})
                          </span>
                        )}
                      </div>
                      <ul className="propertyBox">
                        {propertyList.length > 0 &&
                          propertyList.map((prop: string, i: number) => (
                            <li key={i}>{prop}</li>
                          ))}
                      </ul>
                    </label>
                  );
                })}
              </div>
              <br />
            </div>
          );
        }

        // Diğer opsiyonlar için klasik render
        return (
          <div className="product-options" key={option.name}>
            <h5>{option.name}</h5>
            <div className="product-options-grid">
              {option.optionValues.map((value) => {
                const {
                  name,
                  handle,
                  variantUriQuery,
                  selected,
                  available,
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;
                if (isDifferentProduct) {
                  return (
                    <Link
                      className="product-options-item"
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={`/products/${handle}?${variantUriQuery}`}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                } else {
                  return (
                    <button
                      type="button"
                      className={`product-options-item${
                        exists && !selected ? ' link' : ''
                      }`}
                      key={option.name + name}
                      disabled={!exists}
                      onClick={() => {
                        if (!selected) {
                          void navigate(`?${variantUriQuery}`, {
                            replace: true,
                            preventScrollReset: true,
                          });
                        }
                      }}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </button>
                  );
                }
              })}
            </div>
            <br />
          </div>
        );
      })}

      {/* Configure Now button, only show if not configuring yet */}
      {!isConfiguring && (
        <button
          type="button"
          className="customAddToCartButton"
          disabled={!isSizeValid}
          style={{
            width: '100%',
            marginTop: '1rem',
            fontWeight: 'bold',
            fontSize: '1.1em',
          }}
          onClick={onConfigure}
        >
          Configure Now
        </button>
      )}

      {/* Show AddToCartButton only after configuring */}
      {isConfiguring && (
        <AddToCartButton
          disabled={
            !selectedVariant ||
            !selectedVariant.availableForSale ||
            !isSizeValid
          }
          onClick={() => {
            open('cart');
          }}
          lines={
            selectedVariant && billingUnits > 0
              ? [
                  {
                    merchandiseId: selectedVariant.id,
                    quantity: billingUnits,
                    attributes: [
                      {
                        key: 'width_cm',
                        value: String(size.width),
                      },
                      {
                        key: 'height_cm',
                        value: String(size.height),
                      },
                      {
                        key: 'area_m2',
                        value: areaM2.toFixed(2),
                      },
                      {
                        key: 'billing_unit_m2',
                        value: BILLING_UNIT_M2.toString(),
                      },
                      ...(crop
                        ? [
                            {
                              key: 'crop_x',
                              value: String(Math.round(crop.x)),
                            },
                            {
                              key: 'crop_y',
                              value: String(Math.round(crop.y)),
                            },
                            {
                              key: 'crop_w',
                              value: String(Math.round(crop.w)),
                            },
                            {
                              key: 'crop_h',
                              value: String(Math.round(crop.h)),
                            },
                          ]
                        : []),
                    ],
                    selectedVariant,
                  },
                ]
              : []
          }
        >
          {selectedVariant?.availableForSale
            ? 'Add to Shopping Cart'
            : 'Sold out'}
        </AddToCartButton>
      )}
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch> | undefined;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return name;

  return (
    <div
      aria-label={name}
      className="product-option-label-swatch"
      style={{
        backgroundColor: color || 'transparent',
      }}
    >
      {!!image && <img src={image} alt={name} />}
    </div>
  );
}
