import {useCallback, useEffect, useMemo, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';

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

function getStarStates(rating: number): StarState[] {
  const roundedRating = Math.round(rating * 2) / 2;

  return Array.from({length: 5}, (_, index) => {
    const starValue = index + 1;

    if (roundedRating >= starValue) {
      return 'full';
    }

    if (roundedRating >= starValue - 0.5) {
      return 'half';
    }

    return 'empty';
  });
}

function StarIcon({state}: {state: StarState}) {
  const isHalf = state === 'half';

  return (
    <svg
      className={`customerReviewStar customerReviewStar--${state}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={
          isHalf
            ? 'M320.1 417.6C330.1 417.6 340 419.9 349.1 424.6L423.5 462.5L410.5 380C407.3 359.8 414 339.3 428.4 324.8L487.4 265.7L404.9 252.6C384.7 249.4 367.2 236.7 357.9 218.5L319.9 144.1L319.9 417.7zM489.4 553C482.1 558.3 472.4 559.1 464.4 555L320.1 481.6L175.8 555C167.8 559.1 158.1 558.3 150.8 553C143.5 547.7 139.8 538.8 141.2 529.8L166.4 369.9L52 255.4C45.6 249 43.4 239.6 46.2 231C49 222.4 56.3 216.1 65.3 214.7L225.2 189.3L298.8 45.1C302.9 37.1 311.2 32 320.2 32C329.2 32 337.5 37.1 341.6 45.1L415 189.3L574.9 214.7C583.8 216.1 591.2 222.4 594 231C596.8 239.6 594.5 249 588.2 255.4L473.7 369.9L499 529.8C500.4 538.7 496.7 547.7 489.4 553z'
            : 'M341.5 45.1C337.4 37.1 329.1 32 320.1 32C311.1 32 302.8 37.1 298.7 45.1L225.1 189.3L65.2 214.7C56.3 216.1 48.9 222.4 46.1 231C43.3 239.6 45.6 249 51.9 255.4L166.3 369.9L141.1 529.8C139.7 538.7 143.4 547.7 150.7 553C158 558.3 167.6 559.1 175.7 555L320.1 481.6L464.4 555C472.4 559.1 482.1 558.3 489.4 553C496.7 547.7 500.4 538.8 499 529.8L473.7 369.9L588.1 255.4C594.5 249 596.7 239.6 593.9 231C591.1 222.4 583.8 216.1 574.8 214.7L415 189.3L341.5 45.1z'
        }
      />
    </svg>
  );
}

function CustomerReviewStars({rating}: {rating: number}) {
  const starStates = getStarStates(rating);

  return (
    <div className="customerReviewStars" aria-label={`${rating} out of 5 stars`}>
      {starStates.map((state, index) => (
        <StarIcon key={`${state}-${index}`} state={state} />
      ))}
    </div>
  );
}

export default function CustomerRevs({
  reviews = [],
  sectionTitle,
}: CustomerRevsProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    loop: reviews.length > 3,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
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

                  <CustomerReviewStars rating={rating} />

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

                  {review.customerName ? (
                    <p className="customerReviewCard__name">
                      {review.customerName}
                    </p>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {scrollSnaps.length > 1 ? (
        <div className="customerReviewsDots" aria-label="Customer review slides">
          {scrollSnaps.map((_, index) => (
            <button
              key={`customer-review-dot-${index}`}
              type="button"
              className={`customerReviewsDot${
                index === selectedIndex ? ' customerReviewsDot--active' : ''
              }`}
              aria-label={`Go to review slide ${index + 1}`}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
