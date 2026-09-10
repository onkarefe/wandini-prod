import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {getSimilarMotifsPreview} from '~/lib/similar-products-preview';
import {mergeSimilarProductsById} from '~/lib/similar-products';
import {shouldRevalidate} from '~/routes/similar-products.$slug';

function product(id: string, handle = id) {
  return {
    id,
    handle,
    title: id,
    mainMotif: {value: 'Koi with lotus flowers'},
    mainTheme: {value: 'Japanese garden'},
    images: {nodes: [{url: `https://cdn.example.com/${id}.jpg`}]},
    priceRange: {
      minVariantPrice: {amount: '49.00', currencyCode: 'EUR'},
    },
    collections: {nodes: []},
    options: [],
  };
}

describe('similar products module', () => {
  it('keeps the existing page and appends only new products', () => {
    const firstPage = [product('1'), product('2')];
    const secondPage = [product('2'), product('3')];

    expect(
      mergeSimilarProductsById(firstPage, secondPage).map(({id}) => id),
    ).toEqual(['1', '2', '3']);
  });

  it('does not revalidate the route after its read-only load-more POST', () => {
    expect(
      shouldRevalidate({
        formMethod: 'POST',
        formAction: '/similar-products/koi-lotus-fototapeten',
        currentUrl: new URL(
          'https://www.wandini.shop/similar-products/koi-lotus-fototapeten',
        ),
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(false);
    expect(
      shouldRevalidate({
        formMethod: 'POST',
        formAction: '/api/wishlist',
        currentUrl: new URL(
          'https://www.wandini.shop/similar-products/koi-lotus-fototapeten',
        ),
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(true);
  });

  it('ranks English preview candidates from localized metafield values', async () => {
    const source = product('source', 'localized-source-handle');
    const sameMotif = product('motif', 'localized-motif-handle');
    const sameTheme = {
      ...product('theme', 'localized-theme-handle'),
      mainMotif: {value: 'Cranes'},
    };
    const fallback = {
      ...product('fallback', 'localized-fallback-handle'),
      mainMotif: {value: 'Forest'},
      mainTheme: {value: 'Nature'},
    };
    const storefront = {
      i18n: {language: 'EN', country: 'DE'},
      CacheLong: vi.fn(() => ({mode: 'public'})),
      CacheCustom: vi.fn(() => ({mode: 'public'})),
      query: vi.fn().mockImplementation((query: string) => {
        if (query.includes('query SimilarMotifsCategoryId')) {
          return Promise.resolve({
            collection: {id: 'gid://shopify/Collection/1'},
          });
        }

        if (query.includes('query SimilarMotifsLocalizedCategory')) {
          return Promise.resolve({
            category: {__typename: 'Collection', handle: 'wall-murals'},
          });
        }

        return Promise.resolve({
          collection: {
            id: 'gid://shopify/Collection/1',
            handle: 'wall-murals',
            products: {
              nodes: [fallback, sameTheme, sameMotif, source],
              pageInfo: {hasNextPage: false, endCursor: null},
            },
          },
        });
      }),
    };

    const preview = await getSimilarMotifsPreview({
      storefront: storefront as never,
      sourceProductId: source.id,
      mainMotif: 'Koi with lotus flowers',
      mainTheme: 'Japanese garden',
    });

    expect(preview?.products.map(({id}) => id)).toEqual([
      'motif',
      'theme',
      'fallback',
    ]);
    expect(preview?.products.map(({handle}) => handle)).toEqual([
      'localized-motif-handle',
      'localized-theme-handle',
      'localized-fallback-handle',
    ]);
    expect(preview?.similarProductsPath).toBe(
      '/similar-products/koi-with-lotus-flowers-japanese-garden-wall-murals',
    );
    const rankingQuery = storefront.query.mock.calls.find(([query]) =>
      query.includes('query SimilarMotifsLocalizedCandidates'),
    )?.[0];
    expect(rankingQuery).toContain('query SimilarMotifsLocalizedCandidates');
    expect(rankingQuery).not.toContain('productMetafield');
  });

  it('keeps German preview paths and product handles in German', async () => {
    const germanProduct = product(
      'german-product',
      'fototapete-koi-mit-lotusbluten',
    );
    const storefront = {
      i18n: {language: 'DE', country: 'DE'},
      CacheCustom: vi.fn(() => ({mode: 'public'})),
      query: vi.fn().mockResolvedValue({
        collection: {
          handle: 'fototapeten',
          sameMotif: {nodes: [germanProduct]},
          sameTheme: {nodes: []},
          fallback: {nodes: []},
        },
      }),
    };

    const preview = await getSimilarMotifsPreview({
      storefront: storefront as never,
      sourceProductId: 'source',
      mainMotif: 'Koi mit Lotusblüten',
      mainTheme: 'Japanischer Garten',
    });

    expect(preview?.products[0]?.handle).toBe('fototapete-koi-mit-lotusbluten');
    expect(preview?.similarProductsPath).toBe(
      '/similar-products/koi-mit-lotusbl-ten-japanischer-garten-fototapeten',
    );
  });

  it('has no obsolete hero-image navigation state or background styling', () => {
    const files = [
      '../routes/similar-products.$slug.tsx',
      '../components/SimilarMotifsCarousel.tsx',
      '../components/CustomProductCard.tsx',
      '../components/BestsellerProductCard.tsx',
    ];
    const source = files
      .map((path) =>
        readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'),
      )
      .join('\n');

    expect(source).not.toContain('sourceProductImageUrl');
    expect(source).not.toContain('sourceProductTitle');
    expect(source).not.toContain('backgroundImage');
  });
});
