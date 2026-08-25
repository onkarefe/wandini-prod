import {useCallback, useEffect, useMemo, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {useTranslation} from '~/i18n/useTranslation';

type CustomerReview = {
  id: string;
  customerName: string;
  customerComment: string;
  commentTitle: string;
  image: {
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  } | null;
  stars: unknown;
};

type CustomerRevsProps = {
  reviews?: CustomerReview[];
  sectionTitle?: string | null;
};

type StarState = 'full' | 'half' | 'empty';

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRatingValue(stars: unknown) {
  const fallbackMax = 5;

  if (!stars || typeof stars !== 'object') {
    const value = toNumber(stars);
    return value === null ? 0 : Math.min(Math.max(value, 0), fallbackMax);
  }

  const rating = stars as {
    value?: unknown;
    scale_max?: unknown;
  };
  const value = toNumber(rating.value);
  const max = toNumber(rating.scale_max) ?? fallbackMax;

  if (value === null || max <= 0) {
    return 0;
  }

  return Math.min(Math.max((value / max) * fallbackMax, 0), fallbackMax);
}

function getStarStates(rating: number) {
  const roundedRating = Math.round(rating * 2) / 2;

  return Array.from({length: 5}, (_, index) => {
    const starValue = index + 1;
    let state: StarState = 'empty';

    if (roundedRating >= starValue) {
      state = 'full';
    } else if (roundedRating >= starValue - 0.5) {
      state = 'half';
    }

    return {position: starValue, state};
  });
}

function StarIcon({state}: {state: StarState}) {
  return (
    <svg
      className={`customerReviewStar customerReviewStar--${state}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="customerReviewStar__base" width="24" height="24" />
      {state !== 'empty' ? (
        <rect
          className="customerReviewStar__fill"
          width={state === 'half' ? 12 : 24}
          height="24"
        />
      ) : null}
      <path
        className="customerReviewStar__shape"
        d="m12 3.45 2.58 5.24 5.78.84-4.18 4.07.99 5.75L12 16.63l-5.17 2.72.99-5.75-4.18-4.07 5.78-.84L12 3.45Z"
      />
    </svg>
  );
}

function CustomerReviewStars({rating}: {rating: number}) {
  const {t} = useTranslation();
  const starStates = getStarStates(rating);

  return (
    <div
      className="customerReviewStars"
      aria-label={t('reviews.rating', {rating})}
    >
      {starStates.map(({position, state}) => (
        <StarIcon key={position} state={state} />
      ))}
    </div>
  );
}

export default function CustomerRevs({
  reviews = [],
  sectionTitle,
}: CustomerRevsProps) {
  const {t} = useTranslation();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    loop: reviews.length > 3,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;

    return (
      reviews.reduce(
        (total, review) => total + getRatingValue(review.stars),
        0,
      ) / reviews.length
    );
  }, [reviews]);
  const scrollSnaps = useMemo(
    () => emblaApi?.scrollSnapList() ?? [],
    [emblaApi],
  );

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

  if (!reviews.length) {
    return null;
  }

  return (
    <section className="container CustomerRevs-section">
      {sectionTitle?.trim() ? (
        <div className="seperator">
          <h3>{sectionTitle.trim()}</h3>
        </div>
      ) : null}

      <div className="customerReviewsSummary">
        <CustomerReviewStars rating={averageRating} />
        <p>
          <strong>{averageRating.toFixed(1)}</strong>
          <span> / 5</span>
          <span
            className="customerReviewsSummary__separator"
            aria-hidden="true"
          >
            |
          </span>
          <span>
            {reviews.length}{' '}
            {reviews.length === 1 ? t('reviews.one') : t('reviews.many')}
          </span>
        </p>
      </div>

      <div className="customerReviewsCarousel" ref={emblaRef}>
        <div className="customerReviewsCarousel__container">
          {reviews.map((review) => {
            const rating = getRatingValue(review.stars);

            return (
              <div className="customerReviewsCarousel__slide" key={review.id}>
                <article className="customerReviewCard">
                  {review.image?.url ? (
                    <div className="customerReviewCard__imageBox">
                      <img
                        className="customerReviewCard__image"
                        src={review.image.url}
                        alt={review.image.altText ?? review.customerName}
                        width={review.image.width}
                        height={review.image.height}
                        loading="lazy"
                      />
                    </div>
                  ) : null}

                  <div className="customerReviewCard__content">
                    <CustomerReviewStars rating={rating} />

                    {review.customerName ? (
                      <p className="customerReviewCard__name">
                        {review.customerName}
                      </p>
                    ) : null}

                    {review.commentTitle ? (
                      <h3 className="customerReviewCard__commentTitle">
                        {review.commentTitle}
                      </h3>
                    ) : null}

                    {review.customerComment ? (
                      <p className="customerReviewCard__comment">
                        {review.customerComment}
                      </p>
                    ) : null}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {scrollSnaps.length > 1 ? (
        <div
          className="customerReviewsDots"
          aria-label={t('reviews.list')}
        >
          {scrollSnaps.map((scrollSnap, index) => (
            <button
              key={`customer-review-dot-${scrollSnap}`}
              type="button"
              className={`customerReviewsDot${
                index === selectedIndex ? ' customerReviewsDot--active' : ''
              }`}
              aria-label={t('reviews.show', {number: index + 1})}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
