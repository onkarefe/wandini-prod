import {describe, expect, it, vi} from 'vitest';
import {
  DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS,
  getShopifyGlobalSeoSettingsFromMatches,
  resolveShopifyMarketingSeo,
  type ShopifyGlobalSeoSettings,
  type ShopifySeoPage,
} from './shopify-marketing-seo';
import {
  loadShopifyGlobalSeoSettings,
  loadShopifySeoPage,
} from './shopify-marketing-seo.server';
import {
  buildSeoMetadata,
  resolveRobotsDirective,
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from './seo';

const GLOBAL_SETTINGS: ShopifyGlobalSeoSettings = {
  siteName: 'Wandini',
  defaultTitleSuffix: '| Wandini',
  defaultMetaDescription: 'Global description',
  defaultSocialImage: 'https://cdn.example/global.jpg',
};

const SEO_PAGE: ShopifySeoPage = {
  routeKey: 'homepage',
  seoTitle: 'Shopify marketing title',
  metaDescription: 'Shopify marketing description',
  openGraphTitle: null,
  openGraphDescription: null,
  openGraphImage: null,
  noindex: false,
};

function createStorefront({
  language = 'DE',
  query,
}: {
  language?: 'DE' | 'EN';
  query: ReturnType<typeof vi.fn>;
}) {
  return {
    i18n: {country: 'DE', language},
    query,
    CacheLong: () => ({}),
  };
}

describe('Shopify marketing SEO resolution', () => {
  it('reads global settings from root matches and safely defaults without them', () => {
    expect(
      getShopifyGlobalSeoSettingsFromMatches([
        undefined,
        {id: 'root', data: {shopifyGlobalSeoSettings: GLOBAL_SETTINGS}},
      ]),
    ).toEqual(GLOBAL_SETTINGS);
    expect(getShopifyGlobalSeoSettingsFromMatches([])).toEqual(
      DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS,
    );
  });

  it('lets SEO Pages title and description override route fallbacks', () => {
    const resolved = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: SEO_PAGE,
      fallbackTitle: 'Route title',
      fallbackDescription: 'Route description',
    });

    expect(resolved.title).toBe('Shopify marketing title | Wandini');
    expect(resolved.description).toBe('Shopify marketing description');
  });

  it('does not truncate explicit marketing copy', () => {
    const longTitle = `Marketing ${'title '.repeat(40)}`;
    const longDescription = `Marketing ${'description '.repeat(40)}`;
    const resolved = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: {...SEO_PAGE, seoTitle: longTitle, metaDescription: longDescription},
    });

    expect(resolved.title).toContain(longTitle);
    expect(resolved.description).toBe(longDescription);
    expect(resolved.description?.length).toBeGreaterThan(160);
  });

  it('falls back through route content before global settings', () => {
    const routeFallback = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: null,
      fallbackTitle: '<strong>Collections</strong>',
      fallbackDescription: 'Localized collection overview',
    });
    const globalFallback = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: null,
    });

    expect(routeFallback.title).toBe('Collections | Wandini');
    expect(routeFallback.description).toBe('Localized collection overview');
    expect(globalFallback.title).toBe('Wandini');
    expect(globalFallback.description).toBe('Global description');
    expect(globalFallback.image).toBe('https://cdn.example/global.jpg');
  });

  it('resolves OG values and image fallbacks deterministically', () => {
    const explicitSocial = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: {
        ...SEO_PAGE,
        openGraphTitle: 'Explicit OG title',
        openGraphDescription: 'Explicit OG description',
        openGraphImage: 'https://cdn.example/page.jpg',
      },
      fallbackImage: 'https://cdn.example/route.jpg',
    });
    const fallbackSocial = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: SEO_PAGE,
    });

    expect(explicitSocial.openGraphTitle).toBe('Explicit OG title');
    expect(explicitSocial.openGraphDescription).toBe(
      'Explicit OG description',
    );
    expect(explicitSocial.image).toBe('https://cdn.example/page.jpg');
    expect(fallbackSocial.openGraphTitle).toBe(
      'Shopify marketing title | Wandini',
    );
    expect(fallbackSocial.openGraphDescription).toBe(
      'Shopify marketing description',
    );
    expect(fallbackSocial.image).toBe('https://cdn.example/global.jpg');

    const metadata = buildSeoMetadata({
      title: {explicit: fallbackSocial.title},
      description: {explicit: fallbackSocial.description},
      canonicalUrl: 'https://www.wandini.example/',
      image: fallbackSocial.image,
      openGraph: {
        title: fallbackSocial.openGraphTitle,
        description: fallbackSocial.openGraphDescription,
        image: fallbackSocial.image,
      },
    });
    expect(metadata).toContainEqual({
      property: 'og:title',
      content: 'Shopify marketing title | Wandini',
    });
    expect(metadata).toContainEqual({
      property: 'og:image',
      content: 'https://cdn.example/global.jpg',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:image',
      content: 'https://cdn.example/global.jpg',
    });
  });

  it('supports route noindex while the global kill switch remains authoritative', () => {
    const resolved = resolveShopifyMarketingSeo({
      settings: GLOBAL_SETTINGS,
      page: {...SEO_PAGE, noindex: true},
    });
    const metadata = buildSeoMetadata({
      title: {explicit: resolved.title},
      canonicalUrl: 'https://www.wandini.example/',
      robots: resolved.noindex ? 'noindex,follow' : 'index,follow',
    });

    expect(resolved.noindex).toBe(true);
    expect(resolveRobotsDirective('noindex,follow', true)).toBe(
      'noindex,follow',
    );
    expect(SEO_ENABLED).toBe(false);
    expect(metadata).toContainEqual({
      name: 'robots',
      content: SEO_DISABLED_ROBOTS_DIRECTIVE,
    });
  });
});

