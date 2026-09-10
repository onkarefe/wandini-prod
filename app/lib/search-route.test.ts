import {describe, expect, it} from 'vitest';
import {getSearchRouteTerm} from './search';

describe('getSearchRouteTerm', () => {
  it.each([
    ['/search', '?q=dino', 'dino'],
    ['/search/', '?q=%20auto%20', 'auto'],
    ['/en/search', '?q=forest+wallpaper', 'forest wallpaper'],
    ['/de-de/search', '?q=wald', 'wald'],
  ])(
    'reads the query from a localized search route',
    (pathname, search, term) => {
      expect(getSearchRouteTerm(pathname, search)).toBe(term);
    },
  );

  it('does not carry a search query into another storefront route', () => {
    expect(getSearchRouteTerm('/en/collections/wallpaper', '?q=dino')).toBe('');
  });

  it('returns an empty value when the search route has no query', () => {
    expect(getSearchRouteTerm('/search', '')).toBe('');
  });
});
