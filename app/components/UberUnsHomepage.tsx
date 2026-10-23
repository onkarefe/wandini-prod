import wandIcon from '~/assets/Icons/wand.png';
import {Image} from '@shopify/hydrogen';
import {shopifyImageLoader} from '~/lib/responsive-image';

export type UberUnsHomepageImage = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
} | null;

export type UberUnsHomepageContent = {
  sectionTitle?: string | null;
  sectionContent?: string | null;
  sectionImage?: UberUnsHomepageImage;
} | null;

type UberUnsHomepageProps = {
  content?: UberUnsHomepageContent;
};

export default function UberUnsHomepage({content}: UberUnsHomepageProps) {
  const sectionTitle = content?.sectionTitle?.trim() ?? '';
  const sectionContent = content?.sectionContent?.trim() ?? '';
  const sectionImage = content?.sectionImage ?? null;

  if (!sectionTitle && !sectionContent && !sectionImage?.url) {
    return null;
  }

  const hasImage = Boolean(sectionImage?.url);
  const hasText = Boolean(sectionTitle || sectionContent);

  return (
    <section
      className="uberUnsHomepage container mx-auto"
      aria-labelledby={sectionTitle ? 'uber-uns-homepage-title' : undefined}
    >
      <div
        className={`uberUnsHomepage__layout${
          !hasImage || !hasText ? ' uberUnsHomepage__layout--single' : ''
        }`}
      >
        {sectionImage?.url ? (
          <div className="uberUnsHomepage__media">
            <Image
              className="uberUnsHomepage__image"
              data={sectionImage}
              loader={shopifyImageLoader}
              sizes={
                hasText
                  ? '(min-width: 1536px) 983px, (min-width: 1280px) 817px, (min-width: 1024px) 650px, (min-width: 768px) 484px, (min-width: 640px) 608px, calc(100vw - 32px)'
                  : '(min-width: 1536px) 1536px, (min-width: 1280px) 1280px, (min-width: 1024px) 1024px, (min-width: 768px) 768px, (min-width: 640px) 608px, calc(100vw - 32px)'
              }
              srcSetOptions={{
                startingWidth: 320,
                incrementSize: 320,
                intervals: hasText ? 7 : 10,
                placeholderWidth: 800,
              }}
              alt={sectionImage.altText ?? sectionTitle}
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}

        {hasText ? (
          <div className="uberUnsHomepage__content">
            {sectionTitle ? (
              <h2 id="uber-uns-homepage-title">{sectionTitle}</h2>
            ) : null}
            {sectionContent ? <p>{sectionContent}</p> : null}
            <img
              className="uberUnsHomepage__wandIcon"
              src={wandIcon}
              alt=""
              width={60}
              height={60}
              loading="lazy"
              aria-hidden="true"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
