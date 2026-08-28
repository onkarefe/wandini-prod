import {buildCanonicalUrl, resolvePaginationSeoPolicy} from '~/lib/seo';

const COLLECTION_FACET_PARAMS = ['sort', 'f'] as const;

function hasCollectionFacetState(searchParams: URLSearchParams) {
  return COLLECTION_FACET_PARAMS.some((key) =>
    searchParams.getAll(key).some((value) => value.trim().length > 0),
  );
}

export function resolveCollectionSeoPolicy(input: string | URL) {
  const url = input instanceof URL ? input : new URL(input);
  const isFacetedCollectionUrl = hasCollectionFacetState(url.searchParams);

  if (!isFacetedCollectionUrl) {
    return {
      ...resolvePaginationSeoPolicy(url),
      isFacetedCollectionUrl,
    } as const;
  }

  return {
    canonicalUrl: buildCanonicalUrl(url),
    isFacetedCollectionUrl,
    robots: 'noindex,follow',
  } as const;
}
