import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {getLocaleFromRequest} from '~/lib/locale';

const APP_ROOT = new URL('../', import.meta.url);

const CUSTOMER_FACING_STOREFRONT_OPERATIONS = {
  'lib/fragments.ts': ['Header', 'Footer'],
  'graphql/storefront/AccountFavoritesProductsQuery.ts': [
    'AccountFavoritesProducts',
  ],
  'routes/_index.tsx': [
    'HeroSections',
    'UspBarMetaobjects',
    'UspBarIcons',
    'BestsellerProductsHomepage',
    'CustomGridMetaobjects',
    'StepByStepMetaobject',
    'UberUnsHomepageMetaobject',
    'CustomerReviewsMetaobject',
    'FeaturedCollection',
    'RecommendedProducts',
  ],
  'routes/products.$handle.tsx': ['Product'],
  'routes/collections.$handle.tsx': ['CustomCollection'],
  'routes/collections._index.tsx': ['StoreCollections'],
  'routes/collections.all.tsx': ['Catalog'],
  'routes/search.tsx': ['RegularSearch', 'PredictiveSearch'],
  'routes/pages.$handle.tsx': ['KontaktPageDetails', 'FAQ', 'Page'],
  'routes/blogs._index.tsx': ['Blogs'],
  'routes/blogs.$blogHandle._index.tsx': ['Blog'],
  'routes/blogs.$blogHandle.$articleHandle.tsx': ['Article'],
  'routes/policies._index.tsx': ['Policies'],
  'routes/policies.$handle.tsx': ['Policy'],
  'lib/similar-products.ts': ['SimilarProductsBase'],
  'lib/similar-products-preview.ts': ['SimilarMotifsPreview'],
  'routes/cart.tsx': ['CartUpsellProducts'],
} as const;

function readAppFile(relativePath: string) {
  return readFileSync(new URL(relativePath, APP_ROOT), 'utf8');
}

function getQueryPreamble(source: string, operationName: string) {
  const match = source.match(
    new RegExp(`\\bquery\\s+${operationName}\\b([\\s\\S]*?)\\{`),
  );

  expect(match, `Missing GraphQL query ${operationName}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('Storefront localization audit', () => {
  it.each([
    ['/', {language: 'DE', country: 'DE'}],
    ['/en', {language: 'EN', country: 'DE'}],
  ])('resolves %s to the Storefront request context', (pathname, expected) => {
    expect(
      getLocaleFromRequest(new Request(`https://www.wandini.shop${pathname}`)),
    ).toMatchObject(expected);
  });

  it('keeps every audited customer-facing Storefront query language-aware', () => {
    for (const [relativePath, operationNames] of Object.entries(
      CUSTOMER_FACING_STOREFRONT_OPERATIONS,
    )) {
      const source = readAppFile(relativePath);

      for (const operationName of operationNames) {
        const preamble = getQueryPreamble(source, operationName);
        const inContextArguments = preamble.match(
          /@inContext\s*\(([^)]*)\)/,
        )?.[1];

        expect(preamble, `${operationName} must declare $country`).toMatch(
          /\$country\s*:\s*CountryCode/,
        );
        expect(preamble, `${operationName} must declare $language`).toMatch(
          /\$language\s*:\s*LanguageCode/,
        );
        expect(
          inContextArguments,
          `${operationName} must use @inContext`,
        ).toContain('country: $country');
        expect(inContextArguments).toContain('language: $language');
      }
    }
  });

  it('relies on Hydrogen injection instead of manual request-locale variables', () => {
    const source = [
      readAppFile('routes/account.favorites.tsx'),
      readAppFile('routes/policies.$handle.tsx'),
    ].join('\n');

    expect(source).not.toMatch(
      /\b(?:country|language):\s*(?:context\.)?storefront\.i18n/,
    );
  });
});
