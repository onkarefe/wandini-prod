import type {
  CustomerReview,
  CustomerReviewsHero,
  CustomerReviewsSteps,
} from '~/lib/customer-reviews';
import {getCustomerReviewRatingValue} from '~/lib/customer-reviews';
import {useTranslation} from '~/i18n/useTranslation';
import '../styles/customer-reviews-page.css';

type CustomerReviewsPageProps = {
  hero: CustomerReviewsHero;
  reviews: CustomerReview[];
  reviewsSectionTitle: string;
  steps: CustomerReviewsSteps;
};

type StarState = 'full' | 'half' | 'empty';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

function getStarStates(
  rating: number,
): Array<{position: number; state: StarState}> {
  const roundedRating = Math.round(rating * 2) / 2;

  return Array.from({length: 5}, (_, index) => {
    const starValue = index + 1;
    const state =
      roundedRating >= starValue
        ? 'full'
        : roundedRating >= starValue - 0.5
          ? 'half'
          : 'empty';

    return {position: starValue, state};
  });
}

function ReviewStars({rating}: {rating: number}) {
  const {t} = useTranslation();
  return (
    <div
      className="customer-reviews-page__stars"
      aria-label={t('reviews.rating', {rating})}
    >
      {getStarStates(rating).map(({position, state}) => (
        <svg
          className={`customer-reviews-page__star customer-reviews-page__star--${state}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          key={position}
        >
          <rect
            className="customer-reviews-page__star-base"
            width="24"
            height="24"
          />
          {state !== 'empty' ? (
            <rect
              className="customer-reviews-page__star-fill"
              width={state === 'half' ? 12 : 24}
              height="24"
            />
          ) : null}
          <path
            className="customer-reviews-page__star-shape"
            d="m12 3.45 2.58 5.24 5.78.84-4.18 4.07.99 5.75L12 16.63l-5.17 2.72.99-5.75-4.18-4.07 5.78-.84L12 3.45Z"
          />
        </svg>
      ))}
    </div>
  );
}

function ReviewsHero({hero}: {hero: CustomerReviewsHero}) {
  if (!hero.title && !hero.description && !hero.image) return null;

  return (
    <section
      className={`customer-reviews-page__hero${
        hero.image ? '' : ' customer-reviews-page__hero--without-image'
      }`}
      aria-labelledby={hero.title ? 'customer-reviews-hero-title' : undefined}
    >
      {hero.image ? (
        <div className="customer-reviews-page__hero-media">
          <img
            className="customer-reviews-page__hero-image"
            src={hero.image.url}
            alt={hero.image.altText ?? hero.title}
            width={hero.image.width}
            height={hero.image.height}
            loading="eager"
            fetchPriority="high"
          />
        </div>
      ) : null}

      <div className="customer-reviews-page__hero-content">
        {hero.title ? (
          <h1 id="customer-reviews-hero-title">{hero.title}</h1>
        ) : null}

        {hero.description ? (
          <p className="customer-reviews-page__hero-description">
            {hero.description}
          </p>
        ) : null}

        {hero.buttonText ? (
          <a className="customer-reviews-page__hero-link" href="#kundenstimmen">
            <span>{hero.buttonText}</span>
            <ArrowIcon />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ReviewStory({review}: {review: CustomerReview}) {
  const rating = getCustomerReviewRatingValue(review.stars);

  return (
    <li className="customer-reviews-page__story">
      <article className="customer-reviews-page__story-card">
        {review.image ? (
          <div className="customer-reviews-page__story-media">
            <img
              className="customer-reviews-page__story-image"
              src={review.image.url}
              alt={review.image.altText ?? review.customerName}
              width={review.image.width}
              height={review.image.height}
              loading="lazy"
            />
          </div>
        ) : null}

        <div className="customer-reviews-page__story-content">
          {rating > 0 ? <ReviewStars rating={rating} /> : null}

          {review.customerName ? (
            <footer className="customer-reviews-page__customer">
              <cite>{review.customerName}</cite>
            </footer>
          ) : null}

          {review.commentTitle ? (
            <h3 className="customer-reviews-page__comment-title">
              {review.commentTitle}
            </h3>
          ) : null}

          {review.customerComment ? (
            <blockquote className="customer-reviews-page__quote">
              <p>{review.customerComment}</p>
            </blockquote>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function ReviewsShowcase({
  reviews,
  sectionTitle,
}: {
  reviews: CustomerReview[];
  sectionTitle: string;
}) {
  const {t} = useTranslation();
  if (!reviews.length) return null;

  const averageRating =
    reviews.reduce(
      (total, review) => total + getCustomerReviewRatingValue(review.stars),
      0,
    ) / reviews.length;

  return (
    <section
      className="customer-reviews-page__showcase"
      id="kundenstimmen"
      aria-labelledby={sectionTitle ? 'customer-reviews-heading' : undefined}
    >
      <div className="customer-reviews-page__showcase-inner container mx-auto">
        {sectionTitle ? (
          <header className="customer-reviews-page__showcase-header">
            <h2 id="customer-reviews-heading">{sectionTitle}</h2>
          </header>
        ) : null}

        <div className="customer-reviews-page__summary">
          <ReviewStars rating={averageRating} />
          <p>
            <strong>{averageRating.toFixed(1)}</strong>
            <span> / 5</span>
            <span
              className="customer-reviews-page__summary-separator"
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

        <ol className="customer-reviews-page__stories">
          {reviews.map((review) => (
            <ReviewStory review={review} key={review.id} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function ExperienceSteps({content}: {content: CustomerReviewsSteps}) {
  if (!content.title && !content.description && !content.steps.length) {
    return null;
  }

  return (
    <section
      className="customer-reviews-page__journey"
      aria-labelledby={content.title ? 'customer-journey-title' : undefined}
    >
      <div className="customer-reviews-page__journey-inner container mx-auto">
        {content.title || content.description ? (
          <header className="customer-reviews-page__journey-header">
            {content.title ? (
              <h2 id="customer-journey-title">{content.title}</h2>
            ) : null}
            {content.description ? <p>{content.description}</p> : null}
          </header>
        ) : null}

        {content.steps.length ? (
          <ol className="customer-reviews-page__journey-list">
            {content.steps.map((step, index) => (
              <li className="customer-reviews-page__journey-item" key={step.id}>
                {step.image ? (
                  <div className="customer-reviews-page__journey-media">
                    <img
                      className="customer-reviews-page__journey-image"
                      src={step.image.url}
                      alt={step.image.altText ?? step.title}
                      width={step.image.width}
                      height={step.image.height}
                      loading="lazy"
                    />
                  </div>
                ) : null}

                <div className="customer-reviews-page__journey-content">
                  <span
                    className="customer-reviews-page__journey-index"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="customer-reviews-page__journey-copy">
                    {step.title ? <h3>{step.title}</h3> : null}
                    {step.description ? <p>{step.description}</p> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

const REVIEW_RATING_OPTIONS = [5, 4, 3, 2, 1] as const;

function CustomerReviewForm() {
  const {t} = useTranslation();
  return (
    <section
      className="customer-reviews-page__submission"
      aria-labelledby="customer-review-form-title"
    >
      <div className="customer-reviews-page__submission-inner container mx-auto">
        <header className="customer-reviews-page__submission-header">
          <span className="customer-reviews-page__submission-kicker">
            {t('reviews.formKicker')}
          </span>
          <h2 id="customer-review-form-title">{t('reviews.formTitle')}</h2>
          <p>
            {t('reviews.formDescription')}
          </p>
        </header>

        <form
          className="customer-reviews-page__submission-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="customer-reviews-page__form-grid">
            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-first-name">{t('account.firstName')}</label>
              <input
                id="review-first-name"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder={t('reviews.firstNamePlaceholder')}
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-last-name">{t('account.lastName')}</label>
              <input
                id="review-last-name"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder={t('reviews.lastNamePlaceholder')}
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-email">{t('contact.emailAddress')}</label>
              <input
                id="review-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t('reviews.emailPlaceholder')}
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-phone">{t('contact.phoneNumber')}</label>
              <input
                id="review-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder={t('reviews.phonePlaceholder')}
              />
            </div>

            <fieldset className="customer-reviews-page__rating-field">
              <legend>{t('reviews.yourRating')}</legend>
              <div className="customer-reviews-page__rating-control">
                {REVIEW_RATING_OPTIONS.map((rating) => (
                  <div key={rating}>
                    <input
                      id={`review-rating-${rating}`}
                      name="rating"
                      type="radio"
                      value={rating}
                    />
                    <label htmlFor={`review-rating-${rating}`}>
                      <span aria-hidden="true">★</span>
                      <span className="customer-reviews-page__visually-hidden">
                        {t('reviews.rating', {rating})}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="customer-reviews-page__form-field customer-reviews-page__form-field--wide">
              <label htmlFor="review-comment">{t('reviews.experience')}</label>
              <textarea
                id="review-comment"
                name="comment"
                rows={5}
                placeholder={t('reviews.experiencePlaceholder')}
              />
            </div>

            <div className="customer-reviews-page__form-field customer-reviews-page__form-field--wide customer-reviews-page__upload-field">
              <label htmlFor="review-photo">{t('reviews.photo')}</label>
              <input
                id="review-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <span>{t('reviews.fileTypes')}</span>
            </div>
          </div>

          <footer className="customer-reviews-page__submission-footer">
            <button type="submit">{t('reviews.submit')}</button>
          </footer>
        </form>
      </div>
    </section>
  );
}

export default function CustomerReviewsPage({
  hero,
  reviews,
  reviewsSectionTitle,
  steps,
}: CustomerReviewsPageProps) {
  return (
    <main className="customer-reviews-page">
      <ReviewsHero hero={hero} />
      <ReviewsShowcase reviews={reviews} sectionTitle={reviewsSectionTitle} />
      <ExperienceSteps content={steps} />
      <CustomerReviewForm />
    </main>
  );
}
