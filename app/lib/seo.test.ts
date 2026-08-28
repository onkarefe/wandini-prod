import {describe, expect, it} from 'vitest';
import {
  buildCanonicalUrl,
  buildFixedSeoAlternateUrls,
  buildLocaleSeoUrl,
  buildPaginationCanonicalUrl,
  buildResourceSeoAlternateUrls,
  buildSeoMetadata,
  resolveRobotsDirective,
  resolveSeoDescription,
  resolveSeoTitle,
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from './seo';

describe('Wandini SEO core', () => {
  it('keeps an explicit Shopify SEO title authoritative', () => {
    expect(
      resolveSeoTitle({
        explicit: 'Deliberate Shopify title',
        fallback: 'Product title',
      }),
    ).toBe('Deliberate Shopify title');
  });

  it('keeps an explicit Shopify SEO description authoritative', () => {
    expect(
      resolveSeoDescription({
        explicit: 'Deliberate Shopify description',
        fallback: 'Generated product description',
      }),
    ).toBe('Deliberate Shopify description');
  });

  it('does not truncate an explicit SEO description', () => {
    const explicit = `Purposeful SEO copy ${'with deliberate detail '.repeat(12)}`;

    expect(resolveSeoDescription({explicit, fallback: 'Fallback'})).toBe(
      explicit,
    );
    expect(explicit.length).toBeGreaterThan(160);
  });

  it('uses and normalizes a fallback title', () => {
    expect(resolveSeoTitle({fallback: '  Wallpaper   Design  '})).toBe(
      'Wallpaper Design | Wandini',
    );
  });

  it('uses, normalizes, and safely bounds a fallback description', () => {
    const description = resolveSeoDescription({
      fallback: `<p>${'Localized fallback content '.repeat(12)}</p>`,
    });

    expect(description).not.toContain('<p>');
    expect(description).toMatch(/\.\.\.$/);
    expect(description?.length).toBeLessThanOrEqual(160);
  });

  it('removes irrelevant query and hash noise from canonicals', () => {
    expect(
      buildCanonicalUrl(
        'https://www.wandini.de/products/mural?utm_source=test&variant=1#details',
      ),
    ).toBe('https://www.wandini.de/products/mural');
  });

  it.each([
    [
      'https://www.wandini.de/products/foo?variant=1',
      'https://www.wandini.de/products/foo',
    ],
    [
      'https://www.wandini.de/en/products/foo?variant=1',
      'https://www.wandini.de/en/products/foo',
    ],
  ])('keeps the canonical locale contract for %s', (input, expected) => {
    expect(buildCanonicalUrl(input)).toBe(expected);
  });

  it('normalizes legacy locale segments out of SEO canonicals', () => {
    const canonicals = [
      buildCanonicalUrl('https://www.wandini.de/de-de/products/foo'),
      buildCanonicalUrl('https://www.wandini.de/en-us/products/foo'),
      buildCanonicalUrl('https://www.wandini.de/en-en/products/foo'),
    ];

    expect(canonicals).toEqual([
      'https://www.wandini.de/products/foo',
      'https://www.wandini.de/en/products/foo',
      'https://www.wandini.de/en/products/foo',
    ]);
    expect(canonicals.join(' ')).not.toMatch(/\/(?:de-de|en-us|en-en)(?:\/|$)/i);
  });

  it.each([
    [
      'https://www.wandini.de/blogs?direction=next&cursor=page-2&utm_source=test',
      'https://www.wandini.de/blogs?cursor=page-2&direction=next',
    ],
    [
      'https://www.wandini.de/en/blogs?cursor=page-2&direction=next',
      'https://www.wandini.de/en/blogs?cursor=page-2&direction=next',
    ],
    [
      'https://www.wandini.de/blogs/magazin?direction=previous&cursor=page-2',
      'https://www.wandini.de/blogs/magazin?cursor=page-2&direction=previous',
    ],
    [
      'https://www.wandini.de/en/blogs/magazine?direction=next&cursor=page-2',
      'https://www.wandini.de/en/blogs/magazine?cursor=page-2&direction=next',
    ],
  ])('self-canonicalizes listing pagination at %s', (input, expected) => {
    expect(buildPaginationCanonicalUrl(input)).toBe(expected);
  });

  it('does not preserve an incomplete or invalid pagination state', () => {
    expect(
      buildPaginationCanonicalUrl(
        'https://www.wandini.de/blogs?cursor=page-2&direction=sideways',
      ),
    ).toBe('https://www.wandini.de/blogs');
  });

  it('keeps paginated hreflang aligned with each paginated canonical', () => {
    const canonicalUrl =
      'https://www.wandini.de/en/blogs?cursor=page-2&direction=next';
    const alternates = buildFixedSeoAlternateUrls(canonicalUrl, '/blogs');
    const metadata = buildSeoMetadata({
      title: {fallback: 'Blogs'},
      canonicalUrl,
      preservePagination: true,
      alternates,
    });

    expect(metadata).toEqual(
      expect.arrayContaining([
        {
          tagName: 'link',
          rel: 'canonical',
          href: canonicalUrl,
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'de-DE',
          href:
            'https://www.wandini.de/blogs?cursor=page-2&direction=next',
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'en-DE',
          href: canonicalUrl,
        },
      ]),
    );
  });

  it('preserves pagination across localized resource handles', () => {
    expect(
      buildResourceSeoAlternateUrls(
        'https://www.wandini.de/en/blogs/magazine?cursor=page-2&direction=next',
        {
          DE: '/blogs/magazin?cursor=page-2&direction=next',
          EN: '/en/blogs/magazine?cursor=page-2&direction=next',
        },
      ),
    ).toEqual({
      deDE:
        'https://www.wandini.de/blogs/magazin?cursor=page-2&direction=next',
      enDE:
        'https://www.wandini.de/en/blogs/magazine?cursor=page-2&direction=next',
    });
  });

  it.each([
    'https://www.wandini.de/products/deutscher-handle',
    'https://www.wandini.de/en/products/english-handle',
  ])('emits reciprocal de-DE, en-DE, and German x-default links', (canonicalUrl) => {
    const alternates = buildResourceSeoAlternateUrls(canonicalUrl, {
      DE: '/products/deutscher-handle',
      EN: '/en/products/english-handle',
    });
    const metadata = buildSeoMetadata({
      title: {fallback: 'Product'},
      canonicalUrl,
      alternates,
    });

    expect(metadata).toEqual(
      expect.arrayContaining([
        {
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'de-DE',
          href: 'https://www.wandini.de/products/deutscher-handle',
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'en-DE',
          href: 'https://www.wandini.de/en/products/english-handle',
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'x-default',
          href: 'https://www.wandini.de/products/deutscher-handle',
        },
      ]),
    );
  });

  it('does not publish a resource alternate when localization resolution fell back home', () => {
    expect(
      buildResourceSeoAlternateUrls(
        'https://www.wandini.de/products/deutscher-handle',
        {DE: '/products/deutscher-handle', EN: '/en'},
      ),
    ).toBeNull();
  });

  it('builds deterministic homepage alternates with German x-default', () => {
    const alternates = buildFixedSeoAlternateUrls(
      'https://www.wandini.de/en',
      '/',
    );

    expect(alternates).toEqual({
      deDE: 'https://www.wandini.de/',
      enDE: 'https://www.wandini.de/en',
    });
  });

  it('keeps English Product and Collection breadcrumb homes under /en', () => {
    expect(
      buildLocaleSeoUrl(
        'https://www.wandini.de/en/products/english-handle',
        '/',
      ),
    ).toBe('https://www.wandini.de/en');
    expect(
      buildLocaleSeoUrl(
        'https://www.wandini.de/en/collections/wall-murals',
        '/',
      ),
    ).toBe('https://www.wandini.de/en');
  });

  it('keeps English Collection ItemList product URLs under /en', () => {
    expect(
      buildLocaleSeoUrl(
        'https://www.wandini.de/en/collections/wall-murals',
        '/products/english-product',
      ),
    ).toBe('https://www.wandini.de/en/products/english-product');
  });

  it('keeps English Article breadcrumb URLs under /en', () => {
    const canonicalUrl =
      'https://www.wandini.de/en/blogs/magazine/wallpaper-care';

    expect(buildLocaleSeoUrl(canonicalUrl, '/')).toBe(
      'https://www.wandini.de/en',
    );
    expect(buildLocaleSeoUrl(canonicalUrl, '/blogs/magazine')).toBe(
      'https://www.wandini.de/en/blogs/magazine',
    );
  });

  it('keeps the global SEO kill switch authoritative', () => {
    expect(SEO_ENABLED).toBe(false);
    expect(resolveRobotsDirective('index,follow', SEO_ENABLED)).toBe(
      SEO_DISABLED_ROBOTS_DIRECTIVE,
    );
  });

  it('allows an explicit route noindex policy when SEO is enabled', () => {
    expect(resolveRobotsDirective('noindex,follow', true)).toBe(
      'noindex,follow',
    );
  });

  it('builds deterministic Open Graph and Twitter fallbacks', () => {
    const metadata = buildSeoMetadata({
      title: {fallback: 'Collection'},
      description: {fallback: 'Localized collection description'},
      canonicalUrl: 'https://www.wandini.de/collections/wallpaper?sort=popular',
      image: 'https://cdn.shopify.com/collection.jpg',
    });

    expect(metadata).toContainEqual({
      property: 'og:title',
      content: 'Collection | Wandini',
    });
    expect(metadata).toContainEqual({
      property: 'og:description',
      content: 'Localized collection description',
    });
    expect(metadata).toContainEqual({
      property: 'og:url',
      content: 'https://www.wandini.de/collections/wallpaper',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:title',
      content: 'Collection | Wandini',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:description',
      content: 'Localized collection description',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:image',
      content: 'https://cdn.shopify.com/collection.jpg',
    });
  });

  it('lets resource-specific social metadata override shared defaults', () => {
    const metadata = buildSeoMetadata({
      title: {fallback: 'Default title'},
      description: {fallback: 'Default description'},
      canonicalUrl: '/products/example',
      openGraph: {title: 'Product social title'},
      twitter: {description: 'Product social description'},
    });

    expect(metadata).toContainEqual({
      property: 'og:title',
      content: 'Product social title',
    });
    expect(metadata).toContainEqual({
      name: 'twitter:description',
      content: 'Product social description',
    });
  });
});
