import {CartForm, Image} from '@shopify/hydrogen';
import type {FetcherWithComponents} from 'react-router';
import {Link} from '~/lib/i18n-router';

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

function formatPrice(price?: CartUpsellPrice | null) {
  if (!price) return null;

  const amount = Number(price.amount);

  if (!Number.isFinite(amount)) {
    return `${price.amount} ${price.currencyCode}`;
  }

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${price.amount} ${price.currencyCode}`;
  }
}

function CartUpsellAddButton({product}: {product: CartUpsellProduct}) {
  const variant = product.variant;

  if (!variant) {
    return (
      <button className="cart-upsell-card__button" type="button" disabled>
        Nicht verfügbar
      </button>
    );
  }

  return (
    <CartForm
      route="/cart"
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
            aria-label={`${product.title} in den Warenkorb`}
          >
            {isPending
              ? 'Wird hinzugefügt …'
              : variant.availableForSale
                ? 'In den Warenkorb'
                : 'Nicht verfügbar'}
          </button>
        );
      }}
    </CartForm>
  );
}

function CartUpsellProductCard({product}: {product: CartUpsellProduct}) {
  const priceLabel = formatPrice(product.variant?.price);

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
  if (products.length === 0) return null;

  return (
    <section className="cart-upsell" aria-labelledby="cart-upsell-heading">
      <div className="cart-upsell__header">
        <p>Für Ihre Bestellung</p>
        <h2 id="cart-upsell-heading">Passendes Zubehör</h2>
      </div>

      <div className="cart-upsell__grid">
        {products.map((product) => (
          <CartUpsellProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
