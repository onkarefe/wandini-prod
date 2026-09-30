import {CartForm, Image} from '@shopify/hydrogen';
import {useId, useState} from 'react';
import type {FetcherWithComponents} from 'react-router';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {formatLocaleCurrency} from '~/lib/locale-format';
import type {SelectedLocale} from '~/lib/locale';
import {
  getCartUpsellButtonState,
  getCartUpsellSelectorLabel,
  getCartUpsellVariantLabel,
  resolveCartUpsellVariant,
  type CartUpsellVariant,
} from '~/lib/cart-upsell';

type CartUpsellImage = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

type CartUpsellPrice = {
  amount: string;
  currencyCode: string;
};

export type CartUpsellProduct = {
  id: string;
  handle: string;
  title: string;
  image: CartUpsellImage | null;
  variants: CartUpsellVariant[];
};

function formatPrice(
  price: CartUpsellPrice | null | undefined,
  locale: SelectedLocale,
) {
  if (!price) return null;

  const amount = Number(price.amount);

  if (!Number.isFinite(amount)) {
    return `${price.amount} ${price.currencyCode}`;
  }

  return formatLocaleCurrency(amount, price.currencyCode, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function CartUpsellAddButton({
  productTitle,
  selectedVariant,
}: {
  productTitle: string;
  selectedVariant: CartUpsellVariant | null;
}) {
  const {t} = useTranslation();
  const cartPath = usePrefixPathWithLocale('/cart');

  if (!selectedVariant) {
    return (
      <button className="cart-upsell-card__button" type="button" disabled>
        {t('product.unavailable')}
      </button>
    );
  }

  return (
    <CartForm
      route={cartPath}
      action={CartForm.ACTIONS.LinesAdd}
      inputs={{
        lines: [{merchandiseId: selectedVariant.id, quantity: 1}],
      }}
    >
      {(fetcher: FetcherWithComponents<unknown>) => {
        const isPending = fetcher.state !== 'idle';
        const {disabled, labelKey} = getCartUpsellButtonState(
          selectedVariant,
          isPending,
        );

        return (
          <button
            className="cart-upsell-card__button"
            type="submit"
            disabled={disabled}
            aria-label={`${productTitle}: ${t(labelKey)}`}
          >
            {t(labelKey)}
          </button>
        );
      }}
    </CartForm>
  );
}

function CartUpsellProductCard({product}: {product: CartUpsellProduct}) {
  const {locale, t} = useTranslation();
  const selectId = useId();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => product.variants[0]?.id ?? null,
  );
  const selectedVariant = resolveCartUpsellVariant(
    product.variants,
    selectedVariantId,
  );
  // Reconcile removed IDs before rendering children; availability changes
  // alone must never change the customer's selection.
  if (selectedVariantId !== (selectedVariant?.id ?? null)) {
    setSelectedVariantId(selectedVariant?.id ?? null);
  }
  const priceLabel = formatPrice(selectedVariant?.price, locale);

  return (
    <article className="cart-upsell-card">
      <Link
        to={`/products/${product.handle}`}
        className="cart-upsell-card__product-link"
        aria-label={product.title}
        prefetch="intent"
      >
        <div className="cart-upsell-card__media">
          {product.image ? (
            <Image
              className="cart-upsell-card__image"
              data={product.image}
              alt={product.image.altText || product.title}
              sizes="(min-width: 1200px) 240px, (min-width: 768px) 50vw, 100vw"
              loading="lazy"
            />
          ) : (
            <span
              className="cart-upsell-card__image-placeholder"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="cart-upsell-card__body">
          <h3>{product.title}</h3>
          {priceLabel ? <p>{priceLabel}</p> : null}
        </div>
      </Link>

      <div className="cart-upsell-card__footer">
        {product.variants.length > 1 ? (
          <div className="cart-upsell-card__variant">
            <label
              className="cart-upsell-card__variant-label"
              htmlFor={selectId}
            >
              {getCartUpsellSelectorLabel(
                product.variants,
                t('product.variant'),
              )}
            </label>
            <select
              className="cart-upsell-card__variant-select"
              id={selectId}
              value={selectedVariant?.id ?? ''}
              onChange={(event) =>
                setSelectedVariantId(event.currentTarget.value)
              }
            >
              {product.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {getCartUpsellVariantLabel(variant)}
                  {variant.availableForSale
                    ? ''
                    : ` — ${t('product.unavailable')}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <CartUpsellAddButton
          productTitle={product.title}
          selectedVariant={selectedVariant}
        />
      </div>
    </article>
  );
}

export function CartUpsellCard({products}: {products: CartUpsellProduct[]}) {
  const {t} = useTranslation();
  if (products.length === 0) return null;

  return (
    <section className="cart-upsell" aria-labelledby="cart-upsell-heading">
      <div className="cart-upsell__header">
        <p>{t('cart.upsellEyebrow')}</p>
        <h2 id="cart-upsell-heading">{t('cart.upsellTitle')}</h2>
      </div>

      <div className="cart-upsell__grid">
        {products.map((product) => (
          <CartUpsellProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
