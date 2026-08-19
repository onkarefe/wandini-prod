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
  const hasText = Boolean(sectionContent);

  return (
    <section
      className="uberUnsHomepage container mx-auto"
      aria-labelledby={sectionTitle ? 'uber-uns-homepage-title' : undefined}
    >
      {sectionTitle ? (
        <div className="seperator uberUnsHomepage__heading">
          <h3 id="uber-uns-homepage-title">{sectionTitle}</h3>
        </div>
      ) : null}

      <div
        className={`uberUnsHomepage__layout${
          !hasImage || !hasText ? ' uberUnsHomepage__layout--single' : ''
        }`}
      >
        {sectionImage?.url ? (
          <div className="uberUnsHomepage__media">
            <img
              className="uberUnsHomepage__image"
              src={sectionImage.url}
              alt={sectionImage.altText ?? sectionTitle}
              width={sectionImage.width}
              height={sectionImage.height}
              loading="lazy"
            />
          </div>
        ) : null}

        {sectionContent ? (
          <div className="uberUnsHomepage__content">
            <p>{sectionContent}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
