import type {Storefront} from '@shopify/hydrogen';
import {
  buildSimilarProductsPath,
  getLayer1SameMotifProducts,
  getLayer2SameThemeProducts,
  removeDuplicateProductsById,
} from '~/lib/similar-products';

const PREVIEW_PRODUCT_COUNT = 5;
const CANDIDATE_LIMIT = PREVIEW_PRODUCT_COUNT + 1;
const LOCALIZED_CANDIDATE_PAGE_SIZE = 100;

export const SIMILAR_MOTIFS_CATEGORY_HANDLE = 'fototapeten';

type SimilarMotifsPreviewImage = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

export type SimilarMotifsPreviewProduct = {
  id: string;
  handle: string;
  title: string;
  image: SimilarMotifsPreviewImage | null;
  minPrice: {
    amount: string;
    currencyCode: string;
  } | null;
};

export type SimilarMotifsPreviewData = {
  products: SimilarMotifsPreviewProduct[];
  similarProductsPath: string;
};

type PreviewQueryProduct = {
  id: string;
  handle: string;
  title: string;
  mainMotif?: {value?: string | null} | null;
  mainTheme?: {value?: string | null} | null;
  images?: {
    nodes?: SimilarMotifsPreviewImage[];
  } | null;
  priceRange?: {
    minVariantPrice?: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
};

type LocalizedPreviewCandidatesQueryResult = {
  collection?: {
    handle?: string | null;
    products?: {
      nodes?: PreviewQueryProduct[];
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      } | null;
    } | null;
  } | null;
};

type PreviewQueryConnection = {
  nodes?: PreviewQueryProduct[] | null;
};

type SimilarMotifsPreviewQueryResult = {
  collection?: {
    handle?: string | null;
    sameMotif?: PreviewQueryConnection | null;
    sameTheme?: PreviewQueryConnection | null;
    fallback?: PreviewQueryConnection | null;
  } | null;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function mapPreviewProduct(
  product: PreviewQueryProduct,
): SimilarMotifsPreviewProduct {
  const minVariantPrice = product.priceRange?.minVariantPrice;

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    image: product.images?.nodes?.[0] ?? null,
    minPrice: minVariantPrice
      ? {
          amount: minVariantPrice.amount,
          currencyCode: minVariantPrice.currencyCode,
        }
      : null,
  };
}

async function resolveEnglishCategoryHandle(
  storefront: Storefront,
  germanCategoryHandle: string,
) {
  const sourceCategory = await storefront.query<{
    collection?: {id?: string | null} | null;
  }>(SIMILAR_MOTIFS_CATEGORY_ID_QUERY, {
    cache: storefront.CacheLong(),
    variables: {
      categoryHandle: germanCategoryHandle,
      country: 'DE',
      language: 'DE',
    },
  });
  const categoryId = sourceCategory.collection?.id;

  if (!categoryId) {
    return null;
  }

  const localizedCategory = await storefront.query<{
    category?: {__typename?: string; handle?: string | null} | null;
  }>(SIMILAR_MOTIFS_LOCALIZED_CATEGORY_QUERY, {
    cache: storefront.CacheLong(),
    variables: {
      categoryId,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
  });

  return localizedCategory.category?.__typename === 'Collection'
    ? localizedCategory.category.handle?.trim() || null
    : null;
}

export async function resolveSimilarMotifsCategoryHandle(
  storefront: Storefront,
  categoryHandle = SIMILAR_MOTIFS_CATEGORY_HANDLE,
) {
  const normalizedCategoryHandle = normalizeText(categoryHandle);

  if (!normalizedCategoryHandle) {
    return null;
  }

  if (storefront.i18n.language !== 'EN') {
    return normalizedCategoryHandle;
  }

  return resolveEnglishCategoryHandle(storefront, normalizedCategoryHandle);
}

async function fetchLocalizedPreviewCandidates(
  storefront: Storefront,
  categoryHandle: string,
) {
  const products: PreviewQueryProduct[] = [];
  let resolvedCategoryHandle = categoryHandle;
  let endCursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: LocalizedPreviewCandidatesQueryResult =
      await storefront.query<LocalizedPreviewCandidatesQueryResult>(
        SIMILAR_MOTIFS_LOCALIZED_CANDIDATES_QUERY,
        {
          cache: storefront.CacheCustom({
            mode: 'public',
            maxAge: 60,
            staleWhileRevalidate: 300,
            staleIfError: 86_400,
          }),
          variables: {
            categoryHandle,
            first: LOCALIZED_CANDIDATE_PAGE_SIZE,
            after: endCursor,
          },
        },
      );
    const collection: LocalizedPreviewCandidatesQueryResult['collection'] =
      response.collection;

    if (!collection) {
      return null;
    }

    resolvedCategoryHandle =
      collection.handle?.trim() || resolvedCategoryHandle;
    products.push(...(collection.products?.nodes ?? []));
    hasNextPage = Boolean(collection.products?.pageInfo?.hasNextPage);
    endCursor = collection.products?.pageInfo?.endCursor ?? null;
  }

  return {categoryHandle: resolvedCategoryHandle, products};
}

