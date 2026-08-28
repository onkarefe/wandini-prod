import {SEO_BRAND, normalizeSeoText, resolveSeoDescription} from './seo';

export type ShopifyGlobalSeoSettings = {
  siteName: string;
  defaultTitleSuffix: string;
  defaultMetaDescription: string | null;
  defaultSocialImage: string | null;
};

export type ShopifySeoPage = {
  routeKey: string;
  seoTitle: string | null;
  metaDescription: string | null;
  openGraphTitle: string | null;
  openGraphDescription: string | null;
  openGraphImage: string | null;
  noindex: boolean;
};

export const DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS: ShopifyGlobalSeoSettings = {
  siteName: SEO_BRAND,
  defaultTitleSuffix: `| ${SEO_BRAND}`,
  defaultMetaDescription: null,
  defaultSocialImage: null,
};

function getProvidedText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function appendDefaultTitleSuffix(
  title: string,
  suffix: string,
  siteName: string,
) {
  const normalizedTitle = normalizeSeoText(title).toLowerCase();
  const normalizedSuffix = normalizeSeoText(suffix);
  const normalizedSiteName = normalizeSeoText(siteName).toLowerCase();

  if (
    !normalizedSuffix ||
    normalizedTitle.includes(normalizedSuffix.toLowerCase()) ||
    (normalizedSiteName && normalizedTitle.includes(normalizedSiteName))
  ) {
    return title;
  }

  return `${title} ${normalizedSuffix}`;
}

export function resolveShopifyMarketingSeo({
  settings = DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS,
  page,
  fallbackTitle,
  fallbackDescription,
  fallbackImage,
}: {
  settings?: ShopifyGlobalSeoSettings | null;
  page?: ShopifySeoPage | null;
  fallbackTitle?: string | null;
  fallbackDescription?: string | null;
  fallbackImage?: string | null;
}) {
  const resolvedSettings = settings ?? DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS;
  const siteName =
    getProvidedText(resolvedSettings.siteName) ??
    DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.siteName;
  const titleSuffix =
    getProvidedText(resolvedSettings.defaultTitleSuffix) ??
    DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.defaultTitleSuffix;
  const titleBase =
    getProvidedText(page?.seoTitle) ??
    (normalizeSeoText(fallbackTitle) || siteName);
  const title = appendDefaultTitleSuffix(titleBase, titleSuffix, siteName);
  const routeFallbackDescription = resolveSeoDescription({
    fallback: fallbackDescription,
  });
  const description =
    getProvidedText(page?.metaDescription) ??
    routeFallbackDescription ??
    getProvidedText(resolvedSettings.defaultMetaDescription);
  const image =
    getProvidedText(page?.openGraphImage) ??
    getProvidedText(fallbackImage) ??
    getProvidedText(resolvedSettings.defaultSocialImage);

  return {
    title,
    description,
    image,
    openGraphTitle: getProvidedText(page?.openGraphTitle) ?? title,
    openGraphDescription:
      getProvidedText(page?.openGraphDescription) ?? description,
    noindex: page?.noindex === true,
  };
}

export function getShopifyGlobalSeoSettingsFromMatches(
  matches: ReadonlyArray<{id: string; data?: unknown} | undefined>,
) {
  const rootData = matches.find((match) => match?.id === 'root')?.data as
    | {shopifyGlobalSeoSettings?: ShopifyGlobalSeoSettings | null}
    | undefined;

  return (
    rootData?.shopifyGlobalSeoSettings ??
    DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS
  );
}
