import {fileURLToPath} from 'node:url';
import {createElement, type ReactElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  Outlet,
  matchRoutes,
  type RouteObject,
} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import Collection, {
  loader as collectionLoader,
} from '~/routes/collections.$handle';
import Search, {loader as searchLoader} from '~/routes/search';
import {loader as productLoader} from '~/routes/products.$handle';
import SimilarPage, {
  loader,
  action,
  shouldRevalidate,
} from '~/routes/similar-products.$slug';
import * as rootRoute from '~/routes/similar-products._index';
import * as catchRoute from '~/routes/similar-products.$';
import {loader as localeLoader} from '~/routes/locale';
import CustomProductCard from '~/components/CustomProductCard';
import {
  getSimilarProductsTarget,
  parseSimilarProductsSlug,
  buildSimilarProductsSlug,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import {getSimilarProductsPageData} from '~/lib/similar-products.server';
import {
  getLocaleFromRequest,
  GERMAN_LOCALE,
  ENGLISH_LOCALE,
  type SelectedLocale,
} from '~/lib/locale';

// Collection/search pagination and analytics are outside this audit. Isolate
// their Hydrogen wrappers, whose external ESM router context differs in Vitest;
// the actual route loaders, card rendering and Similar Motifs service stay real.
vi.mock('@shopify/hydrogen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopify/hydrogen')>();
  const PageLink = ({children}: {children: ReactNode}) =>
    createElement('a', {href: '#'}, children);
  return {
    ...actual,
    Analytics: {
      ...actual.Analytics,
      CollectionView: () => null,
      SearchView: () => null,
    },
    Pagination: ({
      connection,
      children,
    }: {
      connection: {nodes: unknown[]};
      children: (value: unknown) => ReactNode;
    }) =>
      children({
        nodes: connection.nodes,
        isLoading: false,
        NextLink: PageLink,
        PreviousLink: PageLink,
      }),
  };
});

function product(
  id: string,
  locale = ENGLISH_LOCALE,
): SimilarProductsBaseProduct {
  return {
    id,
    handle: locale.language === 'DE' ? 'blumen-' + id : 'flowers-' + id,
    title: locale.language === 'DE' ? 'Blumen ' + id : 'Flowers ' + id,
    availableForSale: true,
    mainMotif: {value: locale.language === 'DE' ? 'Blumen' : 'Flowers'},
    mainTheme: {value: locale.language === 'DE' ? 'Botanisch' : 'Botanical'},
    images: {nodes: [{url: 'https://example.com/image.jpg'}]},
    priceRange: {minVariantPrice: {amount: '49', currencyCode: 'EUR'}},
  };
}

function storefrontFor(
  products: SimilarProductsBaseProduct[],
  locale = ENGLISH_LOCALE,
) {
  const connection = {
    nodes: products,
    filters: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: 'start',
      endCursor: 'end',
    },
  };
  const collection = {
    id: 'collection',
    handle: locale.language === 'DE' ? 'fototapeten' : 'wall-murals',
    title: 'Collection',
    description: '',
    products: connection,
  };
  return {
    i18n: {language: locale.language, country: 'DE'},
    CacheShort: () => ({}),
    CacheLong: () => ({}),
    CacheNone: () => ({mode: 'no-store'}),
    query: vi.fn(
      async (
        query: string,
        options: {variables?: Record<string, unknown>} = {},
      ) => {
        if (query.includes('query SimilarProductsCandidates'))
          return {
            products: {
              nodes: products.map(
                ({id, handle, mainMotif, mainTheme, availableForSale}) => ({
                  id,
                  handle,
                  mainMotif,
                  mainTheme,
                  availableForSale,
                }),
              ),
              pageInfo: {hasNextPage: false, endCursor: null},
            },
          };
        if (query.includes('query SimilarProductsCards')) {
          return {
            nodes: products.filter(({id}) =>
              (options?.variables?.ids as string[]).includes(id),
            ),
          };
        }
        if (query.includes('query SimilarProductsLanguageSwitch')) {
          const targetLocale =
            options.variables?.language === 'DE'
              ? GERMAN_LOCALE
              : ENGLISH_LOCALE;
          return {
            product: {
              __typename: 'Product',
              ...product(String(options.variables?.productId), targetLocale),
            },
          };
        }
        if (query.includes('query LanguageSwitchResource')) return {node: null};
        if (query.includes('query CustomCollection')) return {collection};
        if (query.includes('query RegularSearch'))
          return {
            products: connection,
            pages: {nodes: []},
            articles: {nodes: []},
          };
        if (query.includes('query Product('))
          return {
            product: {
              ...products[0],
              options: [],
              selectedOrFirstAvailableVariant: null,
              images: {edges: []},
              descriptionHtml: '',
            },
          };
        throw new Error('Unexpected query');
      },
    ),
  };
}