export async function getSimilarMotifsPreview({
  storefront,
  sourceProductId,
  mainMotif,
  mainTheme,
  categoryHandle = SIMILAR_MOTIFS_CATEGORY_HANDLE,
}: {
  storefront: Storefront;
  sourceProductId: string;
  mainMotif: string;
  mainTheme: string;
  categoryHandle?: string;
}): Promise<SimilarMotifsPreviewData | null> {
  const normalizedMainMotif = normalizeText(mainMotif);
  const normalizedMainTheme = normalizeText(mainTheme);
  const normalizedCategoryHandle = normalizeText(categoryHandle);
  if (
    !sourceProductId ||
    !normalizedMainMotif ||
    !normalizedMainTheme ||
    !normalizedCategoryHandle
  ) {
    return null;
  }

  if (storefront.i18n.language === 'EN') {
    const localizedCategoryHandle = await resolveSimilarMotifsCategoryHandle(
      storefront,
      normalizedCategoryHandle,
    );

    if (!localizedCategoryHandle) {
      return null;
    }

    const candidateData = await fetchLocalizedPreviewCandidates(
      storefront,
      localizedCategoryHandle,
    );

    if (!candidateData) {
      return null;
    }

    const similarProductsPath = buildSimilarProductsPath({
      mainMotif: normalizedMainMotif,
      mainTheme: normalizedMainTheme,
      productCategory: candidateData.categoryHandle,
    });

    if (!similarProductsPath) {
      return null;
    }

    const rankedProducts = removeDuplicateProductsById([
      ...getLayer1SameMotifProducts({
        products: candidateData.products,
        targetMainMotif: normalizedMainMotif,
      }),
      ...getLayer2SameThemeProducts({
        products: candidateData.products,
        targetMainTheme: normalizedMainTheme,
      }),
      ...candidateData.products,
    ]);
    const products = rankedProducts
      .filter((product) => product.id !== sourceProductId)
      .slice(0, PREVIEW_PRODUCT_COUNT)
      .map(mapPreviewProduct);

    return products.length > 0 ? {products, similarProductsPath} : null;
  }

  const response = (await storefront.query(SIMILAR_MOTIFS_PREVIEW_QUERY, {
    cache: storefront.CacheCustom({
      mode: 'public',
      maxAge: 60,
      staleWhileRevalidate: 300,
      staleIfError: 86_400,
    }),
    displayName: 'SimilarMotifsPreview',
    variables: {
      categoryHandle: normalizedCategoryHandle,
      mainMotif: normalizedMainMotif,
      mainTheme: normalizedMainTheme,
      candidateLimit: CANDIDATE_LIMIT,
    },
  })) as SimilarMotifsPreviewQueryResult;

  if (!response.collection) {
    return null;
  }

  const similarProductsPath = buildSimilarProductsPath({
    mainMotif: normalizedMainMotif,
    mainTheme: normalizedMainTheme,
    productCategory:
      response.collection.handle?.trim() || normalizedCategoryHandle,
  });

  if (!similarProductsPath) {
    return null;
  }

  const selectedProducts: SimilarMotifsPreviewProduct[] = [];
  const seenProductIds = new Set<string>([sourceProductId]);
  const takeCandidates = (products?: PreviewQueryProduct[] | null) => {
    for (const product of products ?? []) {
      if (
        selectedProducts.length >= PREVIEW_PRODUCT_COUNT ||
        !product?.id ||
        !product.handle ||
        seenProductIds.has(product.id)
      ) {
        continue;
      }

      seenProductIds.add(product.id);
      selectedProducts.push(mapPreviewProduct(product));
    }
  };

  takeCandidates(response.collection.sameMotif?.nodes);
  takeCandidates(response.collection.sameTheme?.nodes);
  takeCandidates(response.collection.fallback?.nodes);

  if (selectedProducts.length === 0) {
    return null;
  }

  return {
    products: selectedProducts,
    similarProductsPath,
  };
}

