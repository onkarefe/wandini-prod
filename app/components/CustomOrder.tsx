import {Link} from '~/lib/i18n-router';

type ShowcaseBannerImage = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
} | null;

type ShowcaseBanner = {
  title?: string | null;
  subtitle?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  image?: ShowcaseBannerImage;
} | null;

interface CustomOrderProps {
  showcaseBanner?: ShowcaseBanner;
}

export default function CustomOrder({showcaseBanner}: CustomOrderProps) {
  const title = showcaseBanner?.title?.trim() ?? '';
  const subtitle = showcaseBanner?.subtitle?.trim() ?? '';
  const buttonText = showcaseBanner?.buttonText?.trim() ?? '';
  const buttonLink = showcaseBanner?.buttonLink?.trim() ?? '';
  const image = showcaseBanner?.image;
  const hasContent = title || subtitle || (buttonText && buttonLink) || image?.url;

  if (!hasContent) {
    return null;
  }

  return (
    <section className="showcaseSlice">
      <div className="container mx-auto showcaseSlice-inner">
        <div className="showcaseSlice-copy">
          {title ? <h2 className="showcaseSlice-title">{title}</h2> : null}
          {subtitle ? (
            <p className="showcaseSlice-subtitle">{subtitle}</p>
          ) : null}
          {buttonText && buttonLink ? (
            <Link className="showcaseSlice-button" to={buttonLink}>
              {buttonText}
            </Link>
          ) : null}
        </div>

        {image?.url ? (
          <div className="showcaseSlice-media">
            <img
              className="showcaseSlice-image"
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