function context(storefront: ReturnType<typeof storefrontFor>) {
  return {
    storefront,
    customerAccount: {isLoggedIn: async () => false},
    env: {},
  };
}
function args(
  storefront: ReturnType<typeof storefrontFor>,
  path: string,
  params: Record<string, string> = {},
  body?: URLSearchParams,
) {
  return {
    context: context(storefront),
    params,
    request: new Request(
      'https://www.wandini.shop' + path,
      body ? {method: 'POST', body} : undefined,
    ),
  } as never;
}
function paginationBody(
  page: Awaited<ReturnType<typeof loader>>,
  offset = page.nextOffset,
) {
  return new URLSearchParams({
    offset: String(offset),
    pagination: JSON.stringify({
      slug: page.target.slug,
      language: page.selectedLocale.language,
      sourceHandle: page.sourceHandle,
      ids: page.productIds,
    }),
  });
}
async function markup(
  element: ReactElement,
  data: unknown,
  locale: SelectedLocale,
  path: string,
) {
  const routes: RouteObject[] = [
    {
      id: 'root',
      path: '/',
      loader: () => ({selectedLocale: locale}),
      element: createElement(Outlet),
      children: [{id: 'page', path: '*', loader: () => data, element}],
    },
  ];
  const handler = createStaticHandler(routes);
  const result = await handler.query(
    new Request('https://www.wandini.shop' + path),
  );
  if (result instanceof Response) throw new Error('Unexpected redirect');
  return renderToStaticMarkup(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, result),
      context: result,
      hydrate: false,
    }),
  );
}
function similarHref(html: string) {
  const link = [...html.matchAll(/<a\b[^>]*>/g)].find(([tag]) =>
    tag.includes('custom-product-card__similar-motifs'),
  )?.[0];
  return link?.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
}

