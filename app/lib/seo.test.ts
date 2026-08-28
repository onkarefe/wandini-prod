import {describe, expect, it} from 'vitest';
import {
  buildCanonicalUrl,
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
