import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  buildLocalizedHandleRedirectLocation,
  buildSeoRedirectLocation,
  redirectIfHandleIsLocalized,
} from './redirect';

describe('SEO normalization redirects', () => {
  it('replaces only complete resource-handle path segments', () => {
    expect(
      buildLocalizedHandleRedirectLocation(
        'https://preview.example/en/products/old-handle-related/old-handle?variant=1&utm_source=test',
        [{currentHandle: 'old-handle', localizedHandle: 'english-handle'}],
      ),
    ).toBe(
      '/en/products/old-handle-related/english-handle?variant=1',
    );
  });

  it('preserves functional pagination and filter state while removing tracking', () => {
    expect(
      buildSeoRedirectLocation(
        'https://preview.example/en-us/collections/wallpaper?cursor=abc&direction=next&f=%7B%7D&utm_campaign=test',
      ),
    ).toBe(
      '/en-us/collections/wallpaper?cursor=abc&direction=next&f=%7B%7D',
    );
  });

  it('redirects a legacy locale and localized handle permanently in one hop', () => {
    let thrown: unknown;

    try {
      redirectIfHandleIsLocalized(
        new Request(
          'https://preview.example/en-us/products/german-handle?variant=1&utm_source=test',
        ),
        {
          handle: 'german-handle',
          data: {handle: 'english-handle'},
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(301);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/en/products/english-handle?variant=1',
    );
  });

  it('wires permanent locale and localized-handle redirects', () => {
    const localeRoute = readFileSync(
      fileURLToPath(new URL('../routes/locale.tsx', import.meta.url)),
      'utf8',
    );
    const redirectHelper = readFileSync(
      fileURLToPath(new URL('./redirect.ts', import.meta.url)),
      'utf8',
    );

    expect(localeRoute).toContain(
      'redirect(buildSeoRedirectLocation(url), 301)',
    );
    expect(localeRoute).toContain("? '/collections'");
    expect(localeRoute).toContain("? '/en/collections'");
    expect(redirectHelper).toContain('redirect(location, 301)');
  });

  it('makes /collections/all a permanent direct locale-aware redirect', () => {
    const route = readFileSync(
      fileURLToPath(
        new URL('../routes/collections.all.tsx', import.meta.url),
      ),
      'utf8',
    );

    expect(route).toContain(
      "redirectToLocalePath(args.request, '/collections', 301)",
    );
  });
});
