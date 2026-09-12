import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {
  buildClientSchema,
  parse,
  validate,
  type IntrospectionQuery,
} from 'graphql';
import {getSimilarMotifsPreview} from '~/lib/similar-products-preview';
import {
  buildSimilarProductsPath,
  getSimilarProductsTarget,
  mergeSimilarProductsById,
  rankSimilarProducts,
  slugifySimilarPart,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import {getSimilarProductsPageData} from '~/lib/similar-products.server';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from '~/lib/locale';
import {localizeTo} from '~/lib/i18n-router';
import {
  action,
  loader,
  shouldRevalidate,
} from '~/routes/similar-products.$slug';
import {loader as rootLoader} from '~/routes/similar-products._index';
import {loader as malformedLoader} from '~/routes/similar-products.$';
import {resolveSimilarProductsLanguageSwitchLinks} from '~/lib/language-switcher';

function product(
  id: string,
  motif = 'Koi with lotus flowers',
  theme = 'Japanese garden',
): SimilarProductsBaseProduct {
  return {
    id,
    handle: `english-handle-${id}`,
    title: id,
    mainMotif: {value: motif},
    mainTheme: {value: theme},
    images: {nodes: [{url: `https://cdn.example.com/${id}.jpg`}]},
    priceRange: {minVariantPrice: {amount: '49.00', currencyCode: 'EUR'}},
  };
}

function storefrontFor(
  products: SimilarProductsBaseProduct[],
  language = 'EN',
) {
  return {
    i18n: {language, country: 'DE'},
    CacheShort: vi.fn(() => ({mode: 'public', maxAge: 1})),
    CacheLong: vi.fn(() => ({mode: 'public'})),
    query: vi.fn(
      async (query: string, options: {variables: Record<string, unknown>}) => {
        if (query.includes('query SimilarProductsCandidates')) {
          const start = Number(options.variables.after ?? 0);
          return {
            products: {
              nodes: products
                .slice(start, start + 250)
                .map(({id, mainMotif, mainTheme}) => ({
                  id,
                  mainMotif,
                  mainTheme,
                })),
              pageInfo: {
                hasNextPage: start + 250 < products.length,
                endCursor: String(start + 250),
              },
            },
          };
        }
        if (query.includes('query SimilarProductsCards')) {
          const ids = options.variables.ids as string[];
          // Shopify node results need not be in ranking order.
          return {nodes: products.filter(({id}) => ids.includes(id)).reverse()};
        }
        if (query.includes('query SimilarProductsLanguageSwitch'))
          return {product: null};
        throw new Error('Unexpected query');
      },
    ),
  };
}

function routeArgs(
  storefront: ReturnType<typeof storefrontFor>,
  slug?: string,
  method = 'GET',
  offset = '0',
) {
  const prefix = storefront.i18n.language === 'EN' ? '/en' : '';
  return {
    params: slug === undefined ? {} : {slug},
    request: new Request(
      `https://www.wandini.shop${prefix}/similar-products/${slug ?? ''}`,
      {
        method,
        ...(method === 'POST' ? {body: new URLSearchParams({offset})} : {}),
      },
    ),
    context: {
      storefront,
      customerAccount: {isLoggedIn: async () => false},
      env: {},
    },
  } as never;
}

describe('Similar Motifs shared contract', () => {
  it.each([
    [
      GERMAN_LOCALE,
      'Koi mit Lotusblüten',
      'Japanischer Garten',
      '/similar-products/koi-mit-lotusbluten--japanischer-garten',
    ],
    [
      ENGLISH_LOCALE,
      'Koi with lotus flowers',
      'Japanese garden',
      '/en/similar-products/koi-with-lotus-flowers--japanese-garden',
    ],
  ])(
    'builds readable localized URLs (%s)',
    (locale, mainMotif, mainTheme, expected) => {
      expect(buildSimilarProductsPath({mainMotif, mainTheme}, locale)).toBe(
        expected,
      );
      expect(
        getSimilarProductsTarget(
          product('source', mainMotif, mainTheme),
          locale,
        )?.path,
      ).toBe(expected);
    },
  );

  it.each([
    ['Lotusblüten', 'lotusbluten'],
    ['LotusblÃ¼ten', 'lotusbluten'],
    ['Äpfel, Öl & süße Blüten', 'apfel-ol-and-susse-bluten'],
    [' A\u0308pfel   ', 'apfel'],
  ])('normalizes %s without broken German characters', (value, expected) => {
    expect(slugifySimilarPart(value)).toBe(expected);
    expect(slugifySimilarPart(value)).not.toContain('bl-ten');
  });

  it('preserves the motif/theme boundary for otherwise ambiguous combinations', async () => {
    const a = product('a', 'Red flowers', 'Garden');
    const b = product('b', 'Red', 'Flowers garden');
    const targetA = getSimilarProductsTarget(a)!;
    const targetB = getSimilarProductsTarget(b)!;
    expect(targetA.slug).not.toBe(targetB.slug);
    const storefront = storefrontFor([b, a]);
    const page = await getSimilarProductsPageData({
      storefront: storefront as never,
      slug: targetA.slug,
    });
    expect(page?.target.referenceProductId).toBe('a');
    expect(page?.items[0].id).toBe('a');
  });

  it('ranks exact motif+theme before motif, theme and fallback, independently of input order', () => {
    const source = product('source');
    const candidates = [
      product('1-fallback', 'Forest', 'Nature'),
      product('2-theme', 'Cranes'),
      product('3-motif', 'Koi with lotus flowers', 'Ocean'),
      product('9-exact'),
      product('8-exact'),
      source,
      product('8-exact'),
      product('accessory', '', ''),
    ];
    const expected = ['8-exact', '9-exact', '3-motif', '2-theme', '1-fallback'];
    for (const products of [candidates, [...candidates].reverse()]) {
      expect(
        rankSimilarProducts({
          products,
          target: getSimilarProductsTarget(source),
          excludeProductId: source.id,
        }).map(({id}) => id),
      ).toEqual(expected);
    }
  });

  it.each([GERMAN_LOCALE, ENGLISH_LOCALE])(
    'uses the same target and ranking for cards, PDP preview and full page (%s)',
    async (locale) => {
      const motif = locale.language === 'DE' ? 'Lotusblüten' : 'Lotus flowers';
      const theme =
        locale.language === 'DE' ? 'Japanischer Garten' : 'Japanese garden';
      const source = product('source', motif, theme);
      const products = [
        product('fallback', 'Forest', 'Nature'),
        product('theme', 'Cranes', theme),
        product('motif', motif, 'Ocean'),
        product('exact', motif, theme),
        source,
      ].map((p) => ({...p, handle: `${locale.htmlLang}-localized-${p.id}`}));
      const storefront = storefrontFor(products, locale.language);
      const cardTarget = getSimilarProductsTarget(source, locale)!;
      const preview = await getSimilarMotifsPreview({
        storefront: storefront as never,
        sourceProductId: source.id,
        mainMotif: motif,
        mainTheme: theme,
      });
      const page = await loader(routeArgs(storefront, cardTarget.slug));
      expect(preview?.similarProductsPath).toBe(cardTarget.path);
      expect(page.target.slug).toBe(cardTarget.slug);
      expect(preview?.products.map(({id}) => id)).toEqual(
        page.items.filter(({id}) => id !== source.id).map(({id}) => id),
      );
      expect(preview?.products.map(({id}) => id)).toEqual([
        'exact',
        'motif',
        'theme',
        'fallback',
      ]);
      for (const item of page.items) {
        const path = localizeTo(`/products/${item.handle}`, locale);
        expect(path).toBe(
          `${locale.pathPrefix}/products/${locale.htmlLang}-localized-${item.id}`,
        );
        expect(localizeTo(path, locale)).toBe(path);
      }
      for (const [, options] of storefront.query.mock.calls.filter(
        ([query]) => !query.includes('SimilarProductsLanguageSwitch'),
      )) {
        expect(options.variables.language).toBe(
          locale.language === 'DE' ? 'DE' : 'EN',
        );
        expect(options.variables.country).toBe('DE');
      }
    },
  );

  it('finds the strongest match beyond the first candidate page and only hydrates requested cards', async () => {
    const candidates = Array.from({length: 251}, (_, i) =>
      product(String(i), 'Koi with lotus flowers', 'Other theme'),
    );
    candidates.push(product('last-exact'));
    const storefront = storefrontFor(candidates);
    const page = await getSimilarProductsPageData({
      storefront: storefront as never,
      slug: getSimilarProductsTarget(product('source'))!.slug,
      pageSize: 5,
    });
    expect(page?.items[0].id).toBe('last-exact');
    const queries = storefront.query.mock.calls;
    const candidateCalls = queries.filter(([q]) =>
      q.includes('query SimilarProductsCandidates'),
    );
    expect(candidateCalls).toHaveLength(2);
    for (const [query] of candidateCalls) {
      expect(query).not.toMatch(
        /images|options|collections|priceRange|productMetafield/,
      );
      expect(query).toContain(
        '@inContext(country: $country, language: $language)',
      );
    }
    const cardCalls = queries.filter(([q]) =>
      q.includes('query SimilarProductsCards'),
    );
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0][1].variables.ids).toHaveLength(5);
  });

  it.each(['DE', 'EN'])(
    'serves the localized root and redirects unresolved %s groups there for GET and POST',
    async (language) => {
      const storefront = storefrontFor([product('source')], language);
      const root =
        language === 'EN' ? '/en/similar-products/' : '/similar-products/';
      const page = await rootLoader(routeArgs(storefront));
      expect(page.items).toHaveLength(1);
      expect(page.target.slug).toBe('');
      expect(page.languageSwitchLinks).toEqual({
        DE: '/similar-products/',
        EN: '/en/similar-products/',
      });
      for (const slug of [
        'stale',
        'deleted--group',
        'bad---slug',
        '%broken',
        'old-unknown-collection',
      ]) {
        await expect(loader(routeArgs(storefront, slug))).rejects.toMatchObject(
          {status: 302, headers: expect.any(Headers)},
        );
        try {
          await loader(routeArgs(storefront, slug));
        } catch (response) {
          expect((response as Response).headers.get('Location')).toBe(root);
        }
        try {
          await action(routeArgs(storefront, slug, 'POST'));
          throw new Error('Expected redirect');
        } catch (response) {
          expect((response as Response).status).toBe(302);
          expect((response as Response).headers.get('Location')).toBe(root);
        }
      }
      const malformed = malformedLoader(routeArgs(storefront, 'extra/path'));
      expect(malformed.headers.get('Location')).toBe(root);
    },
  );

  it.each([
    [
      'DE',
      'Koi mit Lotusblüten',
      'Japanischer Garten',
      'koi-mit-lotusbl-ten-japanischer-garten-fototapeten',
    ],
    [
      'EN',
      'Koi with lotus flowers',
      'Japanese garden',
      'koi-with-lotus-flowers-japanese-garden-wall-murals',
    ],
  ])(
    'redirects safely recognized legacy %s URLs',
    async (language, motif, theme, slug) => {
      const source = product('source', motif, theme);
      const storefront = storefrontFor([source], language);
      try {
        await loader(routeArgs(storefront, slug));
        throw new Error('Expected redirect');
      } catch (response) {
        expect((response as Response).status).toBe(302);
        expect((response as Response).headers.get('Location')).toBe(
          getSimilarProductsTarget(
            source,
            language === 'EN' ? ENGLISH_LOCALE : GERMAN_LOCALE,
          )?.path,
        );
      }
    },
  );

  it('keeps missing metafields and deleted reference products resilient', async () => {
    const source = product('a');
    const other = product('b');
    const target = getSimilarProductsTarget(source)!;
    expect(getSimilarProductsTarget(product('missing', '', ''))).toBeNull();
    expect(
      buildSimilarProductsPath({mainMotif: '', mainTheme: ''}, ENGLISH_LOCALE),
    ).toBe('/en/similar-products/');
    const storefront = storefrontFor([other]);
    const page = await getSimilarProductsPageData({
      storefront: storefront as never,
      slug: target.slug,
    });
    expect(page?.target.referenceProductId).toBe(other.id);
    const empty = await rootLoader(routeArgs(storefrontFor([])));
    expect(empty.items).toEqual([]);
    expect(empty.hasMore).toBe(false);
  });

  it.each(['DE', 'EN'])(
    'uses the target locale Similar root when language switching cannot resolve (%s)',
    async (language) => {
      const storefront = storefrontFor([], language);
      const prefix = language === 'EN' ? '/en' : '';
      const links = await resolveSimilarProductsLanguageSwitchLinks({
        storefront: storefront as never,
        request: new Request(
          `https://www.wandini.shop${prefix}/similar-products/stale`,
        ),
        referenceProductId: 'deleted',
      });
      expect(links[language === 'DE' ? 'EN' : 'DE']).toBe(
        language === 'DE' ? '/en/similar-products/' : '/similar-products/',
      );
    },
  );

  it('advances load-more offsets, appends uniquely and does not reset page 1', async () => {
    const products = Array.from({length: 24}, (_, i) =>
      product(String(i).padStart(2, '0')),
    );
    const storefront = storefrontFor(products);
    const slug = getSimilarProductsTarget(products[0])!.slug;
    const initial = await loader(routeArgs(storefront, slug));
    const more = await action(
      routeArgs(storefront, slug, 'POST', String(initial.nextOffset)),
    );
    const next = (await more.json()) as {
      items: SimilarProductsBaseProduct[];
      nextOffset: number;
      hasMore: boolean;
    };
    expect(initial.items.map(({id}) => id)).toEqual(
      products.slice(0, 9).map(({id}) => id),
    );
    expect(next.items.map(({id}) => id)).toEqual(
      products.slice(9, 18).map(({id}) => id),
    );
    expect(next.nextOffset).toBe(18);
    expect(
      mergeSimilarProductsById(initial.items, [
        ...initial.items.slice(-1),
        ...next.items,
      ]),
    ).toHaveLength(18);
    const last = await action(routeArgs(storefront, slug, 'POST', '18'));
    expect(await last.json()).toMatchObject({nextOffset: 24, hasMore: false});
    expect(
      shouldRevalidate({
        formMethod: 'POST',
        formAction: `/en/similar-products/${slug}`,
        currentUrl: new URL(
          `https://www.wandini.shop/en/similar-products/${slug}`,
        ),
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(false);
    expect(
      shouldRevalidate({
        formMethod: 'POST',
        formAction: '/api/wishlist',
        currentUrl: new URL(
          `https://www.wandini.shop/en/similar-products/${slug}`,
        ),
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(true);
  });

  it('validates the Similar Motifs queries against the installed Shopify schema', () => {
    const schemaJson = JSON.parse(
      readFileSync(
        new URL(
          '../../node_modules/@shopify/hydrogen/dist/storefront.schema.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const schema = buildClientSchema(schemaJson as IntrospectionQuery);
    const source = readFileSync(
      new URL('./similar-products.server.ts', import.meta.url),
      'utf8',
    );
    const queries = [...source.matchAll(/`#graphql([\s\S]*?)`/g)];
    expect(queries).toHaveLength(2);
    for (const [, query] of queries)
      expect(validate(schema, parse(query))).toEqual([]);
  });

  it('all card entry points delegate grouping to the shared helper', () => {
    for (const path of [
      '../routes/collections.$handle.tsx',
      '../routes/search.tsx',
      '../routes/similar-products.$slug.tsx',
      './similar-products-preview.ts',
    ]) {
      const source = readFileSync(
        fileURLToPath(new URL(path, import.meta.url)),
        'utf8',
      );
      expect(source).toContain('getSimilarProductsTarget(');
      expect(source).not.toContain('productCategory:');
    }
    const pdp = readFileSync(
      new URL('../routes/products.$handle.tsx', import.meta.url),
      'utf8',
    );
    expect(pdp).toContain('getSimilarMotifsPreview(');
  });
});
