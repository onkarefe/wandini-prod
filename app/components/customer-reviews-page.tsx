import type {
  CustomerReview,
  CustomerReviewsHero,
  CustomerReviewsSteps,
} from '~/lib/customer-reviews';
import {getCustomerReviewRatingValue} from '~/lib/customer-reviews';
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
  return (
    <div
      className="customer-reviews-page__stars"
      aria-label={`${rating} von 5 Sternen`}
    >
      {getStarStates(rating).map(({position, state}) => (
        <span
          className={`customer-reviews-page__star customer-reviews-page__star--${state}`}
          aria-hidden="true"
          key={position}
        >
          ★
        </span>
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

          {review.customerComment ? (
            <blockquote className="customer-reviews-page__quote">
              <p>{review.customerComment}</p>
            </blockquote>
          ) : null}

          {review.customerName ? (
            <footer className="customer-reviews-page__customer">
              <span aria-hidden="true" />
              <cite>{review.customerName}</cite>
            </footer>
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
  if (!reviews.length) return null;

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
  return (
    <section
      className="customer-reviews-page__submission"
      aria-labelledby="customer-review-form-title"
    >
      <div className="customer-reviews-page__submission-inner container mx-auto">
        <header className="customer-reviews-page__submission-header">
          <span className="customer-reviews-page__submission-kicker">
            Ihre Perspektive
          </span>
          <h2 id="customer-review-form-title">Ihre Erfahrung. Ihr Raum.</h2>
          <p>
            Wie wirkt Ihre Wandini Fototapete im Alltag? Teilen Sie Ihren
            Eindruck und zeigen Sie uns, wie das Motiv Teil Ihres Zuhauses
            geworden ist.
          </p>
        </header>

        <form
          className="customer-reviews-page__submission-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="customer-reviews-page__form-grid">
            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-first-name">Vorname</label>
              <input
                id="review-first-name"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder="Anna"
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-last-name">Nachname</label>
              <input
                id="review-last-name"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="Muster"
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-email">E-Mail-Adresse</label>
              <input
                id="review-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="anna@beispiel.de"
              />
            </div>

            <div className="customer-reviews-page__form-field">
              <label htmlFor="review-phone">Telefonnummer</label>
              <input
                id="review-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+49 123 456789"
              />
            </div>

            <fieldset className="customer-reviews-page__rating-field">
              <legend>Ihre Bewertung</legend>
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
                        {rating} von 5 Sternen
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="customer-reviews-page__form-field customer-reviews-page__form-field--wide">
              <label htmlFor="review-comment">Ihre Erfahrung</label>
              <textarea
                id="review-comment"
                name="comment"
                rows={5}
                placeholder="Erzählen Sie uns von Ihrem Motiv, dem Raum und Ihrem Eindruck."
              />
            </div>

            <div className="customer-reviews-page__form-field customer-reviews-page__form-field--wide customer-reviews-page__upload-field">
              <label htmlFor="review-photo">Foto Ihres Raumes</label>
              <input
                id="review-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <span>JPG, PNG oder WEBP</span>
            </div>
          </div>

          <footer className="customer-reviews-page__submission-footer">
            <button type="submit">Bewertung senden</button>
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