describe('Similar Motifs final stabilization', () => {
  it.each([GERMAN_LOCALE, ENGLISH_LOCALE])(
    'proves collection/PDP/search targets and full-page source exclusion using the actual entry points (%s)',
    async (locale) => {
      const source = product('source', locale);
      const storefront = storefrontFor(
        [source, product('other', locale)],
        locale,
      );
      const target = getSimilarProductsTarget(source, locale)!;
      const handle = locale.language === 'DE' ? 'fototapeten' : 'wall-murals';
      const collectionPath = locale.pathPrefix + '/collections/' + handle;
      const collection = await collectionLoader(
        args(storefront, collectionPath, {handle}),
      );
      const collectionHtml = await markup(
        createElement(Collection),
        collection,
        locale,
        collectionPath,
      );
      const searchPath = locale.pathPrefix + '/search?q=flowers';
      const search = await searchLoader(args(storefront, searchPath));
      const searchHtml = await markup(
        createElement(Search),
        search,
        locale,
        searchPath,
      );
      const pdp = await productLoader(
        args(storefront, locale.pathPrefix + '/products/' + source.handle, {
          handle: source.handle,
        }),
      );
      const preview = await pdp.similarMotifsPreview;
      expect(similarHref(collectionHtml)).toBe(target.path);
      expect(similarHref(searchHtml)).toBe(target.path);
      expect(preview?.similarProductsPath).toBe(target.path);
      const page = await loader(
        args(storefront, target.path, {slug: target.slug}),
      );
      expect(page.items.map(({id}) => id)).toEqual(['other']);
      expect(preview?.products.map(({id}) => id)).toEqual(['other']);
      const fullHtml = await markup(
        createElement(SimilarPage),
        page,
        locale,
        target.path,
      );
      expect(fullHtml).toContain(
        'href="' +
          locale.pathPrefix +
          '/products/' +
          product('other', locale).handle +
          '"',
      );
      expect(fullHtml).not.toContain('/en/en/');
    },
  );

  it.each([GERMAN_LOCALE, ENGLISH_LOCALE])(
    'renders separate native product/Similar links and wishlist button without nested interaction (%s)',
    async (locale) => {
      for (const similarProductsUrl of [
        undefined,
        '',
        '  ',
        locale.pathPrefix + '/similar-products/flowers--botanical',
      ]) {
        const html = await markup(
          createElement(CustomProductCard, {
            productId: 'source',
            title: 'Product',
            images: [{url: 'https://example.com/image.jpg'}],
            productUrl: '/products/localized-handle',
            showSimilarMotifsButton: true,
            similarProductsUrl,
          }),
          {},
          locale,
          locale.pathPrefix + '/collections/fototapeten',
        );
        expect(html).toContain('<article class="custom-product-card">');
        expect(html).toContain(
          'href="' + locale.pathPrefix + '/products/localized-handle"',
        );
        expect(similarHref(html)).toBe(
          similarProductsUrl?.trim() ||
            locale.pathPrefix + '/similar-products/',
        );
        for (const [, contents] of html.matchAll(
          /<a\b[^>]*>([\s\S]*?)<\/a>/g,
        )) {
          expect(contents).not.toMatch(/<(?:a|button|input|select)\b/);
        }
        expect(html.match(/<button\b/g)).toHaveLength(1);
        expect(html).toContain('type="button"');
      }
    },
  );

  it('retains ordinary hyphens and rejects empty or ambiguous separators', () => {
    const slug = buildSimilarProductsSlug({
      mainMotif: 'Koi-Lotus -- Blüten',
      mainTheme: 'Japanischer-Garten -- Natur',
    })!;
    expect(slug).toBe('koi-lotus-bluten--japanischer-garten-natur');
    expect(parseSimilarProductsSlug(slug)).toEqual({
      motif: 'koi-lotus-bluten',
      theme: 'japanischer-garten-natur',
    });
    for (const bad of [
      '--theme',
      'motif--',
      '-motif--theme',
      'motif--theme-',
      'motif---theme',
      'motif--theme--extra',
    ]) {
      expect(parseSimilarProductsSlug(bad)).toBeNull();
    }
    for (const blank of ['', ' ', '---', '!!!']) {
      expect(
        buildSimilarProductsSlug({mainMotif: blank, mainTheme: 'Nature'}),
      ).toBeNull();
      expect(
        buildSimilarProductsSlug({mainMotif: 'Flowers', mainTheme: blank}),
      ).toBeNull();
    }
  });

  it.each([GERMAN_LOCALE, ENGLISH_LOCALE])(
    'preserves source exclusion and localized source handles through language switching (%s)',
    async (locale) => {
      const source = product('source', locale);
      const storefront = storefrontFor(
        [product('a-reference', locale), source, product('other', locale)],
        locale,
      );
      const target = getSimilarProductsTarget(source, locale)!;
      const page = await loader(
        args(storefront, target.path, {slug: target.slug}),
      );
      const otherLocale =
        locale.language === 'DE' ? ENGLISH_LOCALE : GERMAN_LOCALE;
      const expected = getSimilarProductsTarget(
        product('source', otherLocale),
        otherLocale,
      )!;
      expect(page.languageSwitchLinks[otherLocale.language]).toBe(
        expected.path,
      );
      const translated = await loader(
        args(
          storefrontFor(
            [product('source', otherLocale), product('other', otherLocale)],
            otherLocale,
          ),
          expected.path,
          {slug: expected.slug},
        ),
      );
      expect(translated.items.map(({id}) => id)).toEqual(['other']);
    },
  );

  it('keeps pagination boundaries stable when products are inserted, deleted or reranked between requests', async () => {
    const products = Array.from({length: 25}, (_, i) =>
      product(String(i).padStart(2, '0')),
    );
    const source = products[0];
    const storefront = storefrontFor(products);
    const target = getSimilarProductsTarget(source, ENGLISH_LOCALE)!;
    const first = await loader(
      args(storefront, target.path, {slug: target.slug}),
    );
    expect(first.items.map(({id}) => id)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
    ]);
    products.splice(2, 1); // A removed earlier item must not shift page two.
    products.push(product('00-new')); // A new earlier item must not repeat page one.
    products.find((p) => p.id === '10')!.mainMotif = {value: 'Changed'};
    const response = await action(
      args(storefront, target.path, {slug: target.slug}, paginationBody(first)),
    );
    const second = (await response.json()) as typeof first;
    expect(second.items.map(({id}) => id)).toEqual([
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
    ]);
    expect(
      second.items.some(
        ({id}) => first.items.some((p) => p.id === id) || id === source.id,
      ),
    ).toBe(false);
    const final = await action(
      args(
        storefront,
        target.path,
        {slug: target.slug},
        paginationBody(first, second.nextOffset),
      ),
    );
    expect(await final.json()).toMatchObject({nextOffset: 24, hasMore: false});
    const cardCalls = storefront.query.mock.calls.filter(([q]) =>
      q.includes('query SimilarProductsCards'),
    );
    expect(
      cardCalls.map(
        ([, options]) => (options?.variables?.ids as string[]).length,
      ),
    ).toEqual([9, 9, 6]);
  });

  it('skips unavailable, unpublished and malformed cards while consuming their original pagination slots', async () => {
    const products = [
      product('source'),
      {...product('unavailable'), availableForSale: false},
      product('good'),
      product('deleted'),
      product('blank'),
    ];
    const storefront = storefrontFor(products);
    const original = storefront.query.getMockImplementation()!;
    storefront.query.mockImplementation(async (query, options) => {
      if (query.includes('query SimilarProductsCards'))
        return {
          nodes: [
            null,
            {...product('blank'), handle: ' '},
            {...product('good'), availableForSale: false},
          ],
        } as never;
      return original(query, options);
    });
    const target = getSimilarProductsTarget(products[0])!;
    const page = await getSimilarProductsPageData({
      storefront: storefront as never,
      slug: target.slug,
      sourceHandle: products[0].handle,
      pageSize: 3,
    });
    expect(page?.items).toEqual([]);
    expect(page?.productIds).not.toContain('unavailable');
    expect(page?.productIds).not.toContain('source');
    expect(page?.nextOffset).toBe(3);
    expect(page?.hasMore).toBe(false);
  });

  it('does not guess when a legacy flattened URL matches two different groups', async () => {
    const products = [
      {
        ...product('a'),
        mainMotif: {value: 'Red flowers'},
        mainTheme: {value: 'Garden'},
      },
      {
        ...product('b'),
        mainMotif: {value: 'Red'},
        mainTheme: {value: 'Flowers garden'},
      },
    ];
    const storefront = storefrontFor(products);
    await expect(
      loader(
        args(
          storefront,
          '/en/similar-products/red-flowers-garden-wall-murals',
          {slug: 'red-flowers-garden-wall-murals'},
        ),
      ),
    ).rejects.toMatchObject({
      status: 302,
      headers: new Headers({Location: '/en/similar-products/'}),
    });
  });

  it('recovers a stale source group using its exact localized product handle', async () => {
    const source = product('source');
    const oldTarget = getSimilarProductsTarget(source, ENGLISH_LOCALE)!;
    source.mainTheme = {value: 'New theme'};
    const newTarget = getSimilarProductsTarget(source, ENGLISH_LOCALE)!;
    const storefront = storefrontFor([
      product('old-group'),
      source,
      product('other'),
    ]);
    for (const body of [undefined, new URLSearchParams({offset: '0'})]) {
      await expect(
        (body ? action : loader)(
          args(storefront, oldTarget.path, {slug: oldTarget.slug}, body),
        ),
      ).rejects.toMatchObject({
        status: 302,
        headers: new Headers({Location: newTarget.path}),
      });
    }
  });

  it('rejects malformed offsets and pagination from a different locale/source/group', async () => {
    const storefront = storefrontFor([product('source'), product('other')]);
    const target = getSimilarProductsTarget(product('source'), ENGLISH_LOCALE)!;
    const page = await loader(
      args(storefront, target.path, {slug: target.slug}),
    );
    for (const offset of ['1junk', '1.5', '-1', 'NaN', '9007199254740992']) {
      const response = await action(
        args(
          storefront,
          target.path,
          {slug: target.slug},
          new URLSearchParams({offset}),
        ),
      );
      expect(response.status).toBe(400);
    }
    for (const override of [
      {language: 'DE'},
      {sourceHandle: 'other'},
      {slug: 'wrong--group'},
      {ids: ['duplicate', 'duplicate']},
    ]) {
      const body = paginationBody(page);
      const snapshot = JSON.parse(body.get('pagination')!) as Record<
        string,
        unknown
      >;
      body.set('pagination', JSON.stringify({...snapshot, ...override}));
      expect(
        (await action(args(storefront, target.path, {slug: target.slug}, body)))
          .status,
      ).toBe(400);
    }
    expect(
      shouldRevalidate({
        formMethod: 'POST',
        formAction: target.path,
        currentUrl: new URL('https://example.com' + target.path),
        nextUrl: new URL('https://example.com' + target.path + '&changed=1'),
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(true);
  });

  it('uses the actual repository route configuration to render DE/EN roots and resolve malformed URLs', async () => {
    vi.stubGlobal(
      '__reactRouterAppDirectory',
      fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, ''),
    );
    const configuration = await (await import('~/routes')).default;
    vi.unstubAllGlobals();
    const mapRoutes = (entries: typeof configuration): RouteObject[] =>
      entries.map((entry) => {
        const base = {
          id: entry.id,
          path: entry.path,
          index: entry.index,
          element: createElement(Outlet),
        };
        const implementation =
          entry.file === 'routes/similar-products._index.tsx'
            ? rootRoute
            : entry.file === 'routes/similar-products.$slug.tsx'
              ? {loader, action, default: SimilarPage}
              : entry.file === 'routes/similar-products.$.tsx'
                ? catchRoute
                : null;
        return {
          ...base,
          ...(entry.file === 'routes/locale.tsx' ? {loader: localeLoader} : {}),
          ...(implementation
            ? {
                loader: implementation.loader,
                action: implementation.action,
                ...('default' in implementation
                  ? {element: createElement(implementation.default)}
                  : {}),
              }
            : {}),
          ...(entry.children ? {children: mapRoutes(entry.children)} : {}),
        } as RouteObject;
      });
    const routes: RouteObject[] = [
      {
        id: 'root',
        path: '/',
        element: createElement(Outlet),
        loader: ({request}) => ({
          selectedLocale: getLocaleFromRequest(request),
        }),
        children: mapRoutes(configuration),
      },
    ];
    for (const locale of [GERMAN_LOCALE, ENGLISH_LOCALE]) {
      const path = locale.pathPrefix + '/similar-products/';
      const matches = matchRoutes(routes, path);
      expect(matches?.at(-1)?.route.id).toBe('routes/similar-products._index');
      const handler = createStaticHandler(routes);
      const result = await handler.query(
        new Request('https://www.wandini.shop' + path),
        {
          requestContext: context(
            storefrontFor([product('one', locale)], locale),
          ),
        },
      );
      expect(result).not.toBeInstanceOf(Response);
      if (result instanceof Response) continue;
      expect(result.statusCode).toBe(200);
      expect(result.errors).toBeNull();
      const html = renderToStaticMarkup(
        createElement(StaticRouterProvider, {
          router: createStaticRouter(handler.dataRoutes, result),
          context: result,
          hydrate: false,
        }),
      );
      expect(html).toContain(
        locale.language === 'DE' ? 'Ähnliche Motive' : 'Similar Motifs',
      );
      const malformed = await handler.query(
        new Request('https://www.wandini.shop' + path + 'extra/path'),
        {requestContext: context(storefrontFor([], locale))},
      );
      expect(malformed).toBeInstanceOf(Response);
      expect((malformed as Response).headers.get('Location')).toBe(path);
    }
  });
});
