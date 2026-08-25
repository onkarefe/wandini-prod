import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {LanguageSwitcherLinks} from '~/components/LanguageSwitcher';
import {
  getFixedLanguageSwitchLinks,
  resolveResourceLanguageSwitchLinks,
  type LocalizedResourceType,
} from '~/lib/language-switcher';

function storefrontReturning(node: unknown) {
  return {
    CacheLong: vi.fn(() => ({mode: 'public'})),
    query: vi.fn().mockResolvedValue({node}),
  };
}

function resolveResource({
  url,
  node,
  resourceType,
}: {
  url: string;
  node: unknown;
  resourceType: LocalizedResourceType;
}) {
  const storefront = storefrontReturning(node);
  const result = resolveResourceLanguageSwitchLinks({
    storefront: storefront as never,
    request: new Request(url),
    resourceId: 'gid://shopify/Resource/1',
    resourceType,
  });

  return {result, storefront};
}

describe('checkpoint 5 language switching', () => {
  it.each([
    ['/', {DE: '/', EN: '/en'}],
    ['/en', {DE: '/', EN: '/en'}],
    ['/cart', {DE: '/cart', EN: '/en/cart'}],
    ['/en/cart', {DE: '/cart', EN: '/en/cart'}],
    ['/account', {DE: '/account', EN: '/en/account'}],
    ['/en/account/orders', {DE: '/account/orders', EN: '/en/account/orders'}],
    ['/search?q=koi', {DE: '/search?q=koi', EN: '/en/search?q=koi'}],
    ['/en/search?q=koi', {DE: '/search?q=koi', EN: '/en/search?q=koi'}],
  ])(
    'switches the fixed route %s without duplicate locale prefixes',
    (path, expected) => {
      expect(getFixedLanguageSwitchLinks(path)).toEqual(expected);
      expect(getFixedLanguageSwitchLinks(path).EN).not.toContain('/en/en');
    },
  );

  it('never localizes the wishlist API resource', () => {
    expect(getFixedLanguageSwitchLinks('/api/wishlist')).toEqual({
      DE: '/api/wishlist',
      EN: '/api/wishlist',
    });
  });

  it('switches product 8-3 to its real English handle', async () => {
    const {result, storefront} = resolveResource({
      url: 'https://www.wandini.shop/products/8-3',
      resourceType: 'Product',
      node: {
        __typename: 'Product',
        handle: 'koi-wall-mural-with-lotus-flowers',
      },
    });

    await expect(result).resolves.toEqual({
      DE: '/products/8-3',
      EN: '/en/products/koi-wall-mural-with-lotus-flowers',
    });
    expect(storefront.query).toHaveBeenCalledWith(expect.any(String), {
      cache: {mode: 'public'},
      variables: {
        id: 'gid://shopify/Resource/1',
        country: 'DE',
        language: 'EN',
      },
    });
  });

  it('switches the English product back to the real German handle', async () => {
    const {result, storefront} = resolveResource({
      url: 'https://www.wandini.shop/en/products/koi-wall-mural-with-lotus-flowers',
      resourceType: 'Product',
      node: {__typename: 'Product', handle: '8-3'},
    });

    await expect(result).resolves.toEqual({
      DE: '/products/8-3',
      EN: '/en/products/koi-wall-mural-with-lotus-flowers',
    });
    expect(storefront.query).toHaveBeenCalledWith(expect.any(String), {
      cache: {mode: 'public'},
      variables: {
        id: 'gid://shopify/Resource/1',
        country: 'DE',
        language: 'DE',
      },
    });
  });

  it('uses the translated collection handle and preserves its query', async () => {
    const {result} = resolveResource({
      url: 'https://www.wandini.shop/collections/fototapeten?sort=best-selling',
      resourceType: 'Collection',
      node: {__typename: 'Collection', handle: 'wall-murals'},
    });

    await expect(result).resolves.toEqual({
      DE: '/collections/fototapeten?sort=best-selling',
      EN: '/en/collections/wall-murals?sort=best-selling',
    });
  });

  it.each([
    [
      'Page',
      'https://www.wandini.shop/pages/kontakt',
      {__typename: 'Page', handle: 'contact'},
      '/en/pages/contact',
    ],
    [
      'Blog',
      'https://www.wandini.shop/blogs/magazin',
      {__typename: 'Blog', handle: 'magazine'},
      '/en/blogs/magazine',
    ],
    [
      'Article',
      'https://www.wandini.shop/blogs/magazin/pflege',
      {
        __typename: 'Article',
        handle: 'wallpaper-care',
        blog: {handle: 'magazine'},
      },
      '/en/blogs/magazine/wallpaper-care',
    ],
  ] as const)(
    'uses the translated %s handle',
    async (resourceType, url, node, expectedEnglishPath) => {
      const {result} = resolveResource({url, node, resourceType});
      const links = await result;

      expect(links.EN).toBe(expectedEnglishPath);
    },
  );

  it('falls back to the target-language home when resolution fails', async () => {
    const unresolved = resolveResource({
      url: 'https://www.wandini.shop/products/8-3',
      resourceType: 'Product',
      node: null,
    });
    await expect(unresolved.result).resolves.toEqual({
      DE: '/products/8-3',
      EN: '/en',
    });

    const storefront = storefrontReturning(null);
    storefront.query.mockRejectedValue(new Error('Storefront unavailable'));
    await expect(
      resolveResourceLanguageSwitchLinks({
        storefront: storefront as never,
        request: new Request(
          'https://www.wandini.shop/en/products/english-handle',
        ),
        resourceId: 'gid://shopify/Product/1',
        resourceType: 'Product',
      }),
    ).resolves.toEqual({
      DE: '/',
      EN: '/en/products/english-handle',
    });
  });

  it('renders DE and EN as ordered real href links with an active state', () => {
    const markup = renderToStaticMarkup(
      createElement(LanguageSwitcherLinks, {
        activeLanguage: 'DE',
        label: 'Language',
        links: {DE: '/search?q=koi', EN: '/en/search?q=koi'},
      }),
    );

    expect(markup).toContain('href="/search?q=koi"');
    expect(markup).toContain('href="/en/search?q=koi"');
    expect(markup).toContain('aria-current="page"');
    expect(markup.indexOf('>DE</a>')).toBeLessThan(markup.indexOf('>EN</a>'));
  });

  it('places desktop DE/EN immediately before profile, wishlist, and cart', () => {
    const headerSource = readFileSync(
      fileURLToPath(
        new URL('../components/DesktopHeader.tsx', import.meta.url),
      ),
      'utf8',
    );
    const actions = headerSource.slice(
      headerSource.indexOf('function DesktopActions'),
      headerSource.indexOf('function ResolvedCartAction'),
    );
    const language = actions.indexOf('dhx-desktopLanguageSwitcher');
    const profile = actions.indexOf('className="dhx-account"');
    const wishlist = actions.indexOf('className="dhx-saved"');
    const cart = actions.indexOf('<Suspense');

    expect(
      [language, profile, wishlist, cart].every((index) => index >= 0),
    ).toBe(true);
    expect(language).toBeLessThan(profile);
    expect(profile).toBeLessThan(wishlist);
    expect(wishlist).toBeLessThan(cart);
    expect(headerSource).toContain('dhx-mobileLanguageSwitcher');
  });

  it('wires every Shopify resource loader to stable-ID resolution', () => {
    const routeExpectations = [
      ['../routes/products.$handle.tsx', "resourceType: 'Product'"],
      ['../routes/collections.$handle.tsx', "resourceType: 'Collection'"],
      ['../routes/pages.$handle.tsx', "resourceType: 'Page'"],
      ['../routes/blogs.$blogHandle._index.tsx', "resourceType: 'Blog'"],
      [
        '../routes/blogs.$blogHandle.$articleHandle.tsx',
        "resourceType: 'Article'",
      ],
    ] as const;

    for (const [routePath, resourceType] of routeExpectations) {
      const routeSource = readFileSync(
        fileURLToPath(new URL(routePath, import.meta.url)),
        'utf8',
      );

      expect(routeSource).toContain('resolveResourceLanguageSwitchLinks');
      expect(routeSource).toContain('resourceId:');
      expect(routeSource).toContain(resourceType);
    }
  });
});
