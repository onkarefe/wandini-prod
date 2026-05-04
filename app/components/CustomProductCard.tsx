import React, {useCallback, useEffect, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {useFetcher, useLocation} from 'react-router';
import '../styles/customProductCard.css';

type ProductPrice = {
  amount: string;
  currencyCode: string;
};

interface CustomProductCardProps {
  productId: string;
  title: string;
  images: { url: string; altText?: string }[];
  productUrl: string;
  minPrice?: ProductPrice;
  isLoggedIn?: boolean;
}

function formatPriceLabel(price?: ProductPrice): string | null {
  if (!price) return null;

  const amount = Number(price.amount);
  const fallbackAmount = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', {
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : price.amount;

  try {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : Number(price.amount));

    return `${formattedAmount} / m²`;
  } catch {
    return `${fallbackAmount} ${price.currencyCode} / m²`;
  }
}

export const CustomProductCard: React.FC<CustomProductCardProps> = ({
  productId,
  title,
  images,
  productUrl,
  minPrice,
  isLoggedIn = false,
}) => {
  const displayImages = images.slice(0, 3);
  const fetcher = useFetcher<{
    ok?: boolean;
    loginUrl?: string;
    message?: string;
  }>();
  const location = useLocation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const priceLabel = formatPriceLabel(minPrice);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!fetcher.data?.loginUrl) return;
    window.location.href = fetcher.data.loginUrl;
  }, [fetcher.data]);

  const handleWishlistClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      window.location.href = `/account/login?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    fetcher.submit(formData, {
      method: 'post',
      action: '/api/wishlist',
    });
  };

  const wishlistButtonLabel =
    fetcher.state !== 'idle'
      ? 'Ekleniyor...'
      : fetcher.data?.ok
        ? 'Favoriye eklendi'
        : 'Favoriye ekle';

  const wishlistFeedback =
    fetcher.state !== 'idle'
      ? 'Istek gonderiliyor...'
      : fetcher.data?.message ?? null;

  const wishlistFeedbackClassName =
    fetcher.data?.ok
      ? 'custom-product-card__wishlist-feedback custom-product-card__wishlist-feedback--success'
      : 'custom-product-card__wishlist-feedback custom-product-card__wishlist-feedback--error';

  return (
    <a href={productUrl} className="custom-product-card" aria-label={title}>
      <div className="custom-product-card__media" ref={emblaRef}>
        <div className="custom-product-card__container">
          {displayImages.map((img) => (
            <div className="custom-product-card__slide" key={img.url}>
              <img
                src={img.url}
                alt={img.altText || title}
                className="custom-product-card__image"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="custom-product-card__dots">
        {displayImages.map((img, i) => (
          <button
            key={`dot-${img.url}`}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            className={
              'custom-product-card__dot' +
              (i === selectedIndex ? ' custom-product-card__dot--active' : '')
            }
            onClick={(e) => {
              e.preventDefault(); // kartın linkine tıklamayı engellemeden slider’ı kontrol et
              emblaApi?.scrollTo(i);
            }}
          />
        ))}
      </div>

      <div className="custom-product-card__body">
        <h3 className="custom-product-card__title">{title}</h3>
        {priceLabel ? (
          <p className="custom-product-card__price">{priceLabel}</p>
        ) : null}
        <button
          type="button"
          className="custom-product-card__wishlist"
          onClick={handleWishlistClick}
          disabled={fetcher.state !== 'idle'}
        >
          {wishlistButtonLabel}
        </button>
        {wishlistFeedback ? (
          <p className={wishlistFeedbackClassName}>{wishlistFeedback}</p>
        ) : null}
      </div>
    </a>
  );
};

export default CustomProductCard;
