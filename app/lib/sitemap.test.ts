import {describe, expect, it, vi} from 'vitest';
import {
  buildLocalizedSitemapXml,
  loadArticleSitemapEntries,
  loadCursorConnectionPage,
  pairLocalizedSitemapItems,
  resolveSitemapLastmod,
} from './sitemap.server';

describe('localized sitemap contract', () => {
  it.each([
    ['products', '/products/de-handle', '/en/products/en-handle'],
    ['collections', '/collections/de-handle', '/en/collections/en-handle'],
    ['pages', '/pages/de-handle', '/en/pages/en-handle'],
    ['blogs', '/blogs/de-handle', '/en/blogs/en-handle'],
  ] as const)(
    'builds localized %s paths from Storefront handles',
    (type, dePath, enPath) => {
      expect(
        pairLocalizedSitemapItems(
          type,
          [{handle: 'de-handle', updatedAt: '2026-08-01T10:00:00Z'}],
          [{handle: 'en-handle', updatedAt: '2026-08-01T10:00:00Z'}],
        ),
      ).toEqual([
        {
          dePath,
          enPath,
          updatedAt: '2026-08-01T10:00:00Z',
        },
      ]);
    },
  );

  it('emits DE and EN canonical URLs with real localized handles and lastmod', () => {
    const entries = pairLocalizedSitemapItems(
      'products',
      [{handle: 'deutscher-handle', updatedAt: '2026-08-01T10:00:00Z'}],
      [{handle: 'english-handle', updatedAt: '2026-08-01T10:00:00Z'}],
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
    expect(xml).toContain('hreflang="de-DE"');
    expect(xml).toContain('hreflang="en-DE"');
    expect(xml).not.toMatch(/\/(?:de-de|en-us|en-en)(?:\/|<)/i);
    expect(xml).not.toMatch(/[?](?:cursor|direction|sort|f)=/);
  });

  it('loads cursor-backed article sitemap pages beyond the first page', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        nodes: ['page-1'],
        pageInfo: {hasNextPage: true, endCursor: 'cursor-1'},
      })
      .mockResolvedValueOnce({
        nodes: ['page-2'],
        pageInfo: {hasNextPage: false, endCursor: null},
      });

    await expect(
      loadCursorConnectionPage({page: 2, loadPage}),
    ).resolves.toEqual(['page-2']);
    expect(loadPage).toHaveBeenNthCalledWith(1, null);
    expect(loadPage).toHaveBeenNthCalledWith(2, 'cursor-1');
  });

  it('uses Shopify sitemap updatedAt instead of publishedAt for articles', async () => {
    const query = vi.fn(async (document: string, options: {variables: any}) => {
      if (document.includes('ArticleSitemapConnection')) {
        if (!options.variables.after) {
          return {
            articles: {
              nodes: [],
              pageInfo: {hasNextPage: true, endCursor: 'cursor-1'},
            },
          };
        }

        return {
          articles: {
            nodes: [
              {
                id: 'gid://shopify/Article/1',
                handle: 'pflege',
                publishedAt: '2025-01-01T00:00:00Z',
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
              id: 'gid://shopify/Article/1',
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
              {handle: 'pflege', updatedAt: '2026-08-20T12:00:00Z'},
            ],
          },
        },
      };
    });
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
