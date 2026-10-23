import type {Storefront} from '@shopify/hydrogen';
import {
  getMetafieldTextValue,
  filterSimilarProducts,
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
    let source: SimilarProductsCandidate | undefined;
    for (const product of products) {
      if (
        product.availableForSale !== false &&
        (!source || product.id < source.id) &&
        slugifySimilarPart(getMetafieldTextValue(product.mainMotif) ?? '') ===
          parts.motif &&
        slugifySimilarPart(getMetafieldTextValue(product.mainTheme) ?? '') ===
          parts.theme
      )
        source = product;
    }
    if (!source) return null;
    const target = getSimilarProductsTarget(source);
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
    if (product.availableForSale === false) continue;
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
  sourceHandle = '',
  productIds,
  imageCount = 2,
}: {
  storefront: Storefront;
  slug?: string;
  offset?: number;
  pageSize?: number;
  excludeProductId?: string | null;
  sourceHandle?: string;
  productIds?: string[];
  imageCount?: 1 | 2;
}) {
  // A source handle can repair even a malformed slug after a grouping edit.
  // Without one, only canonical or recognized legacy slugs can resolve.
  if (
    slug &&
    !sourceHandle &&
    !parseSimilarProductsSlug(slug) &&
    !/-(fototapeten|wall-murals)$/.test(slug)
  )
    return null;
  const candidates = await fetchSimilarProductsCandidates(storefront);
  const sourceProduct = sourceHandle
    ? candidates.find((product) => product.handle === sourceHandle)
    : null;
  const sourceTarget = sourceProduct && getSimilarProductsTarget(sourceProduct);
  if (slug && sourceProduct && !sourceTarget) return null;
  // A known source makes a stale group URL safely recoverable after a metafield edit.
  const target = resolveTarget(
    candidates,
    slug && sourceTarget ? sourceTarget.slug : slug,
  );
  if (!target) return null;
  const sourceProductId = excludeProductId || sourceProduct?.id || null;
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const size = Number.isFinite(pageSize)
    ? Math.min(250, Math.max(1, Math.floor(pageSize)))
    : 15;
  // Keep the first request's order across publication/metafield changes.
  // IDs stay in loader/form data, never in the URL.
  const orderedIds =
    productIds ??
    rankSimilarProducts({
      products: candidates,
      target: target.slug ? target : null,
      excludeProductId: sourceProductId,
    }).map(({id}) => id);
  const slots = orderedIds.slice(start, start + size);
  // A submitted sequence needs eligibility checks, never another full ranking.
  // On the first page every ranked ID is already eligible.
  const requestedIds = new Set(slots);
  const eligibleIds = productIds
    ? new Set(
        filterSimilarProducts(
          candidates.filter(({id}) => requestedIds.has(id)),
          sourceProductId,
        ).map(({id}) => id),
      )
    : null;
  const ids = eligibleIds ? slots.filter((id) => eligibleIds.has(id)) : slots;
  const data = ids.length
    ? await storefront.query<{nodes: (SimilarProductsBaseProduct | null)[]}>(
        SIMILAR_PRODUCTS_CARDS_QUERY,
        {
          // Check current publication/availability when hydrating the requested cards.
          cache: storefront.CacheNone(),
          variables: {...storefront.i18n, ids, imageCount},
        },
      )
    : {nodes: []};
  const cards = new Map(
    data.nodes.flatMap((product) =>
      product?.id &&
      product.handle?.trim() &&
      product.title?.trim() &&
      product.availableForSale !== false
        ? [[product.id, product] as const]
        : [],
    ),
  );
  return {
    target,
    sourceHandle,
    sourceProductId,
    productIds: orderedIds,
    introContent: null,
    items: ids.flatMap((id) => (cards.has(id) ? [cards.get(id)!] : [])),
    total: orderedIds.length,
    // Advance by consumed candidates, including products deleted between queries.
    nextOffset: start + slots.length,
    hasMore: start + slots.length < orderedIds.length,
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
        handle
        availableForSale
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
    $imageCount: Int!
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        title
        availableForSale
        mainMotif: metafield(namespace: "custom", key: "main_motif") { value }
        mainTheme: metafield(namespace: "custom", key: "main_theme") { value }
        priceRange { minVariantPrice { amount currencyCode } }
        images(first: $imageCount) { nodes { url altText width height } }
      }
    }
  }
` as const;
