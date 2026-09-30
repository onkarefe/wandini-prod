import {meta as policiesMeta} from '~/routes/policies._index';
import {meta as rootMeta} from '~/root';
import {getRobotsDirective} from '~/lib/seo';
import AccountLayout from '~/routes/account';
import AccountProfile from '~/routes/account.profile';
import AccountAddresses from '~/routes/account.addresses';
import AccountFavorites from '~/routes/account.favorites';
import Article from '~/routes/blogs.$blogHandle.$articleHandle';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createElement, Fragment, type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  Outlet,
} from 'react-router';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {Aside} from '~/components/Aside';
import {ProductDetailTabs} from '~/components/ProductDetailTabs';
import {Breadcrumbs} from '~/components/ProductBreadcrumb';
import AllProdutsNew, {BestsellerCard} from '~/components/AllProdutsNew';
import CustomProductCard from '~/components/CustomProductCard';
import BestsellerProductCard from '~/components/BestsellerProductCard';
import {SearchResultsPredictive} from '~/components/SearchResultsPredictive';
import {GERMAN_LOCALE, ENGLISH_LOCALE, type SelectedLocale} from '~/lib/locale';

async function markup(
  element: ReactElement,
  locale: SelectedLocale = GERMAN_LOCALE,
) {
  const routes = [
    {id: 'root', path: '/', loader: () => ({selectedLocale: locale}), element},
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request('https://www.wandini.shop/'));
  if (context instanceof Response) throw new Error('Unexpected redirect');
  return renderToStaticMarkup(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
      hydrate: false,
    }),
  );
}

function attributes(html: string, name: string) {
  return [...html.matchAll(new RegExp('\\b' + name + '="([^"]*)"', 'g'))].map(
    (match) => match[1],
  );
}

function expectResolvedRelationships(html: string) {
  const ids = attributes(html, 'id');
  expect(new Set(ids).size).toBe(ids.length);
  for (const name of [
    'aria-labelledby',
    'aria-describedby',
    'aria-controls',
    'list',
  ]) {
    for (const reference of attributes(html, name).flatMap((value) =>
      value.split(/\s+/),
    )) {
      expect(ids, name + '=' + reference).toContain(reference);
    }
  }
}

const product = {
  id: 'same-product',
  handle: 'wallpaper',
  title: 'Wallpaper',
  images: {nodes: []},
  priceRange: {minVariantPrice: {amount: '10', currencyCode: 'EUR'}},
};

