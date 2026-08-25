import React, {useEffect, useState} from 'react';
import {useTranslation} from '~/i18n/useTranslation';
import {useFetcher, useLocation, useNavigate} from 'react-router';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {
  WISHLIST_UPDATE_UNAVAILABLE_MESSAGE,
  type WishlistActionData,
} from '~/lib/wishlist';
import '../styles/customProductCard.css';
import '../styles/wishlistFeedback.css';

type ProductPrice = {
  amount: string;
  currencyCode: string;
};

interface CustomProductCardProps {
  productId: string;
  title: string;
  images: { url: string; altText?: string }[];
  productUrl: string;
  showSimilarMotifsButton?: boolean;
  similarProductsUrl?: string;
  similarProductsSourceTitle?: string;
  similarProductsSourceImageUrl?: string;
  minPrice?: ProductPrice;
  isLoggedIn?: boolean;
  isWishlisted?: boolean;
  onWishlistChange?: (wishlisted: boolean) => void;
}

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

function SimilarMotifsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M352 528L128 528C119.2 528 112 520.8 112 512L112 288C112 279.2 119.2 272 128 272L176 272L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L368 464L368 512C368 520.8 360.8 528 352 528zM288 368C279.2 368 272 360.8 272 352L272 128C272 119.2 279.2 112 288 112L512 112C520.8 112 528 119.2 528 128L528 352C528 360.8 520.8 368 512 368L288 368zM224 352C224 387.3 252.7 416 288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352z" />
    </svg>
  );
}

function formatPriceLabel(price?: ProductPrice): string | null {
  if (!price) return null;

  const amount = Number(price.amount);

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${price.amount} ${price.currencyCode}`;
  }
}

export const CustomProductCard: React.FC<CustomProductCardProps> = ({
  productId,
  title,
  images,
  productUrl,
  showSimilarMotifsButton = false,
  similarProductsUrl,
  similarProductsSourceTitle,
  similarProductsSourceImageUrl,
  minPrice,
  isLoggedIn = false,
  isWishlisted = false,
  onWishlistChange,
}) => {
  const {t} = useTranslation();
  const primaryImage = images[0] ?? null;
  const listingImage = images[1] ?? primaryImage;
  const hasHoverImage = Boolean(
    primaryImage && listingImage && primaryImage.url !== listingImage.url,
  );
  const fetcher = useFetcher<WishlistActionData>();
  const location = useLocation();
  const navigate = useNavigate();
  const loginPath = usePrefixPathWithLocale('/account/login');
  const fetcherLoginUrl = usePrefixPathWithLocale(
    fetcher.data?.loginUrl ?? '',
  );
  const localizedSimilarProductsUrl = usePrefixPathWithLocale(
    similarProductsUrl ?? '',
  );
  const [wishlisted, setWishlisted] = useState(isWishlisted);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const priceLabel = formatPriceLabel(minPrice);

  useEffect(() => {
    setWishlisted(isWishlisted);
    setWishlistError(null);
  }, [isWishlisted, productId]);

  useEffect(() => {
    if (!fetcherLoginUrl) return;
    window.location.href = fetcherLoginUrl;
  }, [fetcherLoginUrl]);

  useEffect(() => {
    if (!fetcher.data) return;

    if (!fetcher.data.ok) {
      if (!fetcher.data.loginUrl) {
        setWishlistError(WISHLIST_UPDATE_UNAVAILABLE_MESSAGE);
      }
      return;
    }

    if (typeof fetcher.data.wishlisted !== 'boolean') {
      return;
    }

    setWishlistError(null);
    setWishlisted(fetcher.data.wishlisted);
    onWishlistChange?.(fetcher.data.wishlisted);
  }, [fetcher.data, onWishlistChange]);

  const handleWishlistClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setWishlistError(null);

    if (!isLoggedIn) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      window.location.href = `${loginPath}?return_to=${encodeURIComponent(returnTo)}`;
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('productTitle', title);
    formData.set('desiredWishlisted', String(!wishlisted));
    void fetcher.submit(formData, {
      method: 'post',
      action: '/api/wishlist',
    });
  };
  const isPending = fetcher.state !== 'idle';
  const wishlistButtonLabel = wishlisted
    ? t('productCard.removeFavorite')
    : isPending
      ? t('productCard.updatingFavorite')
      : t('productCard.addFavorite');
  const similarMotifsButtonLabel = t('productCard.similarMotifs');

  return (
    <Link to={productUrl} className="custom-product-card" aria-label={title}>
      <button
        type="button"
        className={`custom-product-card__wishlist ${
          wishlisted ? 'is-active' : ''
        } ${isPending ? 'is-pending' : ''}`}
        onClick={handleWishlistClick}
        disabled={isPending}
        aria-label={wishlistButtonLabel}
        data-tooltip={wishlistButtonLabel}
      >
        {wishlisted ? <HeartFilledIcon /> : <HeartOutlineIcon />}
      </button>
      {wishlistError ? (
        <span className="wishlist-card-feedback" role="status">
          {wishlistError}
        </span>
      ) : null}
      {showSimilarMotifsButton ? (
        <button
          type="button"
          className="custom-product-card__similar-motifs"
          aria-label={similarMotifsButtonLabel}
          data-tooltip={similarMotifsButtonLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();

            if (localizedSimilarProductsUrl) {
              void navigate(localizedSimilarProductsUrl, {
                state: {
                  sourceProductTitle: similarProductsSourceTitle ?? title,
                  sourceProductImageUrl:
                    similarProductsSourceImageUrl ?? images[0]?.url ?? null,
                },
              });
            }
          }}
        >
          <SimilarMotifsIcon />
        </button>
      ) : null}
      {listingImage ? (
        <div className="custom-product-card__media">
          <img
            src={listingImage.url}
            alt={listingImage.altText || title}
            className="custom-product-card__image custom-product-card__image--listing"
            loading="lazy"
            decoding="async"
          />
          {hasHoverImage && primaryImage ? (
            <img
              src={primaryImage.url}
              alt=""
              aria-hidden="true"
              className="custom-product-card__image custom-product-card__image--primary"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </div>
      ) : null}

      <div className="custom-product-card__body">
        <h3 className="custom-product-card__title">{title}</h3>
        {priceLabel ? (
          <p className="custom-product-card__price">
            Ab {priceLabel} / m²
          </p>
        ) : null}
      </div>
    </Link>
  );
};

export default CustomProductCard;
