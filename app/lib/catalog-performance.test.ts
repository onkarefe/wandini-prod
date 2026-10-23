import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  Outlet,
} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import {createStorefrontClient, InMemoryCache} from '@shopify/hydrogen';
import {loader as collectionLoader} from '~/routes/collections.$handle';
import BestsellerCollectionLayout from '~/components/BestsellerCollectionLayout';
import {getSimilarProductsPageData} from './similar-products.server';
import {getSimilarMotifsPreview} from './similar-products-preview';
import {
  rankSimilarProducts,
  type SimilarProductsBaseProduct,
} from './similar-products';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from './locale';

const product = (id: string): SimilarProductsBaseProduct => ({
  id,
  handle: 'product-' + id,
  title: 'Product ' + id,
  availableForSale: true,
  mainMotif: {value: 'Flowers'},
  mainTheme: {value: 'Garden'},
  priceRange: {minVariantPrice: {amount: '49', currencyCode: 'EUR'}},
  images: {
    nodes: ['primary', 'listing', 'unused'].map((name) => ({
      url: `https://cdn.shopify.com/s/files/1/123/files/${id}-${name}.jpg`,
      altText: name,
      width: 1200,
      height: 800,
    })),
  },
});
const products = (count: number) =>
  Array.from({length: count}, (_, i) => product(String(i).padStart(4, '0')));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {promise, release};
}

function collectionFixture({
  handle = 'cms-selected',
  pageType = ' bestseller ',
  count = 250,
  language = 'DE',
} = {}) {
  const items = products(count);
  const collection = {
    id: 'gid://shopify/Collection/1',
    handle,
    title: 'Collection',
    description: 'Description',
    pageType: {value: pageType},
    seo: {title: 'SEO title', description: 'SEO description'},
    image: null,
    products: {
      nodes: items,
      filters: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: '0',
        endCursor: 'end',
      },
    },
  };
  const storefront = {
    i18n: {language, country: 'DE'},
    CacheLong: () => ({}),
    query: vi.fn(
      async (query: string, options: {variables: Record<string, unknown>}) => {
        if (query.includes('query LanguageSwitchResource'))
          return {node: {__typename: 'Collection', handle: 'translated'}};
        const {first, last, imageCount} = options.variables;
        return {
          collection: {
            ...collection,
            products: {
              ...collection.products,
              nodes: items.slice(0, Number(first ?? last)).map((p) => ({
                ...p,
                images: {nodes: p.images!.nodes!.slice(0, Number(imageCount))},
              })),
            },
          },
        };
      },
    ),
  };
  const args = (search = '') => ({
    params: {handle},
    request: new Request(
      `https://www.wandini.shop${language === 'EN' ? '/en' : ''}/collections/${handle}${search}`,
    ),
    context: {
      storefront,
      customerAccount: {isLoggedIn: async () => false},
      env: {},
    },
  });
  return {collection, storefront, args};
}

async function lookbook(collection: unknown, language: string) {
  const routes = [
    {
      id: 'root',
      path: '/',
      loader: () => ({
        selectedLocale: language === 'EN' ? ENGLISH_LOCALE : GERMAN_LOCALE,
      }),
      element: createElement(Outlet),
      children: [
        {
          path: '*',
          element: createElement(BestsellerCollectionLayout, {
            collection: collection as never,
          }),
        },
      ],
    },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request('https://example.com/'));
  if (context instanceof Response) throw new Error('Unexpected redirect');
  return renderToStaticMarkup(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
      hydrate: false,
    }),
  );
}

