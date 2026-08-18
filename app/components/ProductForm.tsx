import {useState} from 'react';
import {useNavigate} from 'react-router';
import { type MappedProductOptions } from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import { AddToCartButton } from './AddToCartButton';
import { useAside } from './Aside';
import type { ProductFragment } from 'storefrontapi.generated';
import {Link} from '~/lib/i18n-router';
import {
  CONFIGURATOR_PAYLOAD_ATTRIBUTE,
  CONFIGURATOR_INSTANCE_ATTRIBUTE,
  createConfiguratorPayload,
  createConfiguratorInstanceId,
  resolveConfiguratorPricePerM2,
} from '~/lib/configurator-pricing';

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
  masterAssetId,
  showInlineAddToCart = false,
  showQualityOptions = true,
}: {
  productOptions: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  size: { width: number; height: number };
  crop?: CropRect | null;
  isConfiguring: boolean;
  onConfigure: () => void;
  masterAssetId?: string;
  showInlineAddToCart?: boolean;
  showQualityOptions?: boolean;
}) {
  const navigate = useNavigate();
  const { open } = useAside();
  const [configurationInstanceId, setConfigurationInstanceId] = useState(
    createConfiguratorInstanceId,
  );

  // -----------------------------
  // QUALITY PROPERTIES (UNCHANGED)
  // -----------------------------
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

  // -----------------------------
  // VALIDATION
  // -----------------------------
  const isSizeValid = size.width > 0 && size.height > 0;

  const configuratorPayload = createConfiguratorPayload({
    widthCm: size.width,
    heightCm: size.height,
    crop,
    masterAssetId,
  });

  if (!selectedVariant) {
    return null;
  }

  return (
    <div className="product-form">
      {productOptions.map((option) => {
        if (option.optionValues.length === 1) return null;

        // -------- QUALITY / MATERIAL --------
        if (option.name.toLowerCase() === 'quality') {
          if (!showQualityOptions) return null;

          return (
            <div className="product-options" key={option.name}>
              <h5>Material auswählen</h5>
              <div>
                {option.optionValues.map((value) => {
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
                      const resolvedPrice = resolveConfiguratorPricePerM2(
                        (v as any).printQuality?.reference?.pricePerM2?.value,
                        v.price.amount,
                      );
                      m2Price = resolvedPrice
                        ? Number(resolvedPrice).toFixed(2)
                        : null;
                      m2Currency = v.price.currencyCode;
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
                        <span style={{ fontWeight: 'bold' }}>{title}</span>
                        {!!m2Price && (
                          <span style={{ marginLeft: 'auto' }}>
                            {m2Price} {m2Currency} /m²
                          </span>
                        )}
                        {ratio && <span>({ratio})</span>}
                      </div>
                      <ul className="propertyBox">
                        {propertyList.map((p: string) => (
                          <li key={`${name}-${p}`}>{p}</li>
                        ))}
                      </ul>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }

        // -------- OTHER OPTIONS --------
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
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;

                if (isDifferentProduct) {
                  return (
                    <Link
                      key={name}
                      to={`/products/${handle}?${variantUriQuery}`}
                      replace
                      preventScrollReset
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                }

                return (
                  <button
                    key={name}
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
              })}
            </div>
          </div>
        );
      })}

      {/* CONFIGURE */}
      {!isConfiguring && (
        <button
          className="customAddToCartButton"
          type="button"
          disabled={!isSizeValid}
          onClick={onConfigure}
        >
          Jetzt konfigurieren
        </button>
      )}

      {/* ADD TO CART */}
      {showInlineAddToCart && isConfiguring && configuratorPayload && (
        <AddToCartButton
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          onClick={() => open('cart')}
          onSuccess={() =>
            setConfigurationInstanceId(createConfiguratorInstanceId())
          }
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
          In den Warenkorb
        </AddToCartButton>
      )}
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch>;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return name;

  return (
    <div aria-label={name} style={{ backgroundColor: color || 'transparent' }}>
      {!!image && <img src={image} alt={name} />}
    </div>
  );
}
