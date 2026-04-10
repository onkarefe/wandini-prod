// wandini1/app/components/SearchPageProductCard.tsx
import React from 'react';
import {Link} from '~/lib/i18n-router';
import {Image} from '@shopify/hydrogen';

type ShopifyImage =
  | {
      url?: string | null;
      altText?: string | null;
    }
  | null
  | undefined;

type SearchPageProductCardProps = {
  /** Full product object coming from your search results (regular or predictive). */
  product: any;

  /** The URL to navigate to (already built with tracking params if you use them). */
  to: string;

  /** Optional: close aside / dropdown on click (predictive search use-case). */
  onClick?: () => void;

  /** Optional: override title/desc if you want. */
  titleOverride?: string;
  descriptionOverride?: string;

  /** Optional: how many characters to show for description. Default: 110 */
  descriptionMaxChars?: number;

  /** Optional: extra className on the outer link */
  className?: string;
};

function pickFirstImage(product: any): ShopifyImage {
  // Common shapes in Hydrogen search responses
  // 1) product.selectedOrFirstAvailableVariant?.image
  const vImg = product?.selectedOrFirstAvailableVariant?.image;
  if (vImg?.url) return vImg;

  // 2) product.featuredImage
  const fImg = product?.featuredImage;
  if (fImg?.url) return fImg;

  // 3) product.images?.nodes?.[0]
  const nImg = product?.images?.nodes?.[0];
  if (nImg?.url) return nImg;

  // 4) product.images?.[0] (custom shape)
  const aImg = Array.isArray(product?.images) ? product.images[0] : null;
  if (aImg?.url) return aImg;

  return null;
}

function safeText(value: any): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function truncate(text: string, maxChars: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

export function SearchPageProductCard({
  product,
  to,
  onClick,
  titleOverride,
  descriptionOverride,
  descriptionMaxChars = 110,
  className = '',
}: SearchPageProductCardProps) {
  const title = titleOverride ?? safeText(product?.title);
  // Try common fields, fall back to empty
  const rawDesc =
    descriptionOverride ??
    safeText(product?.description) ??
    safeText(product?.descriptionText) ??
    '';

  const description = truncate(rawDesc, descriptionMaxChars);
  const image = pickFirstImage(product);

  return (
    <Link
      to={to}
      prefetch="intent"
      onClick={onClick}
      className={`search-page-product-card ${className}`.trim()}
      aria-label={title}
    >
      <div className="search-page-product-card__inner">
        <div className="search-page-product-card__media">
          {image?.url ? (
            <Image
              src={image.url}
              alt={image.altText ?? title}
              className="search-page-product-card__img"
              loading="lazy"
            />
          ) : (
            <div
              className="search-page-product-card__img search-page-product-card__img--placeholder"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="search-page-product-card__body">
          <p className="search-page-product-card__title">{title}</p>
          {description ? (
            <p className="search-page-product-card__desc">{description}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default SearchPageProductCard;
