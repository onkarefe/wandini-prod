import {describe, expect, it} from 'vitest';
import {resolveCollectionSeoPolicy} from './collection-seo';

describe('collection crawl policy', () => {
  it('keeps the base collection URL clean and indexable', () => {
    expect(
      resolveCollectionSeoPolicy(
        'https://www.wandini.de/collections/wallpaper',
      ),
    ).toEqual({
      canonicalUrl: 'https://www.wandini.de/collections/wallpaper',
      isFacetedCollectionUrl: false,
      robots: 'index,follow',
    });
  });

  it.each([
    [
      'https://www.wandini.de/collections/wallpaper?direction=next&cursor=page-2',
      'https://www.wandini.de/collections/wallpaper?cursor=page-2&direction=next',
    ],
    [
      'https://www.wandini.de/en/collections/wallpaper?direction=next&cursor=page-2',
      'https://www.wandini.de/en/collections/wallpaper?cursor=page-2&direction=next',
    ],
  ])('self-canonicalizes collection pagination at %s', (input, canonicalUrl) => {
    expect(resolveCollectionSeoPolicy(input)).toEqual({
      canonicalUrl,
      isFacetedCollectionUrl: false,
      robots: 'index,follow',
    });
  });

  it.each([
    [
      'https://www.wandini.de/collections/wallpaper?direction=previous&cursor=page-2',
      'https://www.wandini.de/collections/wallpaper',
    ],
    [
      'https://www.wandini.de/en/collections/wallpaper?direction=previous&cursor=page-2',
      'https://www.wandini.de/en/collections/wallpaper',
    ],
  ])('makes backward collection pagination noindex at %s', (input, canonicalUrl) => {
    expect(resolveCollectionSeoPolicy(input)).toEqual({
      canonicalUrl,
      isFacetedCollectionUrl: false,
      robots: 'noindex,follow',
    });
  });

  it.each([
    'https://www.wandini.de/collections/wallpaper?sort=PRICE',
    'https://www.wandini.de/collections/wallpaper?f=%7B%22available%22%3Atrue%7D',
  ])('makes a filter or sort URL noindex with a clean canonical', (input) => {
    expect(resolveCollectionSeoPolicy(input)).toEqual({
      canonicalUrl: 'https://www.wandini.de/collections/wallpaper',
      isFacetedCollectionUrl: true,
      robots: 'noindex,follow',
    });
  });

  it.each(['next', 'previous'])(
    'lets the filter policy win over %s pagination',
    (direction) => {
      expect(
        resolveCollectionSeoPolicy(
          `https://www.wandini.de/en/collections/wallpaper?f=%7B%22available%22%3Atrue%7D&direction=${direction}&cursor=page-2`,
        ),
      ).toEqual({
        canonicalUrl: 'https://www.wandini.de/en/collections/wallpaper',
        isFacetedCollectionUrl: true,
        robots: 'noindex,follow',
      });
    },
  );
});
