import {describe, expect, it} from 'vitest';
import {
  DEFAULT_LOCALE,
  ENGLISH_LOCALE,
  GERMAN_LOCALE,
  didLocaleChange,
  getCanonicalLocalePathname,
  getCanonicalLocaleSegment,
  getLocaleFromI18n,
  getLocaleFromParam,
  getLocaleFromRequest,
  isResourcePathname,
  prefixPathWithLocale,
} from '~/lib/locale';
import {localizeTo} from '~/lib/i18n-router';
import {loader as localeLoader} from '~/routes/locale';

describe('production locale contract', () => {
  it.each([
    ['/', 'DE', 'DE'],
    ['/products/foo', 'DE', 'DE'],
    ['/en', 'EN', 'DE'],
    ['/en/products/foo', 'EN', 'DE'],
  ])('resolves %s to %s language and %s country', (path, language, country) => {
    const locale = getLocaleFromRequest(
      new Request(`https://www.wandini.shop${path}`),
    );

    expect(locale).toMatchObject({language, country});
  });

  it('uses German as the default and keeps language separate from country', () => {
    expect(DEFAULT_LOCALE).toBe(GERMAN_LOCALE);
    expect(GERMAN_LOCALE.htmlLang).toBe('de');
    expect(ENGLISH_LOCALE).toMatchObject({
      language: 'EN',
      country: 'DE',
      pathPrefix: '/en',
      htmlLang: 'en',
    });
    expect(getLocaleFromI18n({language: 'EN', country: 'US'})).toBe(
      ENGLISH_LOCALE,
    );
  });

  it('validates route params without accepting unsupported languages', () => {
    expect(getLocaleFromParam(undefined)).toBe(GERMAN_LOCALE);
    expect(getLocaleFromParam('en')).toBe(ENGLISH_LOCALE);
    expect(getLocaleFromParam('fr')).toBeNull();
    expect(getCanonicalLocaleSegment('de-de')).toBe('');
    expect(getCanonicalLocaleSegment('en-us')).toBe('en');
  });
});

describe('legacy locale canonicalization', () => {
  it.each([
    ['/de', '/'],
    ['/de/', '/'],
    ['/de-de', '/'],
    ['/de-de/', '/'],
    ['/de/products/foo', '/products/foo'],
    ['/de-de/products/foo', '/products/foo'],
    ['/en-us', '/en'],
    ['/en-en', '/en'],
    ['/en-us/products/foo', '/en/products/foo'],
    ['/en-en/products/foo', '/en/products/foo'],
  ])('canonicalizes %s directly to %s', (pathname, canonicalPathname) => {
    expect(getCanonicalLocalePathname(pathname)).toBe(canonicalPathname);
  });

  it.each(['/en', '/en/', '/en/products/foo', '/', '/products/foo'])(
    'does not redirect canonical pathname %s',
    (pathname) => {
      expect(getCanonicalLocalePathname(pathname)).toBe(pathname);
    },
  );

  it.each([
    [
      'https://www.wandini.shop/de-de/products/foo?variant=123#details',
      'de-de',
      '/products/foo?variant=123#details',
    ],
    [
      'https://www.wandini.shop/en-us/search?q=forest',
      'en-us',
      '/en/search?q=forest',
    ],
  ])(
    'issues one permanent redirect for %s and preserves its suffix',
    async (url, locale, expectedLocation) => {
      let thrownResponse: unknown;

      try {
        await localeLoader({
          request: {url} as Request,
          params: {locale},
        } as never);
      } catch (response) {
        thrownResponse = response;
      }

      expect(thrownResponse).toBeInstanceOf(Response);
      expect((thrownResponse as Response).status).toBe(301);
      expect((thrownResponse as Response).headers.get('Location')).toBe(
        expectedLocation,
      );
    },
  );

  it('rejects an unsupported locale-looking route param', async () => {
    await expect(
      localeLoader({
        request: new Request('https://www.wandini.shop/fr/products/foo'),
        params: {locale: 'fr'},
      } as never),
    ).rejects.toMatchObject({status: 404});
  });
});

