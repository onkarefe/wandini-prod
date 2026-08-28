import type {MetaDescriptor} from 'react-router';

/**
 * Global search-engine switch.
 *
 * Keep this `false` while the storefront is under development. Change only
 * this value to `true` when the site is ready to be crawled and indexed.
 */
export const SEO_ENABLED = false;

export const SEO_BRAND = 'Wandini';
export const GENERATED_META_DESCRIPTION_MAX_LENGTH = 160;

export const PRIVATE_ROBOTS_DIRECTIVE =
  'noindex,nofollow,noarchive,nosnippet,noimageindex';

export const SEO_DISABLED_ROBOTS_DIRECTIVE = PRIVATE_ROBOTS_DIRECTIVE;

type SeoTitleSources = {
  explicit?: string | null;
  fallback?: string | null;
  systemFallback?: string | null;
  brand?: string | null;
};

type SeoDescriptionSources = {
  explicit?: string | null;
  fallback?: string | null;
  systemFallback?: string | null;
  maxGeneratedLength?: number;
};

type SocialMetadataOverrides = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
};

export type SeoMetadataInput = {
  title: SeoTitleSources;
  description?: SeoDescriptionSources;
  canonicalUrl: string | URL;
  robots?: string;
  openGraphType?: string;
  image?: string | null;
  openGraph?: SocialMetadataOverrides;
  twitter?: SocialMetadataOverrides & {
    card?: 'summary' | 'summary_large_image';
  };
};

function getProvidedText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Normalizes generated text. Explicit SEO copy intentionally bypasses this. */
export function normalizeSeoText(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBrandedSeoTitle(
  value?: string | null,
  brand?: string | null,
) {
  const title = normalizeSeoText(value);
  const normalizedBrand = normalizeSeoText(brand) || SEO_BRAND;

  if (!title) return normalizedBrand;

  return title.toLowerCase().includes(normalizedBrand.toLowerCase())
    ? title
    : `${title} | ${normalizedBrand}`;
}

export function resolveSeoTitle({
  explicit,
  fallback,
  systemFallback = SEO_BRAND,
  brand = SEO_BRAND,
}: SeoTitleSources) {
  const providedTitle = getProvidedText(explicit);
  if (providedTitle) return providedTitle;

  return buildBrandedSeoTitle(
    normalizeSeoText(fallback) || normalizeSeoText(systemFallback) || SEO_BRAND,
    brand,
  );
}

export function truncateGeneratedSeoDescription(
  value: string,
  maxLength = GENERATED_META_DESCRIPTION_MAX_LENGTH,
) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return '.'.repeat(Math.max(0, maxLength));

  const contentLength = maxLength - 3;
  const clipped = value.slice(0, contentLength + 1);
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const truncated =
    lastSpaceIndex > Math.floor(contentLength / 2)
      ? clipped.slice(0, lastSpaceIndex)
      : clipped.slice(0, contentLength);

  return `${truncated.trim()}...`;
}

export function resolveSeoDescription({
  explicit,
  fallback,
  systemFallback,
  maxGeneratedLength = GENERATED_META_DESCRIPTION_MAX_LENGTH,
}: SeoDescriptionSources) {
  const providedDescription = getProvidedText(explicit);
  if (providedDescription) return providedDescription;

  const generatedDescription =
    normalizeSeoText(fallback) || normalizeSeoText(systemFallback);

  return generatedDescription
    ? truncateGeneratedSeoDescription(generatedDescription, maxGeneratedLength)
    : null;
}

/**
 * Produces an origin/path canonical and removes query/hash noise. Relative
 * route fallbacks remain relative; request URLs remain absolute.
 */
export function buildCanonicalUrl(input: string | URL) {
  const rawInput = input instanceof URL ? input.toString() : input;
  const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(rawInput);

  try {
    const url = new URL(rawInput, 'https://canonical.invalid');
    const pathname = url.pathname || '/';

    if (!isAbsolute) return pathname;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/';

    return `${url.origin}${pathname}`;
  } catch {
    return '/';
  }
}

export function resolveRobotsDirective(
  enabledDirective: string,
  seoEnabled: boolean,
) {
  return seoEnabled ? enabledDirective : SEO_DISABLED_ROBOTS_DIRECTIVE;
}

export function getRobotsDirective(enabledDirective = 'index,follow') {
  return resolveRobotsDirective(enabledDirective, SEO_ENABLED);
}

export function buildSeoMetadata({
  title: titleSources,
  description: descriptionSources,
  canonicalUrl: canonicalInput,
  robots = 'index,follow',
  openGraphType = 'website',
  image,
  openGraph,
  twitter,
}: SeoMetadataInput): MetaDescriptor[] {
  const title = resolveSeoTitle(titleSources);
  const description = descriptionSources
    ? resolveSeoDescription(descriptionSources)
    : null;
  const canonicalUrl = buildCanonicalUrl(canonicalInput);
  const defaultImage = getProvidedText(image);
  const openGraphTitle = getProvidedText(openGraph?.title) ?? title;
  const openGraphDescription =
    getProvidedText(openGraph?.description) ?? description;
  const openGraphImage = getProvidedText(openGraph?.image) ?? defaultImage;
  const twitterTitle = getProvidedText(twitter?.title) ?? title;
  const twitterDescription =
    getProvidedText(twitter?.description) ?? description;
  const twitterImage = getProvidedText(twitter?.image) ?? defaultImage;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {name: 'robots', content: getRobotsDirective(robots)},
    {tagName: 'link', rel: 'canonical', href: canonicalUrl},
    {property: 'og:type', content: openGraphType},
    {property: 'og:title', content: openGraphTitle},
    ...(openGraphDescription
      ? [{property: 'og:description', content: openGraphDescription}]
      : []),
    {property: 'og:url', content: canonicalUrl},
    ...(openGraphImage
      ? [{property: 'og:image', content: openGraphImage}]
      : []),
    {
      name: 'twitter:card',
      content:
        twitter?.card ?? (twitterImage ? 'summary_large_image' : 'summary'),
    },
    {name: 'twitter:title', content: twitterTitle},
    ...(twitterDescription
      ? [{name: 'twitter:description', content: twitterDescription}]
      : []),
    ...(twitterImage ? [{name: 'twitter:image', content: twitterImage}] : []),
  ];
}
