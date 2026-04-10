export const DEFAULT_COLLECTION_SORT = 'BEST_SELLING' as const;

export const STOREFRONT_COLLECTION_SORT_KEYS = [
  'BEST_SELLING',
  'COLLECTION_DEFAULT',
  'CREATED',
  'ID',
  'MANUAL',
  'PRICE',
  'RELEVANCE',
  'TITLE',
] as const;

export type StorefrontCollectionSortKey =
  (typeof STOREFRONT_COLLECTION_SORT_KEYS)[number];

export type CollectionSortValue = StorefrontCollectionSortKey | 'PRICE_DESC';

export const COLLECTION_SORT_OPTIONS = [
  {label: 'Best Selling', value: 'BEST_SELLING'},
  {label: 'Newest', value: 'CREATED'},
  {label: 'Price: Low to High', value: 'PRICE'},
  {label: 'Price: High to Low', value: 'PRICE_DESC'},
  {label: 'A-Z', value: 'TITLE'},
  {label: 'Relevance', value: 'RELEVANCE'},
  {label: 'Default', value: 'COLLECTION_DEFAULT'},
  {label: 'ID', value: 'ID'},
] as const satisfies ReadonlyArray<{
  label: string;
  value: CollectionSortValue;
}>;

const COLLECTION_SORT_VALUE_SET = new Set<string>(
  COLLECTION_SORT_OPTIONS.map(({value}) => value),
);

const COLLECTION_PAGINATION_PARAM_KEYS = ['cursor', 'direction'] as const;

export function getSelectedCollectionSort(
  value: string | null | undefined,
): CollectionSortValue {
  if (value && COLLECTION_SORT_VALUE_SET.has(value)) {
    return value as CollectionSortValue;
  }

  return DEFAULT_COLLECTION_SORT;
}

export function getCollectionSortVariables(sortValue: CollectionSortValue): {
  reverse: boolean;
  sortKey: StorefrontCollectionSortKey;
} {
  if (sortValue === 'PRICE_DESC') {
    return {
      reverse: true,
      sortKey: 'PRICE',
    };
  }

  return {
    reverse: false,
    sortKey: sortValue,
  };
}

export function clearCollectionPaginationParams(
  params: URLSearchParams,
): URLSearchParams {
  for (const key of COLLECTION_PAGINATION_PARAM_KEYS) {
    params.delete(key);
  }

  return params;
}

export function normalizeCollectionSortParam(
  params: URLSearchParams,
): URLSearchParams {
  const sortValue = params.get('sort');

  if (sortValue && !COLLECTION_SORT_VALUE_SET.has(sortValue)) {
    params.set('sort', DEFAULT_COLLECTION_SORT);
  }

  return params;
}

export function replaceCollectionFilterParams(
  params: URLSearchParams,
  filterInputs: Iterable<string>,
): URLSearchParams {
  params.delete('f');

  for (const filterInput of filterInputs) {
    params.append('f', filterInput);
  }

  return params;
}
