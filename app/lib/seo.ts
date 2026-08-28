import type {MetaDescriptor} from 'react-router';
import {
  ENGLISH_LOCALE,
  GERMAN_LOCALE,
  getLocaleFromPathname,
  prefixPathWithLocale,
} from '~/lib/locale';

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

export type SeoAlternateUrls = {
  deDE: string;
  enDE: string;
};

type SeoLanguageSwitchLinks = {
  DE: string;
  EN: string;
};

export type SeoMetadataInput = {
  title: SeoTitleSources;
  description?: SeoDescriptionSources;
  canonicalUrl: string | URL;
  preservePagination?: boolean;
  alternates?: SeoAlternateUrls | null;
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
    const rawPathname = url.pathname || '/';
    const pathname = prefixPathWithLocale(
      rawPathname,
      getLocaleFromPathname(rawPathname),
    );

    if (!isAbsolute) return pathname;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/';

    return `${url.origin}${pathname}`;
  } catch {
    return '/';
  }
}

function getPaginationState(input: string | URL) {
  const rawInput = input instanceof URL ? input.toString() : input;

  try {
    const searchParams = new URL(rawInput, 'https://canonical.invalid')
      .searchParams;
    const cursor = searchParams.get('cursor')?.trim();
    const direction = searchParams.get('direction');

    if (!cursor || (direction !== 'next' && direction !== 'previous')) {
      return null;
    }

    return {cursor, direction} as const;
  } catch {
    return null;
  }
}

function getPaginationCanonicalSearch(input: string | URL) {
  const pagination = getPaginationState(input);

  return pagination?.direction === 'next'
    ? new URLSearchParams(pagination).toString()
    : '';
}

/** Preserves only a valid forward Hydrogen pagination pair. */
export function buildPaginationCanonicalUrl(input: string | URL) {
  const canonicalUrl = buildCanonicalUrl(input);
  const paginationSearch = getPaginationCanonicalSearch(input);

  return paginationSearch
    ? `${canonicalUrl}?${paginationSearch}`
    : canonicalUrl;
}

export function resolvePaginationSeoPolicy(input: string | URL) {
  const pagination = getPaginationState(input);
  const isBackwardPagination = pagination?.direction === 'previous';

  return {
    canonicalUrl:
      pagination?.direction === 'next'
        ? buildPaginationCanonicalUrl(input)
        : buildCanonicalUrl(input),
    robots: isBackwardPagination ? 'noindex,follow' : 'index,follow',
  } as const;
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function resolveSeoHref(
  canonicalInput: string | URL,
  pathInput: string | URL,
  preservePagination = false,
) {
  const canonicalBuilder = preservePagination
    ? buildPaginationCanonicalUrl
    : buildCanonicalUrl;
  const canonicalUrl = canonicalBuilder(canonicalInput);
  const pathUrl = canonicalBuilder(pathInput);

  if (!isAbsoluteHttpUrl(canonicalUrl)) return pathUrl;

  return canonicalBuilder(
    new URL(pathUrl, `${new URL(canonicalUrl).origin}/`),
  );
}

/** Builds a URL in the locale selected by the canonical resource URL. */
export function buildLocaleSeoUrl(
  canonicalInput: string | URL,
  path: string,
) {
  const canonicalUrl = buildCanonicalUrl(canonicalInput);
  const parsedCanonical = new URL(canonicalUrl, 'https://canonical.invalid');
  const locale = getLocaleFromPathname(parsedCanonical.pathname);
  const localizedPath = prefixPathWithLocale(path, locale);

  return isAbsoluteHttpUrl(canonicalUrl)
    ? `${parsedCanonical.origin}${localizedPath}`
    : localizedPath;
}

export function buildFixedSeoAlternateUrls(
  canonicalInput: string | URL,
  path: string,
): SeoAlternateUrls {
  const paginationSearch = getPaginationCanonicalSearch(canonicalInput);
  const pathWithPagination = paginationSearch
    ? `${path}?${paginationSearch}`
    : path;

  return {
    deDE: resolveSeoHref(
      canonicalInput,
      prefixPathWithLocale(pathWithPagination, GERMAN_LOCALE),
      Boolean(paginationSearch),
    ),
    enDE: resolveSeoHref(
      canonicalInput,
      prefixPathWithLocale(pathWithPagination, ENGLISH_LOCALE),
      Boolean(paginationSearch),
    ),
  };
}

/**
 * Converts stable-ID language-switcher results into SEO alternates. A missing
 * localization resolves to the locale homepage in the switcher; that fallback
 * is deliberately rejected here because it is not a resource alternate.
 */
export function buildResourceSeoAlternateUrls(
  canonicalInput: string | URL,
  links?: SeoLanguageSwitchLinks | null,
): SeoAlternateUrls | null {
  if (!links) return null;

  const preservePagination = Boolean(
    getPaginationCanonicalSearch(canonicalInput),
  );
  const deDE = resolveSeoHref(canonicalInput, links.DE, preservePagination);
  const enDE = resolveSeoHref(canonicalInput, links.EN, preservePagination);
  const dePath = new URL(deDE, 'https://canonical.invalid').pathname;
  const enPath = new URL(enDE, 'https://canonical.invalid').pathname;

  if (
    dePath === '/' ||
    dePath === '/en' ||
    dePath.startsWith('/en/') ||
    enPath === '/en' ||
    !enPath.startsWith('/en/')
  ) {
    return null;
  }

  return {deDE, enDE};
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
  preservePagination = false,
  alternates,
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
  const canonicalBuilder = preservePagination
    ? buildPaginationCanonicalUrl
    : buildCanonicalUrl;
  const canonicalUrl = canonicalBuilder(canonicalInput);
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
    ...(alternates
      ? [
          {
            tagName: 'link',
            rel: 'alternate',
            hrefLang: 'de-DE',
            href: canonicalBuilder(alternates.deDE),
          },
          {
            tagName: 'link',
            rel: 'alternate',
            hrefLang: 'en-DE',
            href: canonicalBuilder(alternates.enDE),
          },
          {
            tagName: 'link',
            rel: 'alternate',
            hrefLang: 'x-default',
            href: canonicalBuilder(alternates.deDE),
          },
        ]
      : []),
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
