import {Link} from '~/lib/i18n-router';
import {Image} from '@shopify/hydrogen';

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
                <h2 id="process-steps-title" className="processSteps__title">
                  {mainTitle}
                </h2>
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
                    <Image
                      className="processSteps__image"
                      data={step.image}
                      alt={step.image.altText ?? step.title}
                      loading="lazy"
                      sizes="(max-width: 767px) 100vw, 50vw"
                      srcSet={[320, 480, 640, 800, 1024]
                        .map((width) => {
                          const url = new URL(step.image!.url);
                          url.searchParams.set('width', String(width));
                          return `${url.toString()} ${width}w`;
                        })
                        .join(', ')}
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
                    <h3 className="processSteps__cardTitle">{step.title}</h3>
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
