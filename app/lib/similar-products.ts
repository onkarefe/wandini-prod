import {
  DEFAULT_LOCALE,
  prefixPathWithLocale,
  type SelectedLocale,
} from '~/lib/locale';

type SimilarMetafields = {
  mainMotif?: {value?: string | null} | null;
  mainTheme?: {value?: string | null} | null;
};

export type SimilarProductsCandidate = SimilarMetafields & {id: string};
export type SimilarProductsBaseProduct = SimilarProductsCandidate & {
  handle: string;
  title: string;
  priceRange?: {
    minVariantPrice?: {amount: string; currencyCode: string} | null;
  } | null;
  images?: {
    nodes?: Array<{
      url: string;
      altText?: string | null;
      width?: number | null;
      height?: number | null;
    }>;
  } | null;
};

export function getMetafieldTextValue(value?: {value?: string | null} | null) {
  const text = value?.value?.trim().replace(/\s+/g, ' ');
  return text || null;
}

export function slugifySimilarPart(value: string) {
  // Repair the common UTF-8-as-Latin-1 German sequences before normalizing.
  const repaired = value.replace(
    /Ã[¤¶¼„–œŸ]/g,
    (sequence) =>
      ({
        'Ã¤': 'ä',
        'Ã¶': 'ö',
        'Ã¼': 'ü',
        'Ã„': 'Ä',
        'Ã–': 'Ö',
        Ãœ: 'Ü',
        ÃŸ: 'ß',
      })[sequence] ?? sequence,
  );
  return repaired
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSimilarProductsSlug({
  mainMotif,
  mainTheme,
}: {
  mainMotif: string;
  mainTheme: string;
}) {
  const motif = slugifySimilarPart(mainMotif);
  const theme = slugifySimilarPart(mainTheme);
  // A reserved separator preserves the motif/theme boundary without IDs.
  return motif && theme ? `${motif}--${theme}` : null;
}

export function getSimilarProductsRootPath(locale = DEFAULT_LOCALE) {
  return prefixPathWithLocale('/similar-products/', locale);
}

export function buildSimilarProductsPath(
  input: {mainMotif: string; mainTheme: string},
  locale = DEFAULT_LOCALE,
) {
  const slug = buildSimilarProductsSlug(input);
  return slug
    ? prefixPathWithLocale(`/similar-products/${slug}`, locale)
    : getSimilarProductsRootPath(locale);
}

export function getSimilarProductsTarget(
  product: SimilarMetafields,
  locale: SelectedLocale = DEFAULT_LOCALE,
) {
  const mainMotif = getMetafieldTextValue(product.mainMotif);
  const mainTheme = getMetafieldTextValue(product.mainTheme);
  if (!mainMotif || !mainTheme) return null;
  const slug = buildSimilarProductsSlug({mainMotif, mainTheme});
  if (!slug) return null;
  return {
    mainMotif,
    mainTheme,
    slug,
    path: buildSimilarProductsPath({mainMotif, mainTheme}, locale),
  };
}

export function parseSimilarProductsSlug(slug: string) {
  const parts = slug.split('--');
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))
  ) {
    return null;
  }
  return {motif: parts[0], theme: parts[1]};
}

export function rankSimilarProducts<T extends SimilarProductsCandidate>({
  products,
  target,
  excludeProductId,
}: {
  products: T[];
  target: {mainMotif: string; mainTheme: string} | null;
  excludeProductId?: string | null;
}) {
  const motif = slugifySimilarPart(target?.mainMotif ?? '');
  const theme = slugifySimilarPart(target?.mainTheme ?? '');
  const tier = (product: T) => {
    const sameMotif =
      Boolean(motif) &&
      slugifySimilarPart(getMetafieldTextValue(product.mainMotif) ?? '') ===
        motif;
    const sameTheme =
      Boolean(theme) &&
      slugifySimilarPart(getMetafieldTextValue(product.mainTheme) ?? '') ===
        theme;
    return sameMotif && sameTheme ? 0 : sameMotif ? 1 : sameTheme ? 2 : 3;
  };
  const seen = new Set<string>();
  return products
    .filter((product) => {
      if (product.id === excludeProductId || seen.has(product.id)) return false;
      // Keep unrelated accessories out of fallback recommendations.
      if (
        !getMetafieldTextValue(product.mainMotif) &&
        !getMetafieldTextValue(product.mainTheme)
      )
        return false;
      seen.add(product.id);
      return true;
    })
    .sort(
      (a, b) => tier(a) - tier(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export function mergeSimilarProductsById(
  currentProducts: SimilarProductsBaseProduct[],
  incomingProducts: SimilarProductsBaseProduct[],
) {
  const seen = new Set<string>();
  return [...currentProducts, ...incomingProducts].filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}
type SimilarProductsSeoConfigEntry = {
  introContent: string;
  isWhitelisted: boolean;
  isSitemapIncluded?: boolean;
  lastModified?: string | null;
};

const SIMILAR_PRODUCTS_SEO_CONFIG: Record<
  string,
  SimilarProductsSeoConfigEntry
> = {};

export type SimilarProductsSitemapEntry = {
  slug: string;
  url: string;
  lastModified?: string | null;
};

export function getSimilarProductsSitemapEntries(origin: string) {
  const normalizedOrigin = origin.replace(/\/+$/, '');

  if (!normalizedOrigin) {
    return [] as SimilarProductsSitemapEntry[];
  }

  return Object.entries(SIMILAR_PRODUCTS_SEO_CONFIG)
    .filter(([, entry]) => {
      const hasIntroContent =
        typeof entry.introContent === 'string' &&
        entry.introContent.trim().length > 0;

      return (
        entry.isWhitelisted === true &&
        entry.isSitemapIncluded === true &&
        hasIntroContent
      );
    })
    .map(([slug, entry]) => ({
      slug,
      url: `${normalizedOrigin}/similar-products/${slug}`,
      lastModified:
        typeof entry.lastModified === 'string' &&
        entry.lastModified.trim().length > 0
          ? entry.lastModified.trim()
          : null,
    }));
}
