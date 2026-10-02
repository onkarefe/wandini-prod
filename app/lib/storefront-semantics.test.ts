import {meta as policiesMeta} from '~/routes/policies._index';
import {meta as rootMeta} from '~/root';
import {getRobotsDirective} from '~/lib/seo';
import AccountLayout from '~/routes/account';
import AccountProfile from '~/routes/account.profile';
import AccountAddresses from '~/routes/account.addresses';
import AccountFavorites from '~/routes/account.favorites';
import Article from '~/routes/blogs.$blogHandle.$articleHandle';
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, dirname, basename} from 'node:path';
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

const chromium = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path): path is string => Boolean(path && existsSync(path)));

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

  it('renders every tab content in SSR with only the first panel visible', async () => {
    const tabContents = [
      'Description content',
      'Product information content',
      'Materials content',
      'Delivery content',
    ];
    const html = await markup(
      createElement(ProductDetailTabs, {
        tabTitles: ['Description', 'Information', 'Materials', 'Delivery'],
        tabContents,
      }),
    );
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    const panels = [
      ...html.matchAll(/<div\b[^>]*role="tabpanel"[^>]*>(.*?)<\/div>/g),
    ];
    expect(tabs).toHaveLength(4);
    expect(panels).toHaveLength(4);
    panels.forEach(([panel, content], index) => {
      expect(content).toBe(tabContents[index]);
      expect(panel.includes(' hidden=""')).toBe(index !== 0);
      expect(attributes(tabs[index], 'aria-controls')).toEqual(
        attributes(panel, 'id'),
      );
      expect(attributes(panel, 'aria-labelledby')).toEqual(
        attributes(tabs[index], 'id'),
      );
      expect(attributes(tabs[index], 'aria-selected')).toEqual([
        String(index === 0),
      ]);
      expect(attributes(tabs[index], 'tabindex')).toEqual([
        index === 0 ? '0' : '-1',
      ]);
    });
    expect(html).not.toMatch(/<h[1-6]\b/);
    expectResolvedRelationships(html);
  });

  it('keeps IDs unique across multiple tab components', async () => {
    const props = {
      tabTitles: ['Description', 'Materials'],
      tabContents: ['Text', 'Details'],
    };
    const html = await markup(
      createElement(
        Fragment,
        null,
        createElement(ProductDetailTabs, props),
        createElement(ProductDetailTabs, props),
      ),
    );
    expect(
      attributes(html, 'role').filter((role) => role === 'tabpanel'),
    ).toHaveLength(4);
    expectResolvedRelationships(html);
  });

  // Use installed Chromium and the existing React UMD builds; no DOM test dependency.
  it.skipIf(!chromium)(
    'preserves panel DOM nodes through clicks and keyboard navigation',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'product-detail-tabs-'));
      try {
        const require = createRequire(import.meta.url);
        const react = readFileSync(
          join(
            dirname(require.resolve('react/package.json')),
            'umd/react.development.js',
          ),
          'utf8',
        );
        const reactDOM = readFileSync(
          join(
            dirname(require.resolve('react-dom/package.json')),
            'umd/react-dom.development.js',
          ),
          'utf8',
        );
        const component = ts.transpileModule(
          readFileSync(
            new URL('../components/ProductDetailTabs.tsx', import.meta.url),
            'utf8',
          ),
          {
            compilerOptions: {
              module: ts.ModuleKind.CommonJS,
              jsx: ts.JsxEmit.React,
              target: ts.ScriptTarget.ES2022,
            },
          },
        ).outputText;
        const css = readFileSync(
          new URL('../styles/ProductDetailTabs.css', import.meta.url),
          'utf8',
        );
        const html = `<!doctype html><style>${css}</style><div id="root"></div><pre id="result">pending</pre>
        <script>${react}</script><script>${reactDOM}</script>
        <script>
          const exports = {};
          function require(name) {
            if (name === 'react') return React;
            if (name === '~/i18n/useTranslation') return {useTranslation: () => ({t: () => 'Information'})};
            throw new Error('Unexpected import: ' + name);
          }
          ${component}
          try {
            function check(condition, message) { if (!condition) throw new Error(message); }
            const contents = ['Description content', 'Information content', 'Materials content', 'Delivery content'];
            ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('root')).render(
              React.createElement(exports.ProductDetailTabs, {
                tabTitles: ['Description', 'Information', 'Materials', 'Delivery'],
                tabContents: contents.map(text => React.createElement('p', {key: text}, text))
              })
            ));
            const tabs = [...document.querySelectorAll('[role="tab"]')];
            const panels = [...document.querySelectorAll('[role="tabpanel"]')];
            const children = panels.map(panel => panel.firstChild);
            check(tabs.length === 4 && panels.length === 4, 'All tabs and panels must exist');
            function verify(active) {
              check(document.querySelectorAll('[role="tabpanel"]').length === 4, 'Panel count changed');
              panels.forEach((panel, index) => {
                check(panel.isConnected && document.getElementById(panel.id) === panel, 'Panel was replaced');
                check(panel.firstChild === children[index] && panel.textContent === contents[index], 'Content was replaced');
                check(panel.hidden === (index !== active), 'Incorrect hidden attribute');
                check((getComputedStyle(panel).display !== 'none') === (index === active), 'Incorrect visibility');
                check(tabs[index].getAttribute('aria-controls') === panel.id, 'Incorrect aria-controls');
                check(panel.getAttribute('aria-labelledby') === tabs[index].id, 'Incorrect aria-labelledby');
                check(tabs[index].getAttribute('aria-selected') === String(index === active), 'Incorrect selection');
                check(tabs[index].tabIndex === (index === active ? 0 : -1), 'Incorrect tabIndex');
              });
            }
            verify(0);
            ReactDOM.flushSync(() => tabs[2].click());
            verify(2);
            ReactDOM.flushSync(() => tabs[0].click());
            verify(0);
            tabs[0].focus();
            for (const [key, expected] of [['ArrowLeft', 3], ['ArrowRight', 0], ['ArrowRight', 1], ['ArrowLeft', 0], ['End', 3], ['Home', 0]]) {
              const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
              ReactDOM.flushSync(() => document.activeElement.dispatchEvent(event));
              check(event.defaultPrevented, 'Navigation default was not prevented');
              check(document.activeElement === tabs[expected], 'Focus did not follow keyboard navigation');
              verify(expected);
            }
            const ignored = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
            ReactDOM.flushSync(() => tabs[0].dispatchEvent(ignored));
            check(!ignored.defaultPrevented && document.activeElement === tabs[0], 'Unrelated key changed behavior');
            verify(0);
            document.getElementById('result').textContent = 'passed';
          } catch (error) {
            document.getElementById('result').textContent = 'failed: ' + error.message;
          }
        </script>`;
        const file = join(directory, 'tabs.html');
        writeFileSync(file, html);
        const output = execFileSync(
          chromium!,
          [
            '--headless',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-background-networking',
            '--user-data-dir=' + join(directory, 'profile'),
            '--dump-dom',
            pathToFileURL(file).href,
          ],
          {
            encoding: 'utf8',
            timeout: 20_000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        expect(output.match(/<pre id="result">(.*?)<\/pre>/)?.[1]).toBe(
          'passed',
        );
      } finally {
        // mkdtemp created this directory under the OS temporary directory.
        if (
          dirname(directory) === tmpdir() &&
          basename(directory).startsWith('product-detail-tabs-')
        ) {
          rmSync(directory, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 100,
          });
        }
      }
    },
    30_000,
  );

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
