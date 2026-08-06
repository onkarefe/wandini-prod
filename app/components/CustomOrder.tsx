import {Link} from '~/lib/i18n-router';

type StepByStepImage = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
} | null;

type StepByStepItem = {
  id: string;
  title: string;
  description: string;
  image: StepByStepImage;
};

type StepByStepBullet = {
  id: string;
  text: string;
  icon: StepByStepImage;
};

export type StepByStepContent = {
  mainTitle?: string | null;
  mainDescription?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  steps?: StepByStepItem[];
  bullets?: StepByStepBullet[];
} | null;

interface CustomOrderProps {
  content?: StepByStepContent;
}

const STEP_NUMBERS = ['01', '02', '03', '04'] as const;
// Temporarily hidden until the benefits area is redesigned.
const SHOW_BENEFITS = false;

function ArrowIcon() {
  return (
    <svg
      className="processSteps__buttonIcon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export default function CustomOrder({content}: CustomOrderProps) {
  const mainTitle = content?.mainTitle?.trim() ?? '';
  const mainDescription = content?.mainDescription?.trim() ?? '';
  const ctaText = content?.ctaText?.trim() ?? '';
  const ctaLink = content?.ctaLink?.trim() ?? '';
  const steps = (content?.steps ?? []).slice(0, STEP_NUMBERS.length);
  const bullets = (content?.bullets ?? []).slice(0, 4);
  const hasContent =
    mainTitle ||
    mainDescription ||
    steps.length > 0 ||
    (ctaText && ctaLink) ||
    bullets.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <section
      className="processSteps"
      aria-labelledby={mainTitle ? 'process-steps-title' : undefined}
    >
      <div className="container mx-auto processSteps__inner">
        {mainTitle || mainDescription ? (
          <header className="processSteps__header">
            {mainTitle ? (
              <div className="seperator processSteps__heading">
                <h3 id="process-steps-title" className="processSteps__title">
                  {mainTitle}
                </h3>
              </div>
            ) : null}
            {mainDescription ? (
              <p className="processSteps__description">{mainDescription}</p>
            ) : null}
          </header>
        ) : null}

        {steps.length > 0 ? (
          <ol className="processSteps__grid">
            {steps.map((step, index) => (
              <li
                className={`processSteps__card${
                  step.image?.url ? '' : ' processSteps__card--withoutImage'
                }`}
                key={step.id}
              >
                {step.image?.url ? (
                  <div className="processSteps__media">
                    <img
                      className="processSteps__image"
                      src={step.image.url}
                      alt={step.image.altText ?? step.title}
                      width={step.image.width}
                      height={step.image.height}
                      loading="lazy"
                    />
                  </div>
                ) : null}

                <div className="processSteps__cardContent">
                  <div className="processSteps__index" aria-hidden="true">
                    <span className="processSteps__number">
                      {STEP_NUMBERS[index]}
                    </span>
                    <span className="processSteps__indexLine" />
                  </div>

                  {step.title ? (
                    <h4 className="processSteps__cardTitle">{step.title}</h4>
                  ) : null}
                  {step.description ? (
                    <p className="processSteps__cardDescription">
                      {step.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {ctaText && ctaLink ? (
          <Link className="processSteps__button" to={ctaLink}>
            <span>{ctaText}</span>
            <ArrowIcon />
          </Link>
        ) : null}

        {SHOW_BENEFITS && bullets.length > 0 ? (
          <ul className="processSteps__benefits">
            {bullets.map((bullet) => (
              <li className="processSteps__benefit" key={bullet.id}>
                {bullet.icon?.url ? (
                  <img
                    className="processSteps__benefitIcon"
                    src={bullet.icon.url}
                    alt=""
                    width={bullet.icon.width}
                    height={bullet.icon.height}
                    loading="lazy"
                    aria-hidden="true"
                  />
                ) : null}
                {bullet.text ? (
                  <span className="processSteps__benefitText">
                    {bullet.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