describe('storefront semantic invariants', () => {
  it.each([GERMAN_LOCALE, ENGLISH_LOCALE])(
    'keeps auxiliary drawers out of the main outline (%s)',
    async (locale) => {
      const html = await markup(
        createElement(
          Aside.Provider,
          null,
          createElement(
            Aside,
            {type: 'cart', heading: 'Cart'},
            createElement('p', null, 'Items'),
          ),
          createElement(
            Aside,
            {type: 'search', heading: 'Search'},
            createElement('p', null, 'Results'),
          ),
          createElement('main', null, createElement('h1', null, 'Page')),
        ),
        locale,
      );
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html.match(/role="dialog"/g)).toHaveLength(2);
      expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
      expectResolvedRelationships(html);
      expect(
        [...html.matchAll(/<button\b[^>]*>/g)].every(
          ([tag]) =>
            tag.includes('type="button"') && tag.includes('aria-label='),
        ),
      ).toBe(true);
    },
  );

  it('connects only the active tab to the mounted shared panel without a hidden heading', async () => {
    const html = await markup(
      createElement(ProductDetailTabs, {
        tabTitles: ['Description', 'Materials', 'Delivery'],
        tabContents: [
          'Description content',
          'Materials content',
          'Delivery content',
        ],
      }),
    );
    expect(
      attributes(html, 'role').filter((role) => role === 'tab'),
    ).toHaveLength(3);
    expect(
      attributes(html, 'role').filter((role) => role === 'tabpanel'),
    ).toHaveLength(1);
    expect(attributes(html, 'aria-selected')).toEqual([
      'true',
      'false',
      'false',
    ]);
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    const panel = html.match(/<div\b[^>]*role="tabpanel"[^>]*>/)?.[0] ?? '';
    const activeTab = tabs[0];
    expect(attributes(activeTab, 'aria-controls')).toHaveLength(1);
    expect(
      tabs.slice(1).map((tab) => attributes(tab, 'aria-controls')),
    ).toEqual([[], []]);
    expect(attributes(activeTab, 'aria-controls')).toEqual(
      attributes(panel, 'id'),
    );
    expect(attributes(panel, 'aria-labelledby')).toEqual(
      attributes(activeTab, 'id'),
    );
    expect(html).not.toMatch(/<h2\b[^>]*>Description<\/h2>/);
    expectResolvedRelationships(html);
  });

  it('keeps empty suggestions mounted as the input list target', async () => {
    const html = await markup(
      createElement(
        Fragment,
        null,
        createElement('input', {
          type: 'search',
          'aria-label': 'Search',
          list: 'suggestions',
        }),
        createElement(SearchResultsPredictive.Queries, {
          queries: [],
          queriesDatalistId: 'suggestions',
        }),
      ),
    );
    expect(html).toContain('<datalist id="suggestions">');
    expectResolvedRelationships(html);
  });

  it('uses section and card headings in the homepage carousel', async () => {
    const html = await markup(
      createElement(AllProdutsNew, {
        products: [product],
        sectionTitle: 'Bestsellers',
      }),
    );
    expect(html).toMatch(/<h2\b[^>]*>Bestsellers<\/h2>/);
    expect(html).toMatch(/<h3\b[^>]*>Wallpaper<\/h3>/);
    expectResolvedRelationships(html);
  });

  it.each(['h2', 'h3'] as const)(
    'supports the collection and section card contexts (%s)',
    async (headingLevel) => {
      const html = await markup(
        createElement(
          Fragment,
          null,
          createElement(BestsellerCard, {product, headingLevel}),
          createElement(CustomProductCard, {
            productId: 'product',
            title: 'Wallpaper',
            images: [],
            productUrl: '/products/wallpaper',
            headingLevel,
          }),
        ),
      );
      expect(
        html.match(new RegExp('<' + headingLevel + '\\b', 'g')),
      ).toHaveLength(2);
    },
  );

  it('does not duplicate title IDs when the same product is rendered twice', async () => {
    const props = {
      productId: 'gid://shopify/Product/1',
      title: 'Wallpaper',
      images: [],
      productUrl: '/products/wallpaper',
    };
    const html = await markup(
      createElement(
        Fragment,
        null,
        createElement(BestsellerProductCard, props),
        createElement(BestsellerProductCard, props),
      ),
    );
    expectResolvedRelationships(html);
    expect(html.match(/<h3\b/g)).toHaveLength(2);
  });

  it('represents the current breadcrumb without a self-link', () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumbs, {
        items: [
          {name: 'Home', url: '/'},
          {name: 'Collections', url: '/collections'},
        ],
      }),
    );
    expect(html).toContain('<nav');
    expect(html).toContain('<ol>');
    expect(html).toContain('<span aria-current="page">Collections</span>');
    expect(attributes(html, 'href')).toEqual(['/']);
  });

  it('reserves main elements for the application layout and standalone root fallbacks', () => {
    const app = fileURLToPath(new URL('..', import.meta.url));
    const walk = (directory: string): string[] =>
      readdirSync(directory, {withFileTypes: true}).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(directory, entry.name))
          : [join(directory, entry.name)],
      );
    const failures: string[] = [];
    for (const file of walk(app).filter((file) => file.endsWith('.tsx'))) {
      if (file.endsWith('root.tsx') || file.endsWith('PageLayout.tsx'))
        continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(source) === 'main'
        )
          failures.push(file);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(failures).toEqual([]);
  });
});

