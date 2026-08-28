import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {Breadcrumbs} from '~/components/ProductBreadcrumb';
import {buildArticleStructuredData} from './article-schema';
import {
  buildBreadcrumbStructuredData,
  buildContentBreadcrumbItems,
} from './breadcrumbs';
import {SEO_ENABLED} from './seo';
import {
  buildOnlineStoreJsonLd,
  buildWebsiteJsonLd,
  getOnlineStoreId,
} from './store-schema';

function expectVisibleBreadcrumbMatchesStructuredData(
  items: ReturnType<typeof buildContentBreadcrumbItems>,
) {
  const structuredData = buildBreadcrumbStructuredData(items);
  const markup = renderToStaticMarkup(createElement(Breadcrumbs, {items}));

  expect(structuredData?.itemListElement).toEqual(
    items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  );
  expect(markup).toContain('aria-label="Breadcrumb"');
  items.slice(0, -1).forEach((item) => {
    expect(markup).toContain(`href="${item.url}"`);
  });
  expect(markup).toContain(
    `<span aria-current="page">${items.at(-1)?.name}</span>`,
  );
}

describe('store and remaining content schemas', () => {
  it('uses one stable OnlineStore identity for WebSite and localized URLs', () => {
    const germanCanonical = 'https://www.wandini.de/';
    const englishCanonical = 'https://www.wandini.de/en';
    const store = buildOnlineStoreJsonLd({
      canonicalUrl: englishCanonical,
      name: 'Wandini',
      logo: 'https://cdn.shopify.com/wandini-logo.png',
    });
    const website = buildWebsiteJsonLd({
      canonicalUrl: germanCanonical,
      name: 'Wandini',
    });

    expect(store).toMatchObject({
      '@type': 'OnlineStore',
      '@id': 'https://www.wandini.de/#online-store',
      name: 'Wandini',
      url: 'https://www.wandini.de/',
      logo: 'https://cdn.shopify.com/wandini-logo.png',
    });
    expect(website).toMatchObject({
      '@type': 'WebSite',
      '@id': 'https://www.wandini.de/#website',
      url: 'https://www.wandini.de/',
      publisher: {'@id': store['@id']},
    });
    expect(getOnlineStoreId(germanCanonical)).toBe(
      getOnlineStoreId(englishCanonical),
    );
  });

  it('omits unavailable company and merchant policy data safely', () => {
    const store = buildOnlineStoreJsonLd({
      canonicalUrl: 'https://www.wandini.de/',
      name: 'Wandini',
    });
    const serialized = JSON.stringify(store);

    expect(serialized).not.toContain('contactPoint');
    expect(serialized).not.toContain('sameAs');
    expect(serialized).not.toContain('hasShippingService');
    expect(serialized).not.toContain('hasMerchantReturnPolicy');
  });

  it('uses real Article dates, author, image, and shared publisher identity', () => {
    const canonicalUrl =
      'https://www.wandini.de/en/blogs/magazine/wallpaper-care';
    const article = buildArticleStructuredData(
      {
        title: 'Wallpaper care',
        contentHtml: '<p>Care instructions.</p>',
        publishedAt: '2026-07-01T08:00:00Z',
        updatedAt: '2026-08-20T12:00:00Z',
        author: {name: 'Shopify Author'},
        image: {url: 'https://cdn.shopify.com/article.jpg'},
      },
      canonicalUrl,
    );

    expect(article).toMatchObject({
      '@type': 'Article',
      headline: 'Wallpaper care',
      url: canonicalUrl,
      mainEntityOfPage: canonicalUrl,
      datePublished: '2026-07-01T08:00:00Z',
      dateModified: '2026-08-20T12:00:00Z',
      image: 'https://cdn.shopify.com/article.jpg',
      author: {'@type': 'Person', name: 'Shopify Author'},
      publisher: {'@id': 'https://www.wandini.de/#online-store'},
    });
  });

  it('omits missing optional Article fields instead of fabricating them', () => {
    const article = buildArticleStructuredData(
      {title: 'Real headline', publishedAt: '2026-07-01T08:00:00Z'},
      'https://www.wandini.de/blogs/magazin/beitrag',
    );
    const serialized = JSON.stringify(article);

    expect(serialized).not.toContain('dateModified');
    expect(serialized).not.toContain('author');
    expect(serialized).not.toContain('image');
  });
});

describe('shared visible breadcrumbs and BreadcrumbList', () => {
  it.each([
    {
      label: 'German Collection',
      canonicalUrl: 'https://www.wandini.de/collections/fototapeten',
      currentName: 'Fototapeten',
      expectedHome: {name: 'Startseite', url: 'https://www.wandini.de/'},
    },
    {
      label: 'English Collection',
      canonicalUrl: 'https://www.wandini.de/en/collections/wall-murals',
      currentName: 'Wall murals',
      expectedHome: {name: 'Home', url: 'https://www.wandini.de/en'},
    },
    {
      label: 'German Blog',
      canonicalUrl: 'https://www.wandini.de/blogs/magazin',
      currentName: 'Magazin',
      expectedHome: {name: 'Startseite', url: 'https://www.wandini.de/'},
    },
    {
      label: 'English Blog',
      canonicalUrl: 'https://www.wandini.de/en/blogs/magazine',
      currentName: 'Magazine',
      expectedHome: {name: 'Home', url: 'https://www.wandini.de/en'},
    },
  ])('matches visible and structured hierarchy for $label', (input) => {
    const items = buildContentBreadcrumbItems(input);

    expect(items[0]).toEqual(input.expectedHome);
    expectVisibleBreadcrumbMatchesStructuredData(items);
  });

  it.each([
    {
      canonicalUrl: 'https://www.wandini.de/blogs/magazin/pflege',
      currentName: 'Tapetenpflege',
      parent: {name: 'Magazin', path: '/blogs/magazin'},
      expected: [
        {name: 'Startseite', url: 'https://www.wandini.de/'},
        {name: 'Magazin', url: 'https://www.wandini.de/blogs/magazin'},
        {
          name: 'Tapetenpflege',
          url: 'https://www.wandini.de/blogs/magazin/pflege',
        },
      ],
    },
    {
      canonicalUrl:
        'https://www.wandini.de/en/blogs/magazine/wallpaper-care',
      currentName: 'Wallpaper care',
      parent: {name: 'Magazine', path: '/blogs/magazine'},
      expected: [
        {name: 'Home', url: 'https://www.wandini.de/en'},
        {
          name: 'Magazine',
          url: 'https://www.wandini.de/en/blogs/magazine',
        },
        {
          name: 'Wallpaper care',
          url: 'https://www.wandini.de/en/blogs/magazine/wallpaper-care',
        },
      ],
    },
  ])('matches localized Article hierarchy for $canonicalUrl', (input) => {
    const items = buildContentBreadcrumbItems(input);

    expect(items).toEqual(input.expected);
    expectVisibleBreadcrumbMatchesStructuredData(items);
  });

  it('keeps the global SEO kill switch disabled', () => {
    expect(SEO_ENABLED).toBe(false);
  });
});
