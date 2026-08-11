import {useEffect, useState} from 'react';
import {useFetcher, useLocation} from 'react-router';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';

type ProductImage = {
  url: string;
  altText?: string | null;
};

type ProductPrice = {
  amount: string;
  currencyCode: string;
};

type ZubehorProductCardProps = {
  productId: string;
  handle: string;
  title: string;
  image: ProductImage | null;
  minPrice: ProductPrice | null;
  isLoggedIn: boolean;
  isWishlisted: boolean;
};

function HeartOutlineIcon() {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <path d="M442.9 144C415.6 144 389.9 157.1 373.9 179.2L339.5 226.8C335 233 327.8 236.7 320.1 236.7C312.4 236.7 305.2 233 300.7 226.8L266.3 179.2C250.3 157.1 224.6 144 197.3 144C150.3 144 112.2 182.1 112.2 229.1C112.2 279 144.2 327.5 180.3 371.4C221.4 421.4 271.7 465.4 306.2 491.7C309.4 494.1 314.1 495.9 320.2 495.9C326.3 495.9 331 494.1 334.2 491.7C368.7 465.4 419 421.3 460.1 371.4C496.3 327.5 528.2 279 528.2 229.1C528.2 182.1 490.1 144 443.1 144zM335 151.1C360 116.5 400.2 96 442.9 96C516.4 96 576 155.6 576 229.1C576 297.7 533.1 358 496.9 401.9C452.8 455.5 399.6 502 363.1 529.8C350.8 539.2 335.6 543.9 320 543.9C304.4 543.9 289.2 539.2 276.9 529.8C240.4 502 187.2 455.5 143.1 402C106.9 358.1 64 297.7 64 229.1C64 155.6 123.6 96 197.1 96C239.8 96 280 116.5 305 151.1L320 171.8L335 151.1z" />
    </svg>
  );
}

function HeartFilledIcon() {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <path d="M305 151.1L320 171.8L335 151.1C360 116.5 400.2 96 442.9 96C516.4 96 576 155.6 576 229.1L576 231.7C576 343.9 436.1 474.2 363.1 529.9C350.7 539.3 335.5 544 320 544C304.5 544 289.2 539.4 276.9 529.9C203.9 474.2 64 343.9 64 231.7L64 229.1C64 155.6 123.6 96 197.1 96C239.8 96 280 116.5 305 151.1z" />
    </svg>
  );
}

function formatPriceLabel(price: ProductPrice | null) {
  if (!price) {
    return null;
  }

  const amount = Number(price.amount);
  const numericAmount = Number.isFinite(amount) ? amount : 0;

  try {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);

    return formattedAmount;
  } catch {
    return `${price.amount} ${price.currencyCode}`;
  }
}

export function ZubehorProductCard({
  productId,
  handle,
  title,
  image,
  minPrice,
  isLoggedIn,
  isWishlisted,
}: ZubehorProductCardProps) {
  const fetcher = useFetcher<{
    ok?: boolean;
    loginUrl?: string;
    wishlisted?: boolean;
  }>();
  const location = useLocation();
  const loginPath = usePrefixPathWithLocale('/account/login');
  const [wishlisted, setWishlisted] = useState(isWishlisted);
  const priceLabel = formatPriceLabel(minPrice);
  const isPending = fetcher.state !== 'idle';

  useEffect(() => {
    setWishlisted(isWishlisted);
  }, [isWishlisted, productId]);

  useEffect(() => {
    if (fetcher.data?.loginUrl) {
      window.location.href = fetcher.data.loginUrl;
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!fetcher.data?.ok || typeof fetcher.data.wishlisted !== 'boolean') {
      return;
    }

    setWishlisted(fetcher.data.wishlisted);
  }, [fetcher.data]);

  const wishlistButtonLabel = isPending
    ? 'Favoriten werden aktualisiert'
    : wishlisted
      ? 'Aus Favoriten entfernen'
      : 'Zu Favoriten hinzufügen';

  const handleWishlistClick = () => {
    if (isPending) {
      return;
    }

    if (!isLoggedIn) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      window.location.href = `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    void fetcher.submit(formData, {
      method: 'post',
      action: '/api/wishlist',
    });
  };

  return (
    <article className="zubehor-product-card">
      <Link
        to={`/products/${handle}`}
        className="zubehor-product-card__link"
        aria-label={title}
      >
        <div className="zubehor-product-card__media">
          {image ? (
            <img
              src={image.url}
              alt={image.altText || title}
              className="zubehor-product-card__image"
              loading="lazy"
            />
          ) : (
            <span
              className="zubehor-product-card__image-placeholder"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="zubehor-product-card__body">
          <h2 className="zubehor-product-card__title">{title}</h2>
          {priceLabel ? (
            <p className="zubehor-product-card__price">{priceLabel}</p>
          ) : null}
        </div>
      </Link>

      <button
        type="button"
        className={`zubehor-product-card__wishlist ${
          wishlisted ? 'is-active' : ''
        } ${isPending ? 'is-pending' : ''}`}
        onClick={handleWishlistClick}
        disabled={isPending}
        aria-label={wishlistButtonLabel}
        data-tooltip={wishlistButtonLabel}
      >
        {wishlisted ? <HeartFilledIcon /> : <HeartOutlineIcon />}
      </button>
    </article>
  );
}
