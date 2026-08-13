import type {Storefront} from '@shopify/hydrogen';
import {buildSimilarProductsPath} from '~/lib/similar-products';

const PREVIEW_PRODUCT_COUNT = 5;
const CANDIDATE_LIMIT = PREVIEW_PRODUCT_COUNT + 1;

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
  sourceProductTitle: string;
  sourceProductImageUrl: string | null;
};

type PreviewQueryProduct = {
  id: string;
  handle: string;
  title: string;
  images?: {
    nodes?: SimilarMotifsPreviewImage[] | null;
  } | null;
  priceRange?: {
    minVariantPrice?: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
};

type PreviewQueryConnection = {
  nodes?: PreviewQueryProduct[] | null;
};

type SimilarMotifsPreviewQueryResult = {
  collection?: {
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

export async function getSimilarMotifsPreview({
  storefront,
  sourceProductId,
  sourceProductTitle,
  sourceProductImageUrl,
  mainMotif,
  mainTheme,
  categoryHandle = SIMILAR_MOTIFS_CATEGORY_HANDLE,
}: {
  storefront: Storefront;
  sourceProductId: string;
  sourceProductTitle: string;
  sourceProductImageUrl?: string | null;
  mainMotif: string;
  mainTheme: string;
  categoryHandle?: string;
}): Promise<SimilarMotifsPreviewData | null> {
  const normalizedMainMotif = normalizeText(mainMotif);
  const normalizedMainTheme = normalizeText(mainTheme);
  const normalizedCategoryHandle = normalizeText(categoryHandle);
  const similarProductsPath = buildSimilarProductsPath({
    mainMotif: normalizedMainMotif,
    mainTheme: normalizedMainTheme,
    productCategory: normalizedCategoryHandle,
  });

  if (
    !sourceProductId ||
    !normalizedMainMotif ||
    !normalizedMainTheme ||
    !normalizedCategoryHandle ||
    !similarProductsPath
  ) {
    return null;
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
    sourceProductTitle,
    sourceProductImageUrl: sourceProductImageUrl ?? null,
  };
}

const SIMILAR_MOTIFS_PREVIEW_PRODUCT_FRAGMENT = `#graphql
  fragment SimilarMotifsPreviewProduct on Product {
    id
    handle
    title
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
