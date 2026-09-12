import type {Storefront} from '@shopify/hydrogen';
import {
  getMetafieldTextValue,
  getSimilarProductsTarget,
  parseSimilarProductsSlug,
  rankSimilarProducts,
  slugifySimilarPart,
  type SimilarProductsCandidate,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';

type CandidateConnection = {
  products: {
    nodes: SimilarProductsCandidate[];
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
  };
};

// Hydrogen's existing query cache is partitioned by country/language variables.
// Only IDs and translated grouping fields are loaded for the catalog.
async function fetchSimilarProductsCandidates(storefront: Storefront) {
  const products: SimilarProductsCandidate[] = [];
  let after: string | null = null;
  const cursors = new Set<string>();
  while (true) {
    const data: CandidateConnection =
      await storefront.query<CandidateConnection>(
        SIMILAR_PRODUCTS_CANDIDATES_QUERY,
        {
          cache: storefront.CacheShort(),
          variables: {...storefront.i18n, first: 250, after},
        },
      );
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    const next = data.products.pageInfo.endCursor;
    if (!next || cursors.has(next))
      throw new Error('Invalid Similar Motifs catalog cursor');
    cursors.add(next);
    after = next;
  }
  return products;
}

type ResolvedTarget = {
  slug: string;
  mainMotif: string;
  mainTheme: string;
  referenceProductId: string | null;
};

function resolveTarget(
  products: SimilarProductsCandidate[],
  slug: string,
): ResolvedTarget | null {
  if (!slug)
    return {slug: '', mainMotif: '', mainTheme: '', referenceProductId: null};
  const parts = parseSimilarProductsSlug(slug);
  if (parts) {
    // Resolve the two independently encoded fields; no reference-product slug search.
    const matches = products
      .filter(
        (product) =>
          slugifySimilarPart(getMetafieldTextValue(product.mainMotif) ?? '') ===
            parts.motif &&
          slugifySimilarPart(getMetafieldTextValue(product.mainTheme) ?? '') ===
            parts.theme,
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const source = matches[0];
    const target = source && getSimilarProductsTarget(source);
    return target
      ? {
          slug: target.slug,
          mainMotif: target.mainMotif,
          mainTheme: target.mainTheme,
          referenceProductId: source.id,
        }
      : null;
  }

  // Small compatibility bridge for known production URLs. Collection names
  // play no role in the current identity, candidate source, or recommendation rules.
  const legacy = slug.replace(/-(fototapeten|wall-murals)$/, '');
  if (legacy === slug) return null;
  const oldPart = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const groups = new Map<string, ResolvedTarget>();
  for (const product of products) {
    const target = getSimilarProductsTarget(product);
    if (!target) continue;
    const oldSlug = `${oldPart(target.mainMotif)}-${oldPart(target.mainTheme)}`;
    const repairedSlug = `${slugifySimilarPart(target.mainMotif)}-${slugifySimilarPart(target.mainTheme)}`;
    if (legacy !== oldSlug && legacy !== repairedSlug) continue;
    const existing = groups.get(target.slug);
    if (!existing || product.id < existing.referenceProductId!) {
      groups.set(target.slug, {
        slug: target.slug,
        mainMotif: target.mainMotif,
        mainTheme: target.mainTheme,
        referenceProductId: product.id,
      });
    }
  }
  return groups.size === 1 ? [...groups.values()][0] : null;
}

export async function getSimilarProductsPageData({
  storefront,
  slug = '',
  offset = 0,
  pageSize = 15,
  excludeProductId,
}: {
  storefront: Storefront;
  slug?: string;
  offset?: number;
  pageSize?: number;
  excludeProductId?: string | null;
}) {
  const candidates = await fetchSimilarProductsCandidates(storefront);
  const target = resolveTarget(candidates, slug);
  if (!target) return null;
  const ranked = rankSimilarProducts({
    products: candidates,
    target: target.slug ? target : null,
    excludeProductId,
  });
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const size = Number.isFinite(pageSize)
    ? Math.min(250, Math.max(1, Math.floor(pageSize)))
    : 15;
  const ids = ranked.slice(start, start + size).map(({id}) => id);
  const data = ids.length
    ? await storefront.query<{nodes: (SimilarProductsBaseProduct | null)[]}>(
        SIMILAR_PRODUCTS_CARDS_QUERY,
        {
          cache: storefront.CacheShort(),
          variables: {...storefront.i18n, ids},
        },
      )
    : {nodes: []};
  const cards = new Map(
    data.nodes.flatMap((product) =>
      product?.id && product.handle ? [[product.id, product] as const] : [],
    ),
  );
  return {
    target,
    introContent: null,
    items: ids.flatMap((id) => (cards.has(id) ? [cards.get(id)!] : [])),
    total: ranked.length,
    // Advance by consumed candidates, including products deleted between queries.
    nextOffset: start + ids.length,
    hasMore: start + ids.length < ranked.length,
  };
}

const SIMILAR_PRODUCTS_CANDIDATES_QUERY = `#graphql
  query SimilarProductsCandidates(
    $country: CountryCode
    $language: LanguageCode
    $first: Int!
    $after: String
  ) @inContext(country: $country, language: $language) {
    products(first: $first, after: $after, sortKey: ID) {
      nodes {
        id
        mainMotif: metafield(namespace: "custom", key: "main_motif") { value }
        mainTheme: metafield(namespace: "custom", key: "main_theme") { value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
` as const;

const SIMILAR_PRODUCTS_CARDS_QUERY = `#graphql
  query SimilarProductsCards(
    $country: CountryCode
    $language: LanguageCode
    $ids: [ID!]!
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        title
        mainMotif: metafield(namespace: "custom", key: "main_motif") { value }
        mainTheme: metafield(namespace: "custom", key: "main_theme") { value }
        priceRange { minVariantPrice { amount currencyCode } }
        images(first: 3) { nodes { url altText width height } }
      }
    }
  }
` as const;
