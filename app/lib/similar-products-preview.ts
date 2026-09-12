import type {Storefront} from '@shopify/hydrogen';
import {getSimilarProductsTarget} from '~/lib/similar-products';
import {getSimilarProductsPageData} from '~/lib/similar-products.server';
import {getLocaleFromI18n} from '~/lib/locale';

export type SimilarMotifsPreviewProduct = {
  id: string;
  handle: string;
  title: string;
  image: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  minPrice: {amount: string; currencyCode: string} | null;
};

export type SimilarMotifsPreviewData = {
  products: SimilarMotifsPreviewProduct[];
  similarProductsPath: string;
};

export async function getSimilarMotifsPreview({
  storefront,
  sourceProductId,
  sourceProductHandle,
  mainMotif,
  mainTheme,
}: {
  storefront: Storefront;
  sourceProductId: string;
  sourceProductHandle: string;
  mainMotif: string;
  mainTheme: string;
}): Promise<SimilarMotifsPreviewData | null> {
  const target = getSimilarProductsTarget(
    {
      handle: sourceProductHandle,
      mainMotif: {value: mainMotif},
      mainTheme: {value: mainTheme},
    },
    getLocaleFromI18n(storefront.i18n),
  );
  if (!target) return null;

  const page = await getSimilarProductsPageData({
    storefront,
    slug: target.slug,
    excludeProductId: sourceProductId,
    pageSize: 5,
  });
  if (!page || !page.items.length) return null;

  return {
    similarProductsPath: target.path,
    products: page.items.map((product) => ({
      id: product.id,
      handle: product.handle,
      title: product.title,
      image: product.images?.nodes?.[0] ?? null,
      minPrice: product.priceRange?.minVariantPrice ?? null,
    })),
  };
}
