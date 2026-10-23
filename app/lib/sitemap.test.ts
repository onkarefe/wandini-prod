import {describe, expect, it, vi} from 'vitest';
import {
  buildArticleSitemapChildPaths,
  buildLocalizedSitemapXml,
  loadArticleSitemapEntries,
  loadArticleSitemapPageCount,
  loadCursorConnectionPage,
  loadLocalizedResourceSitemapEntries,
  pairLocalizedSitemapNodes,
  resolveSitemapLastmod,
} from './sitemap.server';
import {SEO_ENABLED} from './seo';
import {loader as indexLoader} from '../routes/[sitemap.xml]';
import {loader as childLoader} from '../routes/sitemap.$type.$page[.xml]';

const RESOURCE_CASES = [
  {type: 'products', typename: 'Product'},
  {type: 'collections', typename: 'Collection'},
  {type: 'pages', typename: 'Page'},
  {type: 'blogs', typename: 'Blog'},
] as const;

describe('sitemap HTTP responses after activation', () => {
  const origin = 'https://production.example';

  it('serves the production index with resource and article children', async () => {
    const query = vi.fn(async (document: string) => {
      if (document.includes('ArticleSitemapConnection')) {
        return {
          articles: {
            nodes: [{id: 'article-1'}],
            pageInfo: {hasNextPage: false},
          },
        };
      }
      return Object.fromEntries(
        RESOURCE_CASES.map(({type}) => [type, {pagesCount: {count: 1}}]),
      );
    });
    const response = await indexLoader({
      request: new Request(`${origin}/sitemap.xml`),
      context: {
        env: {PUBLIC_CANONICAL_ORIGIN: origin},
        storefront: {query, CacheLong: () => ({})},
      },
    } as never);
    expect(response.status).toBe(200);
    const xml = await response.text();
    for (const type of [
      'products',
      'collections',
      'pages',
      'blogs',
      'articles',
    ]) {
      expect(xml).toContain(`<loc>${origin}/sitemap/${type}/1.xml</loc>`);
    }
    expect(xml).not.toMatch(/\/cart|\/account|\/checkout|\/api\//);
    expect(response.headers.has('X-Robots-Tag')).toBe(false);
  });

  it.each(RESOURCE_CASES)(
    'serves reciprocal localized $type child XML',
    async ({type, typename}) => {
      const query = vi.fn(async (document: string) => {
        if (document.includes('LocalizedSitemapResources')) {
          return {
            sitemap: {
              resources: {
                hasNextPage: false,
                items: [
                  {handle: 'de-handle', updatedAt: '2026-08-01T00:00:00Z'},
                ],
              },
            },
          };
        }
        if (document.includes('SitemapResourceIdentities')) {
          return {
            resource0: {
              __typename: typename,
              id: 'resource-1',
              handle: 'de-handle',
            },
          };
        }
        return {
          nodes: [
            {__typename: typename, id: 'resource-1', handle: 'en-handle'},
          ],
        };
      });
      const response = await childLoader({
        request: new Request(`${origin}/sitemap/${type}/1.xml`),
        params: {type, page: '1'},
        context: {
          env: {PUBLIC_CANONICAL_ORIGIN: origin},
          storefront: {query, CacheLong: () => ({})},
        },
      } as never);
      const xml = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      expect(xml).toContain(`<loc>${origin}/${type}/de-handle</loc>`);
      expect(xml).toContain(`<loc>${origin}/en/${type}/en-handle</loc>`);
      for (const locale of ['de-DE', 'en-DE', 'x-default']) {
        expect(xml.match(new RegExp(`hreflang="${locale}"`, 'g'))).toHaveLength(
          2,
        );
      }
      expect(response.headers.has('X-Robots-Tag')).toBe(false);
    },
  );

  it.each([
    ['http://localhost:3000', origin],
    ['https://preview.oxygen.example', origin],
    ['https://staging.example', origin],
    ['https://alternate.example', origin],
    [origin, undefined],
    [origin, `${origin}?invalid=1`],
  ])(
    'blocks index and children on %s with origin %s before querying Shopify',
    async (requestOrigin, configuredOrigin) => {
      const query = vi.fn();
      const context = {
        env: {PUBLIC_CANONICAL_ORIGIN: configuredOrigin},
        storefront: {query},
      };
      for (const loader of [indexLoader, childLoader]) {
        const response = await loader({
          request: new Request(`${requestOrigin}/sitemap/products/1.xml`),
          params: {type: 'products', page: '1'},
          context,
        } as never);
        expect(response.status).toBe(404);
        expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
      expect(query).not.toHaveBeenCalled();
    },
  );
});

describe('localized sitemap contract', () => {
  it.each(RESOURCE_CASES)(
    'pairs $type localized handles by Shopify ID',
    ({type, typename}) => {
      expect(
        pairLocalizedSitemapNodes(
          type,
          [
            {
              __typename: typename,
              id: 'gid://shopify/Resource/1',
              handle: 'de-handle',
              updatedAt: '2026-08-01T10:00:00Z',
            },
          ],
          [
            {
              __typename: typename,
              id: 'gid://shopify/Resource/1',
              handle: 'en-handle',
            },
          ],
        ),
      ).toEqual([
        {
          dePath: `/${type}/de-handle`,
          enPath: `/en/${type}/en-handle`,
          updatedAt: '2026-08-01T10:00:00Z',
        },
      ]);
    },
  );

  it('cannot mismatch resources when English node ordering differs', () => {
    const entries = pairLocalizedSitemapNodes(
      'products',
      [
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/1',
          handle: 'de-one',
        },
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/2',
          handle: 'de-two',
        },
      ],
      [
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/2',
          handle: 'en-two',
        },
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/1',
          handle: 'en-one',
        },
      ],
    );

    expect(entries.map(({dePath, enPath}) => [dePath, enPath])).toEqual([
      ['/products/de-one', '/en/products/en-one'],
      ['/products/de-two', '/en/products/en-two'],
    ]);
  });

  it('loads English handles for the exact German Shopify IDs', async () => {
    const query = vi.fn(
      async (document: string, options: {variables: Record<string, unknown>}) => {
        if (document.includes('LocalizedSitemapResources')) {
          return {
            sitemap: {
              resources: {
                hasNextPage: false,
                items: [
                  {
                    handle: 'de-one',
                    updatedAt: '2026-08-01T10:00:00Z',
                  },
                  {
                    handle: 'de-two',
                    updatedAt: '2026-08-02T10:00:00Z',
                  },
                ],
              },
            },
          };
        }

        if (document.includes('SitemapResourceIdentities')) {
          expect(options.variables.handle0).toBe('de-one');
          expect(options.variables.handle1).toBe('de-two');
          return {
            resource0: {
              __typename: 'Product',
              id: 'gid://shopify/Product/1',
              handle: 'de-one',
            },
            resource1: {
              __typename: 'Product',
              id: 'gid://shopify/Product/2',
              handle: 'de-two',
            },
          };
        }

        expect(options.variables.ids).toEqual([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]);
        return {
          nodes: [
            {
              __typename: 'Product',
              id: 'gid://shopify/Product/2',
              handle: 'en-two',
            },
            {
              __typename: 'Product',
              id: 'gid://shopify/Product/1',
              handle: 'en-one',
            },
          ],
        };
      },
    );
    const storefront = {query, CacheLong: () => ({})};

    await expect(
      loadLocalizedResourceSitemapEntries({
        storefront: storefront as never,
        type: 'products',
        page: 1,
      }),
    ).resolves.toEqual([
      {
        dePath: '/products/de-one',
        enPath: '/en/products/en-one',
        updatedAt: '2026-08-01T10:00:00Z',
      },
      {
        dePath: '/products/de-two',
        enPath: '/en/products/en-two',
        updatedAt: '2026-08-02T10:00:00Z',
      },
    ]);
  });

  it('omits an alternate when the same Shopify resource cannot be resolved', () => {
    expect(
      pairLocalizedSitemapNodes(
        'pages',
        [
          {
            __typename: 'Page',
            id: 'gid://shopify/Page/1',
            handle: 'uber-uns',
          },
        ],
        [
          {
            __typename: 'Page',
            id: 'gid://shopify/Page/2',
            handle: 'about-us',
          },
          null,
        ],
      ),
    ).toEqual([
      {
        dePath: '/pages/uber-uns',
        enPath: null,
        updatedAt: null,
      },
    ]);
  });

  it('uses Shopify sitemap updatedAt for Blog lastmod', () => {
    expect(
      pairLocalizedSitemapNodes(
        'blogs',
        [
          {
            __typename: 'Blog',
            id: 'gid://shopify/Blog/1',
            handle: 'magazin',
            updatedAt: '2026-08-21T12:00:00Z',
          },
        ],
        [
          {
            __typename: 'Blog',
            id: 'gid://shopify/Blog/1',
            handle: 'magazine',
          },
        ],
      ),
    ).toEqual([
      {
        dePath: '/blogs/magazin',
        enPath: '/en/blogs/magazine',
        updatedAt: '2026-08-21T12:00:00Z',
      },
    ]);
  });

  it('emits clean DE and EN URLs, Shopify lastmod, and no legacy locales', () => {
    const entries = pairLocalizedSitemapNodes(
      'products',
      [
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/1',
          handle: 'deutscher-handle',
          updatedAt: '2026-08-01T10:00:00Z',
        },
      ],
      [
        {
          __typename: 'Product',
          id: 'gid://shopify/Product/1',
          handle: 'english-handle',
        },
      ],
    );
    const xml = buildLocalizedSitemapXml({
      canonicalOrigin: 'https://www.wandini.example',
      entries,
    });

    expect(xml).toContain(
      '<loc>https://www.wandini.example/products/deutscher-handle</loc>',
    );
    expect(xml).toContain(
      '<loc>https://www.wandini.example/en/products/english-handle</loc>',
    );
    expect(xml).toContain('<lastmod>2026-08-01T10:00:00Z</lastmod>');
    expect(xml).toMatch(/hreflang=.de-DE./);
    expect(xml).toMatch(/hreflang=.en-DE./);
    expect(xml).not.toMatch(/\/(?:de-de|en-us|en-en)(?:\/|<)/i);
    expect(xml).not.toMatch(/[?](?:cursor|direction|sort|f)=/);
    expect(SEO_ENABLED).toBe(true);
  });

  it('owns every Article exactly once across cursor page boundaries', async () => {
    const firstConnection = {
      nodes: ['article-1', 'article-2'],
      pageInfo: {hasNextPage: true, endCursor: 'cursor-1'},
    };
    const secondConnection = {
      nodes: ['article-3', 'article-4'],
      pageInfo: {hasNextPage: false, endCursor: null},
    };
    const loadPage = vi.fn(async (after: string | null) =>
      after ? secondConnection : firstConnection,
    );

    const firstPage = await loadCursorConnectionPage({page: 1, loadPage});
    const secondPage = await loadCursorConnectionPage({page: 2, loadPage});
    const allArticles = [...firstPage, ...secondPage];

    expect(firstPage).toEqual(['article-1', 'article-2']);
    expect(secondPage).toEqual(['article-3', 'article-4']);
    expect(new Set(allArticles).size).toBe(allArticles.length);
    expect(allArticles).toEqual([
      'article-1',
      'article-2',
      'article-3',
      'article-4',
    ]);
  });

  it('builds Article child sitemap links from the same cursor page count', async () => {
    const query = vi.fn(
      async (_document: string, options: {variables: Record<string, unknown>}) => ({
        articles: options.variables.after
          ? {
              nodes: [{id: 'article-2'}],
              pageInfo: {hasNextPage: false, endCursor: null},
            }
          : {
              nodes: [{id: 'article-1'}],
              pageInfo: {hasNextPage: true, endCursor: 'cursor-1'},
            },
      }),
    );
    const storefront = {query, CacheLong: () => ({})};
    const pageCount = await loadArticleSitemapPageCount(storefront as never);

    expect(pageCount).toBe(2);
    expect(buildArticleSitemapChildPaths(pageCount)).toEqual([
      '/sitemap/articles/1.xml',
      '/sitemap/articles/2.xml',
    ]);
    expect(buildArticleSitemapChildPaths(0)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses Shopify sitemap updatedAt instead of publishedAt for articles', async () => {
    const query = vi.fn(
      async (document: string, options: {variables: Record<string, unknown>}) => {
        if (document.includes('ArticleSitemapConnection')) {
          if (!options.variables.after) {
            return {
              articles: {
                nodes: [
                  {
                    id: 'gid://shopify/Article/1',
                    handle: 'erste-seite',
                    publishedAt: '2025-01-01T00:00:00Z',
                    blog: {handle: 'magazin'},
                  },
                ],
                pageInfo: {hasNextPage: true, endCursor: 'cursor-1'},
              },
            };
          }

          return {
            articles: {
              nodes: [
                {
                  id: 'gid://shopify/Article/2',
                  handle: 'pflege',
                  publishedAt: '2025-02-01T00:00:00Z',
                  blog: {handle: 'magazin'},
                },
              ],
              pageInfo: {hasNextPage: false, endCursor: null},
            },
          };
        }

        if (document.includes('LocalizedArticleSitemapNodes')) {
          return {
            nodes: [
              {
                __typename: 'Article',
                id: 'gid://shopify/Article/2',
                handle: 'wallpaper-care',
                blog: {handle: 'magazine'},
              },
            ],
          };
        }

        return {
          sitemap: {
            resources: {
              hasNextPage: false,
              items: [
                {
                  handle: 'pflege',
                  updatedAt: '2026-08-20T12:00:00Z',
                },
              ],
            },
          },
        };
      },
    );
    const storefront = {query, CacheLong: () => ({})};

    await expect(
      loadArticleSitemapEntries({storefront: storefront as never, page: 2}),
    ).resolves.toEqual([
      {
        dePath: '/blogs/magazin/pflege',
        enPath: '/en/blogs/magazine/wallpaper-care',
        updatedAt: '2026-08-20T12:00:00Z',
      },
    ]);
  });

  it('falls back to publishedAt only when no modification timestamp exists', () => {
    expect(
      resolveSitemapLastmod(
        '2026-08-20T12:00:00Z',
        '2025-01-01T00:00:00Z',
      ),
    ).toBe('2026-08-20T12:00:00Z');
    expect(resolveSitemapLastmod(null, '2025-01-01T00:00:00Z')).toBe(
      '2025-01-01T00:00:00Z',
    );
  });
});
