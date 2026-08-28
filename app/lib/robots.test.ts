import {describe, expect, it} from 'vitest';
import {buildRobotsTxt} from '../routes/[robots.txt]';
import {SEO_ENABLED} from './seo';

describe('robots crawl policy', () => {
  it('disallows the entire site while SEO is disabled', () => {
    expect(
      buildRobotsTxt({
        seoEnabled: SEO_ENABLED,
        canonicalOrigin: 'https://www.wandini.example',
      }),
    ).toBe('User-agent: *\nDisallow: /\n');
    expect(SEO_ENABLED).toBe(false);
  });

  it('keeps pagination crawlable in the enabled production policy', () => {
    const robots = buildRobotsTxt({
      seoEnabled: true,
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
});