describe('nested account and article route outlines', () => {
  const customer = {
    firstName: 'Test',
    lastName: 'Customer',
    addresses: {nodes: []},
    defaultAddress: null,
  };
  it.each([
    ['profile', AccountProfile, {}],
    ['addresses', AccountAddresses, {customer}],
    ['favorites', AccountFavorites, {favorites: [], wishlistStatus: 'ready'}],
  ] as const)(
    'keeps the account shell H1 and a single main on %s',
    async (path, Component, data) => {
      const routes = [
        {
          id: 'root',
          path: '/',
          loader: () => ({selectedLocale: ENGLISH_LOCALE}),
          element: createElement('main', null, createElement(Outlet)),
          children: [
            {
              id: 'routes/account',
              path: 'account',
              loader: () => ({customer}),
              element: createElement(AccountLayout),
              children: [
                {path, loader: () => data, element: createElement(Component)},
              ],
            },
          ],
        },
      ];
      const handler = createStaticHandler(routes);
      const context = await handler.query(
        new Request('https://www.wandini.shop/account/' + path),
      );
      if (context instanceof Response) throw new Error('Unexpected redirect');
      const html = renderToStaticMarkup(
        createElement(StaticRouterProvider, {
          router: createStaticRouter(handler.dataRoutes, context),
          context,
          hydrate: false,
        }),
      );
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toMatch(/<h2\b[^>]*class="account-page__title"/);
      expectResolvedRelationships(html);
    },
  );

  it('renders a blog article with one page title and named hero image', async () => {
    const article = {
      id: 'article',
      handle: 'example',
      title: 'Article title',
      publishedAt: '2026-01-01T12:00:00Z',
      contentHtml: '<h2>Article section</h2><p>Article text.</p>',
      excerpt: 'Excerpt',
      author: {name: 'Author'},
      image: {
        url: 'https://cdn.shopify.com/article.jpg',
        width: 800,
        height: 600,
        altText: '',
      },
    };
    const routes = [
      {
        id: 'root',
        path: '/',
        loader: () => ({selectedLocale: ENGLISH_LOCALE}),
        element: createElement('main', null, createElement(Outlet)),
        children: [
          {
            path: '*',
            element: createElement(Article),
            loader: () => ({
              article,
              relatedArticles: [],
              blogHandle: 'news',
              blogTitle: 'News',
              canonicalUrl: 'https://www.wandini.shop/en/blogs/news/example',
            }),
          },
        ],
      },
    ];
    const handler = createStaticHandler(routes);
    const context = await handler.query(
      new Request('https://www.wandini.shop/en/blogs/news/example'),
    );
    if (context instanceof Response) throw new Error('Unexpected redirect');
    const html = renderToStaticMarkup(
      createElement(StaticRouterProvider, {
        router: createStaticRouter(handler.dataRoutes, context),
        context,
        hydrate: false,
      }),
    );
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('alt="Article title"');
    expectResolvedRelationships(html);
  });
});

describe('document title fallbacks', () => {
  it.each([
    ['/policies', 'Richtlinien'],
    ['/en/policies', 'Policies'],
  ])(
    'adds a title without changing policy-index robots (%s)',
    (pathname, expected) => {
      const descriptors = policiesMeta({location: {pathname}} as Parameters<
        typeof policiesMeta
      >[0]);
      expect(descriptors).toContainEqual({title: expected});
      expect(descriptors).toContainEqual({
        name: 'robots',
        content: getRobotsDirective('noindex,follow'),
      });
      expect(descriptors?.filter((item) => 'title' in item)).toHaveLength(1);
    },
  );

  it.each(['/missing', '/en/missing'])(
    'provides an error title when no leaf metadata exists (%s)',
    (pathname) => {
      const descriptors = rootMeta({
        location: {pathname},
        error: {
          status: 404,
          statusText: 'Not Found',
          internal: false,
          data: '',
        },
      } as Parameters<typeof rootMeta>[0]);
      expect(descriptors?.filter((item) => 'title' in item)).toHaveLength(1);
      expect(descriptors?.[0]).toHaveProperty(
        'title',
        pathname.startsWith('/en/')
          ? "We couldn't find this wall."
          : 'Diese Wand haben wir nicht gefunden.',
      );
    },
  );
});
