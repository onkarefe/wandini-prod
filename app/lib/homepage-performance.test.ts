import {createElement} from 'react';
import {existsSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {renderToString} from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  Outlet,
} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import Homepage, {loader, meta} from '~/routes/_index';
import {GERMAN_LOCALE, ENGLISH_LOCALE} from '~/lib/locale';

const chromium = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find((file): file is string => Boolean(file && existsSync(file)));

const image = (name: string) => ({
  url: `https://cdn.shopify.com/s/files/1/123/files/${name}.jpg?v=7`,
  altText: name,
  width: 1800,
  height: 1200,
});
const field = (key: string, value: string) => ({key, value});
const reference = (key: string, value: unknown) => ({key, reference: value});
const references = (key: string, nodes: unknown[]) => ({
  key,
  references: {nodes},
});
const object = (fields: unknown[], handle = 'main') => ({
  metaobjects: {nodes: [{handle, fields}]},
});
const optionalQueries = [
  'BestsellerProductsHomepage',
  'CustomGridMetaobjects',
  'StepByStepMetaobject',
  'ExampleSetHomepageMetaobject',
  'UberUnsHomepageMetaobject',
  'CustomerReviewsMetaobject',
] as const;

function fixture(language = 'DE') {
  return {
    HeroSections: object([
      field('title', `${language} Hero`),
      field('st1', 'First'),
      field('st2', 'Second'),
      field('button_text', 'Explore'),
      reference('button_action', {handle: 'wallpapers'}),
      reference('background', {image: image('hero')}),
    ]),
    UspBarMetaobjects: object(
      [
        field(
          'usp_titles',
          JSON.stringify([`${language} USP`, 'Second', 'Third']),
        ),
        field('ust_subtitles', '["One","Two","Three"]'),
        field('usp_icons', '["icon-a","icon-a","missing","unused"]'),
      ],
      'homepage',
    ),
    UspBarIcons: {nodes: [{id: 'icon-a', image: image('icon')}, null]},
    BestsellerProductsHomepage: {
      collection: {
        title: `${language} Bestseller`,
        products: {
          nodes: [
            {
              id: 'product-1',
              title: 'Wallpaper',
              handle: 'wallpaper',
              images: {nodes: [image('primary'), image('listing')]},
              priceRange: {
                minVariantPrice: {amount: '12.5', currencyCode: 'EUR'},
              },
            },
          ],
        },
      },
    },
    CustomGridMetaobjects: object([
      field('section_title', `${language} Categories`),
      field('titles', '["Room"]'),
      field('button_text', '["View"]'),
      references('links', [{handle: 'rooms'}]),
      references('background_images', [{image: image('room')}]),
    ]),
    StepByStepMetaobject: object([
      field('main_title', `${language} Steps`),
      field('main_description', 'How it works'),
      field('box_title', '["Choose"]'),
      field('box_description', '["Your design"]'),
      references('image', [{image: image('step')}]),
      field('cta_buton', 'Start'),
      reference('cta_action', {handle: 'wallpapers'}),
      field('bullets', '["Benefit"]'),
      references('bullet_icons', [{url: image('bullet').url}]),
    ]),
    ExampleSetHomepageMetaobject: object([
      field('title', `${language} Samples`),
      field('subdesc1', 'Try'),
      field('subdesc2', 'At home'),
      field('cta_text', 'Order'),
      reference('cta_action', {
        id: 'sample',
        handle: 'sample',
        title: 'Sample',
      }),
      reference('image', {image: image('sample')}),
    ]),
    UberUnsHomepageMetaobject: object([
      field('section_title', `${language} About`),
      field('section_content', 'Our story'),
      reference('section_i_mage', {url: image('about').url}),
    ]),
    CustomerReviewsMetaobject: object([
      field('section_title', `${language} Reviews`),
      field('customer_name', '["Ada"]'),
      field('customer_comment', '["Excellent"]'),
      field('comment_title', '["Great"]'),
      field('stars', '["{\\"value\\":\\"4\\",\\"scale_max\\":\\"5\\"}"]'),
      references('image', [{image: image('review')}]),
    ]),
    MarketingSeoMetaobjects: object([
      field('route_key', 'homepage'),
      field('seo_title', `${language} SEO title`),
      field('meta_description', `${language} Description`),
    ]),
  };
}

