import {CartForm, Image} from '@shopify/hydrogen';
import type {FetcherWithComponents} from 'react-router';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {formatLocaleCurrency} from '~/lib/locale-format';
import type {SelectedLocale} from '~/lib/locale';

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

type CartUpsellVariant = {
  id: string;
  availableForSale: boolean;
  price: CartUpsellPrice;
};

export type CartUpsellProduct = {
  id: string;
  handle: string;
  title: string;
  image: CartUpsellImage | null;
  variant: CartUpsellVariant | null;
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

function CartUpsellAddButton({product}: {product: CartUpsellProduct}) {
  const {t} = useTranslation();
  const cartPath = usePrefixPathWithLocale('/cart');
  const variant = product.variant;

  if (!variant) {
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
        lines: [{merchandiseId: variant.id, quantity: 1}],
      }}
    >
      {(fetcher: FetcherWithComponents<unknown>) => {
        const isPending = fetcher.state !== 'idle';
        const isDisabled = !variant.availableForSale || isPending;

        return (
          <button
            className="cart-upsell-card__button"
            type="submit"
            disabled={isDisabled}
            aria-label={`${product.title}: ${t('product.addToCart')}`}
          >
            {isPending
              ? t('cart.adding')
              : variant.availableForSale
                ? t('product.addToCart')
                : t('product.unavailable')}
          </button>
        );
      }}
    </CartForm>
  );
}

function CartUpsellProductCard({product}: {product: CartUpsellProduct}) {
  const {locale} = useTranslation();
  const priceLabel = formatPrice(product.variant?.price, locale);

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
        <CartUpsellAddButton product={product} />
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