describe('Shopify marketing SEO Storefront loader', () => {
  it('parses localized settings and page fields including images and noindex', async () => {
    const settingsQuery = vi.fn().mockResolvedValue({
      metaobjects: {
        nodes: [
          {
            fields: [
              {key: 'site_name', value: 'Wandini DE'},
              {key: 'default_title_suffix', value: '| Wandini DE'},
              {key: 'default_meta_description', value: 'Globale Beschreibung'},
              {
                key: 'default_social_image',
                reference: {image: {url: 'https://cdn.example/global-de.jpg'}},
              },
            ],
          },
        ],
      },
    });
    const pageQuery = vi.fn().mockResolvedValue({
      metaobjects: {
        nodes: [
          {
            fields: [
              {key: 'route_key', value: 'blogs'},
              {key: 'seo_title', value: 'Magazin'},
              {key: 'meta_description', value: 'Deutsche Beschreibung'},
              {key: 'og_title', value: 'Magazin Social'},
              {key: 'og_description', value: 'Social Beschreibung'},
              {
                key: 'og_image',
                reference: {image: {url: 'https://cdn.example/blogs-de.jpg'}},
              },
              {key: 'noindex', value: 'true'},
            ],
          },
        ],
      },
    });

    await expect(
      loadShopifyGlobalSeoSettings(
        createStorefront({query: settingsQuery}) as never,
      ),
    ).resolves.toEqual({
      siteName: 'Wandini DE',
      defaultTitleSuffix: '| Wandini DE',
      defaultMetaDescription: 'Globale Beschreibung',
      defaultSocialImage: 'https://cdn.example/global-de.jpg',
    });
    await expect(
      loadShopifySeoPage(
        createStorefront({query: pageQuery}) as never,
        'blogs',
      ),
    ).resolves.toEqual({
      routeKey: 'blogs',
      seoTitle: 'Magazin',
      metaDescription: 'Deutsche Beschreibung',
      openGraphTitle: 'Magazin Social',
      openGraphDescription: 'Social Beschreibung',
      openGraphImage: 'https://cdn.example/blogs-de.jpg',
      noindex: true,
    });
  });

  it('preserves German and English Storefront request context', async () => {
    const germanQuery = vi.fn().mockResolvedValue({metaobjects: {nodes: []}});
    const englishQuery = vi.fn().mockResolvedValue({metaobjects: {nodes: []}});

    await loadShopifyGlobalSeoSettings(
      createStorefront({language: 'DE', query: germanQuery}) as never,
    );
    await loadShopifySeoPage(
      createStorefront({language: 'EN', query: englishQuery}) as never,
      'homepage',
    );

    expect(germanQuery.mock.calls[0][1].variables).toMatchObject({
      country: 'DE',
      language: 'DE',
      type: 'seo_settings',
    });
    expect(englishQuery.mock.calls[0][1].variables).toMatchObject({
      country: 'DE',
      language: 'EN',
      type: 'seo_pages',
    });
  });

  it('returns safe defaults when entries are missing or Shopify fails', async () => {
    const missingQuery = vi.fn().mockResolvedValue({metaobjects: {nodes: []}});
    const failingQuery = vi.fn().mockRejectedValue(new Error('Shopify unavailable'));

    await expect(
      loadShopifyGlobalSeoSettings(
        createStorefront({query: missingQuery}) as never,
      ),
    ).resolves.toEqual(DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS);
    await expect(
      loadShopifySeoPage(
        createStorefront({query: missingQuery}) as never,
        'collections',
      ),
    ).resolves.toBeNull();
    await expect(
      loadShopifyGlobalSeoSettings(
        createStorefront({query: failingQuery}) as never,
      ),
    ).resolves.toEqual(DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS);
    await expect(
      loadShopifySeoPage(
        createStorefront({query: failingQuery}) as never,
        'blogs',
      ),
    ).resolves.toBeNull();
  });
});
