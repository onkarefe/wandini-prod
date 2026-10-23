import {describe, expect, it} from 'vitest';
import {buildRobotsTxt, loader} from '../routes/[robots.txt]';
import {SEO_ENABLED} from './seo';

describe('robots crawl policy', () => {
  it('disallows the entire site while SEO is disabled', () => {
    expect(
      buildRobotsTxt({
        seoEnabled: false,
        canonicalOrigin: 'https://www.wandini.example',
      }),
    ).toBe('User-agent: *\nDisallow: /\n');
  });

  it('keeps pagination crawlable in the enabled production policy', () => {
    const robots = buildRobotsTxt({
      seoEnabled: SEO_ENABLED,
      canonicalOrigin: 'https://www.wandini.example',
    });

    expect(robots).not.toContain('cursor');
    expect(robots).not.toContain('direction');
    expect(robots).not.toContain('sort');
    expect(robots).not.toContain('Disallow: /search');
    expect(robots).toContain('Disallow: /account');
    expect(robots).toContain('Disallow: /en/checkout');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain(
      'Sitemap: https://www.wandini.example/sitemap.xml',
    );
  });

  it('does not expose a sitemap without canonical-origin configuration', () => {
    expect(buildRobotsTxt({seoEnabled: true})).toBe(
      'User-agent: *\nDisallow: /\n',
    );
  });

  it.each([
    ['https://production.example', 'https://production.example', true],
    ['http://localhost:3000', 'https://production.example', false],
    ['https://preview.oxygen.example', 'https://production.example', false],
    ['https://staging.example', 'https://production.example', false],
    ['https://alternate.example', 'https://production.example', false],
    ['https://production.example', undefined, false],
    ['https://production.example', 'https://production.example/path', false],
  ])(
    'serves the correct crawl policy on %s with origin %s',
    async (origin, configuredOrigin, enabled) => {
      const response = await loader({
        request: new Request(`${origin}/robots.txt`),
        context: {env: {PUBLIC_CANONICAL_ORIGIN: configuredOrigin}},
      } as never);
      const body = await response.text();
      expect(response.status).toBe(200);
      if (enabled) {
        expect(body).toContain(
          'Sitemap: https://production.example/sitemap.xml',
        );
        expect(body).not.toMatch(/^Disallow: \/$/m);
        expect(body).toContain('Disallow: /cart');
        expect(response.headers.has('X-Robots-Tag')).toBe(false);
      } else {
        expect(body).toBe('User-agent: *\nDisallow: /\n');
        expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
    },
  );
});
