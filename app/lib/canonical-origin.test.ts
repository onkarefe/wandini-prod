import {describe, expect, it} from 'vitest';
import {
  buildCanonicalRequestUrl,
  isCanonicalOriginRequest,
  isProductionSeoRequest,
  normalizeCanonicalOrigin,
} from './canonical-origin';

describe('canonical production origin', () => {
  it('normalizes an explicit HTTPS origin', () => {
    expect(normalizeCanonicalOrigin('https://www.wandini.example/')).toBe(
      'https://www.wandini.example',
    );
    expect(normalizeCanonicalOrigin('http://www.wandini.example')).toBeNull();
    expect(
      normalizeCanonicalOrigin('https://www.wandini.example/store'),
    ).toBeNull();
  });

  it('rewrites a preview request to the configured production origin', () => {
    expect(
      buildCanonicalRequestUrl(
        'https://preview.example/en/products/mural?cursor=abc&direction=next',
        'https://www.wandini.example',
      ),
    ).toBe(
      'https://www.wandini.example/en/products/mural?cursor=abc&direction=next',
    );
  });

  it('does not guess an origin when configuration is absent', () => {
    expect(
      buildCanonicalRequestUrl('https://preview.example/products/mural'),
    ).toBe('https://preview.example/products/mural');
  });

  it('keeps preview and unconfigured deployments outside production SEO', () => {
    expect(
      isCanonicalOriginRequest(
        'https://preview.example/products/mural',
        'https://www.wandini.example',
      ),
    ).toBe(false);
    expect(
      isProductionSeoRequest({
        requestUrl: 'https://www.wandini.example/products/mural',
        configuredOrigin: 'https://www.wandini.example',
        seoEnabled: false,
      }),
    ).toBe(false);
    expect(
      isProductionSeoRequest({
        requestUrl: 'https://www.wandini.example/products/mural',
        configuredOrigin: 'https://www.wandini.example',
        seoEnabled: true,
      }),
    ).toBe(true);
  });
});