function setup(overrides: Record<string, unknown> = {}, language = 'DE') {
  const responses: Record<string, unknown> = {
    ...fixture(language),
    ...overrides,
  };
  const query = vi.fn(
    (
      document: string,
      options?: {cache?: unknown; variables?: Record<string, unknown>},
    ) => {
      const name = document.match(/\bquery\s+(\w+)/)?.[1] ?? '';
      if (!(name in responses)) throw new Error(`Unexpected query: ${name}`);
      const response = responses[name];
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    },
  );
  const args = {
    request: new Request(
      `https://www.wandini.shop/${language === 'EN' ? 'en' : ''}`,
    ),
    context: {
      env: {},
      storefront: {
        i18n: {country: 'DE', language},
        query,
        CacheLong: () => ({
          mode: 'public',
          maxAge: 3600,
          staleWhileRevalidate: 82800,
        }),
      },
    },
    params: {},
  };
  return {query, run: () => loader(args as never)};
}

async function renderHomepage(
  data: Awaited<ReturnType<typeof loader>>,
  language = 'DE',
) {
  const rootData = {
    selectedLocale: language === 'EN' ? ENGLISH_LOCALE : GERMAN_LOCALE,
    header: {
      shop: {name: 'Wandini', brand: {logo: {image: {url: image('logo').url}}}},
    },
  };
  const routes = [
    {
      id: 'root',
      path: '/',
      loader: () => rootData,
      element: createElement(Outlet),
      children: [
        {
          id: 'home',
          index: true,
          loader: () => data,
          element: createElement(Homepage),
        },
      ],
    },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request('https://www.wandini.shop/'));
  if (context instanceof Response) throw new Error('Unexpected redirect');
  return renderToString(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
      hydrate: false,
    }),
  );
}

