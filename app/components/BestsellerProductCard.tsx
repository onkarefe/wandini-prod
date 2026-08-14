import {useCallback, useEffect, useState, type MouseEvent} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {Link, useFetcher, useLocation, useNavigate} from 'react-router';

type ProductPrice = {
  amount: string;
  currencyCode: string;
};

type BestsellerProductCardProps = {
  productId: string;
  title: string;
  images: Array<{url: string; altText?: string}>;
  productUrl: string;
  minPrice?: ProductPrice;
  isLoggedIn?: boolean;
  isWishlisted?: boolean;
  showSimilarMotifsButton?: boolean;
  similarProductsUrl?: string;
  similarProductsSourceTitle?: string;
  similarProductsSourceImageUrl?: string;
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

function SimilarMotifsIcon() {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <path d="M352 528L128 528C119.2 528 112 520.8 112 512L112 288C112 279.2 119.2 272 128 272L176 272L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L368 464L368 512C368 520.8 360.8 528 352 528zM288 368C279.2 368 272 360.8 272 352L272 128C272 119.2 279.2 112 288 112L512 112C520.8 112 528 119.2 528 128L528 352C528 360.8 520.8 368 512 368L288 368zM224 352C224 387.3 252.7 416 288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352z" />
    </svg>
  );
}

function ArrowIcon({direction}: {direction: 'previous' | 'next'}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={direction === 'previous' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
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

    return `${formattedAmount}/m²`;
  } catch {
    return `${fallbackAmount} ${price.currencyCode}/m²`;
  }
}

export default function BestsellerProductCard({
  productId,
  title,
  images,
  productUrl,
  minPrice,
  isLoggedIn = false,
  isWishlisted = false,
  showSimilarMotifsButton = false,
  similarProductsUrl,
  similarProductsSourceTitle,
  similarProductsSourceImageUrl,
}: BestsellerProductCardProps) {
  const displayImages = images.slice(0, 3);
  const fetcher = useFetcher<{
    ok?: boolean;
    loginUrl?: string;
    wishlisted?: boolean;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: displayImages.length > 1,
    align: 'start',
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [wishlisted, setWishlisted] = useState(isWishlisted);
  const priceLabel = formatPriceLabel(minPrice);
  const hasMultipleImages = displayImages.length > 1;

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);

    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

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

  const handleWishlistClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      window.location.href = `/account/login?return_to=${encodeURIComponent(returnTo)}`;
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('desiredWishlisted', String(!wishlisted));
    void fetcher.submit(formData, {
      method: 'post',
      action: '/api/wishlist',
    });
  };

  const isWishlistPending = fetcher.state !== 'idle';
  const wishlistLabel = wishlisted
    ? 'Aus Favoriten entfernen'
    : isWishlistPending
      ? 'Favoriten werden aktualisiert'
      : 'Zu Favoriten hinzufügen';
  const similarMotifsLabel = 'Ähnliche Motive anzeigen';

  return (
    <article
      className="bestseller-card"
      aria-labelledby={`product-${productId}`}
    >
      <div className="bestseller-card__media-shell">
        <div className="bestseller-card__actions">
          <button
            type="button"
            className={`bestseller-card__action bestseller-card__wishlist ${
              wishlisted ? 'is-active' : ''
            }`}
            onClick={handleWishlistClick}
            disabled={isWishlistPending}
            aria-label={wishlistLabel}
            aria-pressed={wishlisted}
            title={wishlistLabel}
          >
            {wishlisted ? <HeartFilledIcon /> : <HeartOutlineIcon />}
          </button>

          {showSimilarMotifsButton && similarProductsUrl ? (
            <button
              type="button"
              className="bestseller-card__action bestseller-card__similar"
              aria-label={similarMotifsLabel}
              title={similarMotifsLabel}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void navigate(similarProductsUrl, {
                  state: {
                    sourceProductTitle: similarProductsSourceTitle ?? title,
                    sourceProductImageUrl:
                      similarProductsSourceImageUrl ?? images[0]?.url ?? null,
                  },
                });
              }}
            >
              <SimilarMotifsIcon />
            </button>
          ) : null}
        </div>

        <div className="bestseller-card__viewport" ref={emblaRef}>
          <div className="bestseller-card__slides">
            {displayImages.length > 0 ? (
              displayImages.map((image) => (
                <div className="bestseller-card__slide" key={image.url}>
                  <Link
                    to={productUrl}
                    className="bestseller-card__image-link"
                    aria-label={`${title} ansehen`}
                  >
                    <img
                      src={image.url}
                      alt={image.altText || title}
                      className="bestseller-card__image"
                      loading="lazy"
                      draggable={false}
                    />
                  </Link>
                </div>
              ))
            ) : (
              <div className="bestseller-card__slide">
                <Link
                  to={productUrl}
                  className="bestseller-card__image-link bestseller-card__image-placeholder"
                  aria-label={`${title} ansehen`}
                />
              </div>
            )}
          </div>
        </div>

        {hasMultipleImages ? (
          <>
            <button
              type="button"
              className="bestseller-card__arrow bestseller-card__arrow--previous"
              aria-label="Vorheriges Produktbild"
              onClick={() => emblaApi?.scrollPrev()}
            >
              <ArrowIcon direction="previous" />
            </button>
            <button
              type="button"
              className="bestseller-card__arrow bestseller-card__arrow--next"
              aria-label="Nächstes Produktbild"
              onClick={() => emblaApi?.scrollNext()}
            >
              <ArrowIcon direction="next" />
            </button>

            <div className="bestseller-card__dots" aria-label="Produktbilder">
              {displayImages.map((image, imageIndex) => (
                <button
                  key={`${image.url}-dot`}
                  type="button"
                  aria-label={`Zu Bild ${imageIndex + 1} wechseln`}
                  aria-current={
                    imageIndex === selectedIndex ? 'true' : undefined
                  }
                  className={`bestseller-card__dot ${
                    imageIndex === selectedIndex ? 'is-active' : ''
                  }`}
                  onClick={() => emblaApi?.scrollTo(imageIndex)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="bestseller-card__body">
        <div className="bestseller-card__details">
          <h2 className="bestseller-card__title" id={`product-${productId}`}>
            <Link to={productUrl}>{title}</Link>
          </h2>
          {priceLabel ? (
            <p className="bestseller-card__price">{priceLabel}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