describe('collection performance without presentation changes', () => {
  it.each(['DE', 'EN'])(
    'keeps all 250 CMS-selected bestsellers and identical lookbook markup (%s)',
    async (language) => {
      const fixture = collectionFixture({language});
      const result = await collectionLoader(
        fixture.args(
          '?sort=PRICE&productType=Ignored&cursor=ignored&direction=previous',
        ) as never,
      );
      expect(fixture.storefront.query).toHaveBeenCalledTimes(3);
      const collectionCalls = fixture.storefront.query.mock.calls.filter(
        ([q]) => q.includes('query CustomCollection'),
      );
      expect(collectionCalls[0][1].variables).toMatchObject({
        last: 9,
        startCursor: 'ignored',
        sortKey: 'PRICE',
      });
      expect(collectionCalls[1][1].variables).toEqual({
        handle: 'cms-selected',
        first: 250,
        filters: [],
        sortKey: 'BEST_SELLING',
        reverse: false,
        imageCount: 2,
      });
      expect(result.collection.products.nodes.map(({id}) => id)).toEqual(
        fixture.collection.products.nodes.map(({id}) => id),
      );
      expect(await lookbook(result.collection, language)).toBe(
        await lookbook(fixture.collection, language),
      );
      expect(
        result.languageSwitchLinks[language === 'EN' ? 'DE' : 'EN'],
      ).toContain('/collections/translated?sort=PRICE');
    },
  );

  it.each(['ordinary', 'bathroom-wall-murals'])(
    'keeps ordinary/room pagination at 9 (%s)',
    async (handle) => {
      const fixture = collectionFixture({handle, pageType: ''});
      const result = await collectionLoader(fixture.args() as never);
      expect(fixture.storefront.query).toHaveBeenCalledTimes(2);
      expect(result.collection.products.nodes).toHaveLength(9);
      expect(
        fixture.storefront.query.mock.calls[0][1].variables.imageCount,
      ).toBe(handle === 'ordinary' ? 3 : 10);
    },
  );

  it('still scans room mockups if the CMS selects a room handle as bestseller', async () => {
    const fixture = collectionFixture({handle: 'bathroom-wall-murals'});
    await collectionLoader(fixture.args() as never);
    expect(
      fixture.storefront.query.mock.calls
        .filter(([q]) => q.includes('query CustomCollection'))
        .map(([, options]) => options.variables.imageCount),
    ).toEqual([10, 10]);
  });

  it('starts translation and the bestseller query before either bestseller or wishlist completes', async () => {
    const fixture = collectionFixture();
    const bestseller = gate();
    const wishlist = gate();
    const original = fixture.storefront.query.getMockImplementation()!;
    fixture.storefront.query.mockImplementation(async (query, options) => {
      if (options.variables.first === 250) await bestseller.promise;
      return original(query, options);
    });
    const args = fixture.args();
    args.context.customerAccount.isLoggedIn = async () => {
      await wishlist.promise;
      return false;
    };
    const pending = collectionLoader(args as never);
    await vi.waitFor(() =>
      expect(fixture.storefront.query).toHaveBeenCalledTimes(3),
    );
    expect(
      fixture.storefront.query.mock.calls.map(([q]) =>
        q.includes('LanguageSwitchResource'),
      ),
    ).toEqual([false, true, false]);
    bestseller.release();
    wishlist.release();
    await pending;
  });

  it('keeps missing collections, missing handles and bestseller-null fallback behavior', async () => {
    const missing = collectionFixture();
    missing.storefront.query.mockResolvedValueOnce({collection: null} as never);
    await expect(
      collectionLoader(missing.args() as never),
    ).rejects.toMatchObject({status: 404});
    expect(missing.storefront.query).toHaveBeenCalledTimes(1);
    const noHandle = missing.args();
    await expect(
      collectionLoader({...noHandle, params: {}} as never),
    ).rejects.toMatchObject({status: 302});
    const fallback = collectionFixture();
    const original = fallback.storefront.query.getMockImplementation()!;
    fallback.storefront.query.mockImplementation(async (query, options) =>
      options.variables.first === 250
        ? ({collection: null} as never)
        : original(query, options),
    );
    expect(
      (await collectionLoader(fallback.args() as never)).collection.products
        .nodes,
    ).toHaveLength(9);
  });

  it('preserves localized redirects without waiting for translated-link resolution', async () => {
    const fixture = collectionFixture({language: 'EN'});
    fixture.collection.handle = 'localized';
    const translation = gate();
    const original = fixture.storefront.query.getMockImplementation()!;
    fixture.storefront.query.mockImplementation(async (query, options) => {
      if (query.includes('LanguageSwitchResource')) await translation.promise;
      return original(query, options);
    });
    try {
      await expect(
        collectionLoader(fixture.args('?sort=PRICE&utm_source=test') as never),
      ).rejects.toMatchObject({
        status: 301,
        headers: new Headers({
          Location: '/en/collections/localized?sort=PRICE',
        }),
      });
    } finally {
      translation.release();
    }
  });
});