const SIMILAR_MOTIFS_PREVIEW_PRODUCT_FRAGMENT = `#graphql
  fragment SimilarMotifsPreviewProduct on Product {
    id
    handle
    title
    mainMotif: metafield(namespace: "custom", key: "main_motif") {
      value
    }
    mainTheme: metafield(namespace: "custom", key: "main_theme") {
      value
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    images(first: 1) {
      nodes {
        url
        altText
        width
        height
      }
    }
  }
` as const;

const SIMILAR_MOTIFS_CATEGORY_ID_QUERY = `#graphql
  query SimilarMotifsCategoryId(
    $country: CountryCode!
    $language: LanguageCode!
    $categoryHandle: String!
  ) @inContext(country: $country, language: $language) {
    collection(handle: $categoryHandle) {
      id
    }
  }
` as const;

const SIMILAR_MOTIFS_LOCALIZED_CATEGORY_QUERY = `#graphql
  query SimilarMotifsLocalizedCategory(
    $country: CountryCode!
    $language: LanguageCode!
    $categoryId: ID!
  ) @inContext(country: $country, language: $language) {
    category: node(id: $categoryId) {
      __typename
      ... on Collection {
        handle
      }
    }
  }
` as const;

const SIMILAR_MOTIFS_LOCALIZED_CANDIDATES_QUERY = `#graphql
  ${SIMILAR_MOTIFS_PREVIEW_PRODUCT_FRAGMENT}
  query SimilarMotifsLocalizedCandidates(
    $country: CountryCode
    $language: LanguageCode
    $categoryHandle: String!
    $first: Int!
    $after: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $categoryHandle) {
      handle
      products(first: $first, after: $after) {
        nodes {
          ...SimilarMotifsPreviewProduct
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
` as const;

const SIMILAR_MOTIFS_PREVIEW_QUERY = `#graphql
  ${SIMILAR_MOTIFS_PREVIEW_PRODUCT_FRAGMENT}
  query SimilarMotifsPreview(
    $country: CountryCode
    $language: LanguageCode
    $categoryHandle: String!
    $mainMotif: String!
    $mainTheme: String!
    $candidateLimit: Int!
  ) @inContext(country: $country, language: $language) {
    collection(handle: $categoryHandle) {
      handle
      sameMotif: products(
        first: $candidateLimit
        filters: [
          {
            productMetafield: {
              namespace: "custom"
              key: "main_motif"
              value: $mainMotif
            }
          }
        ]
      ) {
        nodes {
          ...SimilarMotifsPreviewProduct
        }
      }
      sameTheme: products(
        first: $candidateLimit
        filters: [
          {
            productMetafield: {
              namespace: "custom"
              key: "main_theme"
              value: $mainTheme
            }
          }
        ]
      ) {
        nodes {
          ...SimilarMotifsPreviewProduct
        }
      }
      fallback: products(first: $candidateLimit) {
        nodes {
          ...SimilarMotifsPreviewProduct
        }
      }
    }
  }
` as const;