describe('locale-aware navigation paths', () => {
  it.each([
    ['/products/foo', GERMAN_LOCALE, '/products/foo'],
    ['/products/foo', ENGLISH_LOCALE, '/en/products/foo'],
    ['/en/products/foo', ENGLISH_LOCALE, '/en/products/foo'],
    ['/en/products/foo', GERMAN_LOCALE, '/products/foo'],
    ['/de-de/products/foo', ENGLISH_LOCALE, '/en/products/foo'],
    ['/en/de-de/products/foo', ENGLISH_LOCALE, '/en/products/foo'],
    [
      '/products/foo?variant=123#details',
      ENGLISH_LOCALE,
      '/en/products/foo?variant=123#details',
    ],
  ])('maps %s safely for the selected locale', (path, locale, expected) => {
    expect(prefixPathWithLocale(path, locale)).toBe(expected);
  });

  it.each([
    'https://example.com/products/foo',
    'mailto:hello@example.com',
    '//cdn.example.com/image.jpg',
    '?q=forest',
    '#details',
  ])('leaves non-path destination %s untouched', (destination) => {
    expect(prefixPathWithLocale(destination, ENGLISH_LOCALE)).toBe(destination);
  });

  it.each([
    '/api/wishlist',
    '/api/2026-07/graphql.json',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap/products/1.xml',
    '/sitemap-similar-products.xml',
  ])('keeps resource path %s unlocalized', (path) => {
    expect(isResourcePathname(path)).toBe(true);
    expect(prefixPathWithLocale(path, ENGLISH_LOCALE)).toBe(path);
  });

  it('preserves search and hash for object-form React Router destinations', () => {
    expect(
      localizeTo(
        {pathname: '/products/foo', search: '?variant=123', hash: '#details'},
        ENGLISH_LOCALE,
      ),
    ).toEqual({
      pathname: '/en/products/foo',
      search: '?variant=123',
      hash: '#details',
    });

    expect(
      localizeTo({search: '?q=forest', hash: '#results'}, ENGLISH_LOCALE),
    ).toEqual({search: '?q=forest', hash: '#results'});
  });
});

describe('checkpoint 3 shared navigation regressions', () => {
  it.each([
    [
      'German product',
      '/products/8-3',
      GERMAN_LOCALE,
      '/products/8-3',
    ],
    [
      'English localized product',
      '/products/koi-wall-mural-with-lotus-flowers',
      ENGLISH_LOCALE,
      '/en/products/koi-wall-mural-with-lotus-flowers',
    ],
    [
      'already-prefixed English product',
      '/en/products/koi-wall-mural-with-lotus-flowers',
      ENGLISH_LOCALE,
      '/en/products/koi-wall-mural-with-lotus-flowers',
    ],
    [
      'English similar motifs',
      '/similar-products/koi-lotus',
      ENGLISH_LOCALE,
      '/en/similar-products/koi-lotus',
    ],
    [
      'English account login',
      '/account/login?return_to=%2Fen%2Fproducts%2Fkoi%3Fvariant%3D1%23details',
      ENGLISH_LOCALE,
      '/en/account/login?return_to=%2Fen%2Fproducts%2Fkoi%3Fvariant%3D1%23details',
    ],
    ['German cart', '/cart', GERMAN_LOCALE, '/cart'],
    ['English cart', '/cart', ENGLISH_LOCALE, '/en/cart'],
  ])('keeps the %s destination locale-safe', (_name, path, locale, expected) => {
    expect(prefixPathWithLocale(path, locale)).toBe(expected);
  });

  it.each([
    ['external URL', 'https://example.com/products/koi'],
    ['wishlist resource', '/api/wishlist'],
  ])('does not localize the %s', (_name, path) => {
    expect(prefixPathWithLocale(path, ENGLISH_LOCALE)).toBe(path);
  });
});

describe('locale change detection', () => {
  it('detects both German to English and English to German navigation', () => {
    expect(
      didLocaleChange(
        new URL('https://www.wandini.shop/products/foo'),
        new URL('https://www.wandini.shop/en/products/foo'),
      ),
    ).toBe(true);
    expect(
      didLocaleChange(
        new URL('https://www.wandini.shop/en/products/foo'),
        new URL('https://www.wandini.shop/products/foo'),
      ),
    ).toBe(true);
  });

  it('does not mark same-language navigation as a locale change', () => {
    expect(
      didLocaleChange(
        new URL('https://www.wandini.shop/products/foo'),
        new URL('https://www.wandini.shop/collections/foo'),
      ),
    ).toBe(false);
  });
});