function similarFixture(items: SimilarProductsBaseProduct[]) {
  const storefront = {
    i18n: {country: 'DE', language: 'EN'},
    CacheShort: () => ({maxAge: 1, staleWhileRevalidate: 9}),
    CacheNone: () => ({mode: 'no-store'}),
    query: vi.fn(
      async (
        query: string,
        options: {variables: Record<string, unknown>; cache: unknown},
      ) => {
        if (query.includes('query SimilarProductsCandidates')) {
          const start = Number(options.variables.after ?? 0);
          return {
            products: {
              nodes: items.slice(start, start + 250),
              pageInfo: {
                hasNextPage: start + 250 < items.length,
                endCursor: String(start + 250),
              },
            },
          };
        }
        const ids = options.variables.ids as string[];
        return {nodes: items.filter(({id}) => ids.includes(id)).reverse()};
      },
    ),
  };
  const page = (
    options: Partial<Parameters<typeof getSimilarProductsPageData>[0]> = {},
  ) =>
    getSimilarProductsPageData({
      storefront: storefront as never,
      slug: 'flowers--garden',
      ...options,
    });
  return {storefront, page};
}

describe('similar catalog performance and freshness', () => {
  it('normalizes ranking fields linearly for a large mixed catalog', () => {
    let reads = 0;
    const items = products(1000).map((p, i) => ({
      ...p,
      get mainMotif() {
        reads++;
        return {value: i % 4 < 2 ? 'Flowers' : 'Forest'};
      },
      get mainTheme() {
        reads++;
        return {value: i % 2 === 0 ? 'Garden' : 'Ocean'};
      },
    }));
    const ranked = rankSimilarProducts({
      products: [...items].reverse(),
      target: {mainMotif: 'Flowers', mainTheme: 'Garden'},
    });
    const expected = [0, 1, 2, 3].flatMap((tier) =>
      items.filter((_, i) => i % 4 === tier).map(({id}) => id),
    );
    expect(ranked.map(({id}) => id)).toEqual(expected);
    expect(reads).toBeLessThanOrEqual(3 * items.length);
  });

  it('retains three catalog cursor pages and only hydrates the requested live cards', async () => {
    const fixture = similarFixture(products(501));
    const page = await fixture.page({pageSize: 9});
    expect(page?.total).toBe(501);
    expect(page?.items.map(({id}) => id)).toEqual(
      products(9).map(({id}) => id),
    );
    const calls = fixture.storefront.query.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 3).map(([, o]) => o.variables.after)).toEqual([
      null,
      '250',
      '500',
    ]);
    expect(calls[3][1]).toMatchObject({
      cache: {mode: 'no-store'},
      variables: {imageCount: 2, ids: page?.items.map(({id}) => id)},
    });
    await getSimilarMotifsPreview({
      storefront: fixture.storefront as never,
      sourceProductId: '0000',
      sourceProductHandle: 'product-0000',
      mainMotif: 'Flowers',
      mainTheme: 'Garden',
    });
    expect(
      fixture.storefront.query.mock.lastCall?.[1].variables.imageCount,
    ).toBe(1);
  });

  it('validates snapshot slots against current eligibility and live publication, preserving consumed offsets', async () => {
    const items = products(10);
    const fixture = similarFixture(items);
    const initial = await fixture.page({pageSize: 5});
    items[5].availableForSale = false;
    items[6].mainMotif = null;
    items[6].mainTheme = null;
    const original = fixture.storefront.query.getMockImplementation()!;
    fixture.storefront.query.mockImplementation(async (query, options) => {
      if (query.includes('query SimilarProductsCards'))
        return {
          nodes: [null, {...items[8], availableForSale: false}, items[9]],
        } as never;
      return original(query, options);
    });
    const page = await fixture.page({
      productIds: initial!.productIds,
      offset: 5,
      pageSize: 5,
    });
    expect(fixture.storefront.query.mock.lastCall?.[1].variables.ids).toEqual([
      '0007',
      '0008',
      '0009',
    ]);
    expect(page).toMatchObject({nextOffset: 10, hasMore: false, total: 10});
    expect(page?.items.map(({id}) => id)).toEqual(['0009']);
    expect(page?.productIds).toEqual(initial!.productIds);
  });

  it('skips impossible slugs but retains malformed-slug recovery with a source and legacy compatibility', async () => {
    const fixture = similarFixture(products(2));
    expect(await fixture.page({slug: '%broken'})).toBeNull();
    expect(fixture.storefront.query).not.toHaveBeenCalled();
    expect(
      (await fixture.page({slug: '%broken', sourceHandle: 'product-0000'}))
        ?.target.slug,
    ).toBe('flowers--garden');
    expect(
      (await fixture.page({slug: 'flowers-garden-wall-murals'}))?.target
        .referenceProductId,
    ).toBe('0000');
  });

  it('rejects repeated catalog cursors and avoids card requests for an empty catalog', async () => {
    const empty = similarFixture([]);
    expect((await empty.page({slug: ''}))?.items).toEqual([]);
    expect(empty.storefront.query).toHaveBeenCalledTimes(1);
    const broken = similarFixture(products(251));
    broken.storefront.query.mockResolvedValue({
      products: {
        nodes: [],
        pageInfo: {hasNextPage: true, endCursor: 'repeated'},
      },
    });
    await expect(broken.page()).rejects.toThrow(
      'Invalid Similar Motifs catalog cursor',
    );
    expect(broken.storefront.query).toHaveBeenCalledTimes(2);
  });

  it('reuses Hydrogen candidate cache across preview/listing but isolates country/language and never caches cards', async () => {
    const cache = new InMemoryCache();
    const pending: Promise<unknown>[] = [];
    const fetched: {query: string; variables: Record<string, unknown>}[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as (typeof fetched)[number];
        fetched.push(body);
        const item = {
          ...product('one'),
          handle:
            String(body.variables.language) +
            '-' +
            String(body.variables.country),
        };
        const data = body.query.includes('query SimilarProductsCandidates')
          ? {
              products: {
                nodes: [item],
                pageInfo: {hasNextPage: false, endCursor: null},
              },
            }
          : {nodes: [item]};
        return Response.json({data});
      }),
    );
    try {
      const client = (language: 'DE' | 'EN', country: 'DE' | 'AT') =>
        createStorefrontClient({
          storeDomain: 'test.myshopify.com',
          privateStorefrontToken: 'test',
          storefrontApiVersion: '2025-07',
          cache,
          waitUntil: (promise) => {
            pending.push(promise);
          },
          i18n: {language, country},
        }).storefront;
      const en = client('EN', 'DE');
      await getSimilarMotifsPreview({
        storefront: en,
        sourceProductId: 'source',
        sourceProductHandle: 'source',
        mainMotif: 'Flowers',
        mainTheme: 'Garden',
      });
      await Promise.all(pending);
      const page = await getSimilarProductsPageData({
        storefront: en,
        slug: 'flowers--garden',
      });
      expect(page?.items[0].handle).toBe('EN-DE');
      expect(
        fetched.filter(({query}) =>
          query.includes('query SimilarProductsCandidates'),
        ),
      ).toHaveLength(1);
      expect(
        fetched.filter(({query}) =>
          query.includes('query SimilarProductsCards'),
        ),
      ).toHaveLength(2);
      for (const [language, country] of [
        ['DE', 'DE'],
        ['EN', 'AT'],
      ] as const) {
        const localized = await getSimilarProductsPageData({
          storefront: client(language, country),
          slug: 'flowers--garden',
        });
        expect(localized?.items[0].handle).toBe(`${language}-${country}`);
      }
      expect(
        fetched.filter(({query}) =>
          query.includes('query SimilarProductsCandidates'),
        ),
      ).toHaveLength(3);
      await Promise.all(pending);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
