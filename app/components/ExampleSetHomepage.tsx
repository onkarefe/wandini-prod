import {Link} from '~/lib/i18n-router';

export type ExampleSetHomepageImage = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
} | null;

export type ExampleSetHomepageProduct = {
  id: string;
  handle: string;
  title: string;
} | null;

export type ExampleSetHomepageContent = {
  title?: string | null;
  subdesc1?: string | null;
  subdesc2?: string | null;
  ctaText?: string | null;
  ctaAction?: ExampleSetHomepageProduct;
  image?: ExampleSetHomepageImage;
} | null;

type ExampleSetHomepageProps = {
  content?: ExampleSetHomepageContent;
};

export default function ExampleSetHomepage({content}: ExampleSetHomepageProps) {
  const title = content?.title?.trim() ?? '';
  const subdesc1 = content?.subdesc1?.trim() ?? '';
  const subdesc2 = content?.subdesc2?.trim() ?? '';
  const ctaText = content?.ctaText?.trim() ?? '';
  const productHandle = content?.ctaAction?.handle?.trim() ?? '';
  const image = content?.image ?? null;
  const hasText = Boolean(
    title || subdesc1 || subdesc2 || (ctaText && productHandle),
  );

  if (!hasText && !image?.url) {
    return null;
  }

  return (
    <section
      className="exampleSetHomepage"
      aria-labelledby={title ? 'example-set-homepage-title' : undefined}
    >
      <div
        className={`container mx-auto exampleSetHomepage__inner${
          !hasText || !image?.url ? ' exampleSetHomepage__inner--single' : ''
        }`}
      >
        {hasText ? (
          <div className="exampleSetHomepage__content">
            {subdesc1 ? (
              <p className="exampleSetHomepage__eyebrow">{subdesc1}</p>
            ) : null}

            {title ? (
              <h3
                id="example-set-homepage-title"
                className="exampleSetHomepage__title"
              >
                {title}
              </h3>
            ) : null}

            {subdesc2 ? (
              <p className="exampleSetHomepage__description">{subdesc2}</p>
            ) : null}

            {ctaText && productHandle ? (
              <Link
                className="exampleSetHomepage__button"
                to={`/products/${productHandle}`}
              >
                <span>{ctaText}</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        {image?.url ? (
          <div className="exampleSetHomepage__media">
            <img
              className="exampleSetHomepage__image"
              src={image.url}
              alt={image.altText ?? title}
              width={image.width}
              height={image.height}
              loading="lazy"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