describe('homepage request graph and SSR', () => {
  it.skipIf(!chromium)(
    'hydrates the complete homepage without replacing SSR nodes',
    async () => {
      const data = await setup().run();
      const html = await renderHomepage(data);
      const rootData = {
        selectedLocale: GERMAN_LOCALE,
        header: {
          shop: {
            name: 'Wandini',
            brand: {logo: {image: {url: image('logo').url}}},
          },
        },
      };
      const bundle = await build({
        stdin: {
          contents: `
        import React from 'react';
        import {hydrateRoot} from 'react-dom/client';
        import {createMemoryRouter, RouterProvider, Outlet} from 'react-router';
        import Homepage from './app/routes/_index';
        const errors = [];
        const originalError = console.error;
        console.error = (...args) => {
          if (/hydration|did not match|server HTML/i.test(String(args[0]))) errors.push(args.map(String).join(' ').slice(0, 250));
          originalError(...args);
        };
        const container = document.getElementById('app');
        const hero = container.querySelector('h1');
        const heroImage = container.querySelector('.hero-background-image');
        const rootData = ${JSON.stringify(rootData)};
        const data = ${JSON.stringify(data)};
        const router = createMemoryRouter([
          {id: 'root', path: '/', loader: () => rootData, element: React.createElement(Outlet), children: [
            {id: 'home', index: true, loader: () => data, element: React.createElement(Homepage)}
          ]}
        ], {hydrationData: {loaderData: {root: rootData, home: data}, actionData: null, errors: null}});
        hydrateRoot(container, React.createElement(RouterProvider, {router}), {
          onRecoverableError: error => errors.push(String(error))
        });
        setTimeout(() => {
          document.getElementById('result').textContent = JSON.stringify({
            errors, sameHero: hero === container.querySelector('h1'),
            sameImage: heroImage === container.querySelector('.hero-background-image'),
            sections: container.querySelectorAll('section').length
          });
        }, 100);
      `,
          resolveDir: process.cwd(),
          loader: 'tsx',
        },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        alias: {'~': resolve('app')},
        loader: {'.css': 'empty'},
        plugins: [{
          name: 'match-ssr-asset-url',
          setup(builder) {
            builder.onLoad({filter: /wand\.png$/}, () => ({
              contents: `export default ${JSON.stringify(html.match(/class="uberUnsHomepage__wandIcon" src="([^"]+)"/)?.[1])};`,
              loader: 'js',
            }));
          },
        }],
        define: {
          'process.env.NODE_ENV': '"development"',
          'import.meta.env.DEV': 'false',
        },
        logLevel: 'silent',
      });
      const directory = mkdtempSync(join(tmpdir(), 'homepage-hydration-'));
      try {
        const file = join(directory, 'index.html');
        writeFileSync(
          file,
          `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="img-src 'none'; connect-src 'none'"><div id="app">${html}</div><pre id="result"></pre><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`,
        );
        const output = execFileSync(
          chromium!,
          [
            '--headless',
            '--disable-gpu',
            '--no-first-run',
            '--disable-background-networking',
            '--user-data-dir=' + join(directory, 'profile'),
            '--dump-dom',
            '--virtual-time-budget=2000',
            pathToFileURL(file).href,
          ],
          {
            encoding: 'utf8',
            timeout: 20000,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        expect(
          JSON.parse(
            output.match(/<pre id="result">(.*?)<\/pre>/)?.[1] ?? '{}',
          ),
        ).toEqual({
          errors: [],
          sameHero: true,
          sameImage: true,
          sections: 8,
        });
      } finally {
        if (
          dirname(directory) === tmpdir() &&
          basename(directory).startsWith('homepage-hydration-')
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
    30000,
  );

  it('eliminates two requests, caches public CMS content and serializes only normalized data', async () => {
    const {query, run} = setup();
    const data = await run();
    expect(query).toHaveBeenCalledTimes(10); // Includes the existing SEO query and icon lookup.
    for (const [document, options] of query.mock.calls) {
      expect(document).not.toMatch(
        /query (FeaturedCollection|RecommendedProducts)\b/,
      );
      if (document.includes('query BestsellerProductsHomepage'))
        expect(options?.cache).toBeUndefined();
      else expect(options?.cache).toMatchObject({mode: 'public', maxAge: 3600});
    }
    const iconsCall = query.mock.calls.find(([document]) =>
      document.includes('query UspBarIcons'),
    );
    expect(iconsCall?.[1]?.variables?.ids).toEqual(['icon-a', 'missing']);
    expect(data.uspItems.map((item) => item.icon?.url ?? null)).toEqual([
      image('icon').url,
      image('icon').url,
      null,
    ]);
    expect(data).not.toHaveProperty('uspNode');
    expect(data).not.toHaveProperty('recommendedProducts');
    expect(data).not.toHaveProperty('featuredCollection');
    expect(Object.values(data).some((value) => value instanceof Promise)).toBe(
      false,
    );
  });

  it('starts the icon lookup before slower unrelated sections resolve', async () => {
    let resolveUsp!: (value: unknown) => void;
    let resolveGrid!: (value: unknown) => void;
    const usp = new Promise((resolve) => {
      resolveUsp = resolve;
    });
    const grid = new Promise((resolve) => {
      resolveGrid = resolve;
    });
    const {query, run} = setup({
      UspBarMetaobjects: usp,
      CustomGridMetaobjects: grid,
    });
    let completed = false;
    const pending = run().then((data) => {
      completed = true;
      return data;
    });
    expect(
      query.mock.calls.some(([document]) =>
        document.includes('query UspBarIcons'),
      ),
    ).toBe(false);
    resolveUsp(fixture().UspBarMetaobjects);
    await vi.waitFor(() =>
      expect(
        query.mock.calls.some(([document]) =>
          document.includes('query UspBarIcons'),
        ),
      ).toBe(true),
    );
    expect(completed).toBe(false);
    resolveGrid(fixture().CustomGridMetaobjects);
    await pending;
  });

  it.each(['DE', 'EN'])(
    'preserves %s content, fallbacks, images and complete initial HTML',
    async (language) => {
      const data = await setup({}, language).run();
      expect(data.hero).toMatchObject({
        title: `${language} Hero`,
        buttonAction: '/collections/wallpapers',
        backgroundImage: image('hero'),
      });
      expect(data.uspItems.map((item) => item.subtitle)).toEqual([
        'One',
        'Two',
        'Three',
      ]);
      expect(data.bestsellerProducts[0].images.nodes).toEqual([
        image('primary'),
        image('listing'),
      ]);
      expect(data.customGridItems[0]).toMatchObject({
        title: 'Room',
        link: '/collections/rooms',
        image: image('room'),
      });
      expect(data.stepByStep).toMatchObject({
        ctaText: 'Start',
        ctaLink: '/collections/wallpapers',
      });
      expect(data.uberUns.sectionImage).toMatchObject({
        url: image('about').url,
        altText: `${language} About`,
      });
      expect(data.customerReviews[0].stars).toEqual({
        value: '4',
        scale_max: '5',
      });
      const html = await renderHomepage(data, language);
      const labels = [
        'Hero',
        'USP',
        'Bestseller',
        'Categories',
        'Steps',
        'Samples',
        'About',
        'Reviews',
      ];
      const positions = labels.map((label) =>
        html.indexOf(`${language} ${label}`),
      );
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain('fetchPriority="high"');
      expect(html).toContain('id="bestseller-products-section"');
      expect(html).toContain('id="process-steps-title"');
      expect(html).toContain('id="example-set-homepage-title"');
      expect(html).toContain('id="uber-uns-homepage-title"');
      expect(html).toContain('width=240');
      expect(html).toContain('loading="lazy"');
      expect(html).not.toContain('<!--$?-->');
      const jsonLd = [
        ...html.matchAll(
          /<script type="application\/ld\+json">(.*?)<\/script>/g,
        ),
      ].map((match) => JSON.parse(match[1]) as {'@type': string; name: string});
      expect(jsonLd.map((value) => value['@type'])).toEqual([
        'WebSite',
        'OnlineStore',
      ]);
      expect(jsonLd.every((value) => value.name === 'Wandini')).toBe(true);
      const metadata = meta({data, matches: []} as never);
      expect(metadata).toContainEqual({
        title: `${language} SEO title | Wandini`,
      });
      expect(metadata).toContainEqual({
        tagName: 'link',
        rel: 'canonical',
        href: data.canonicalUrl,
      });
    },
  );

  it.each(optionalQueries)(
    'contains failure of %s without losing hero and USP',
    async (name) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const data = await setup({[name]: new Error('Unavailable')}).run();
      const html = await renderHomepage(data);
      expect(html).toContain('DE Hero');
      expect(html).toContain('DE USP');
    },
  );

  it('keeps USP text when icon lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await setup({UspBarIcons: new Error('Unavailable')}).run();
    expect(data.uspItems).toHaveLength(3);
    expect(data.uspItems.every((item) => item.icon === null)).toBe(true);
  });

  it('skips icon lookup for malformed or incomplete USP arrays', async () => {
    const {query, run} = setup({
      UspBarMetaobjects: object([
        field('usp_titles', 'invalid json'),
        field('usp_icons', '["icon-a"]'),
      ]),
    });
    expect((await run()).uspItems).toEqual([]);
    expect(
      query.mock.calls.some(([document]) =>
        document.includes('query UspBarIcons'),
      ),
    ).toBe(false);
  });

  it('still treats hero failure as critical', async () => {
    await expect(
      setup({HeroSections: new Error('Hero unavailable')}).run(),
    ).rejects.toThrow('Hero unavailable');
  });
});
