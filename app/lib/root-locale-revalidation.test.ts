import {describe, expect, it} from 'vitest';
import {shouldRevalidate} from '~/root';

function revalidates(currentPath: string, nextPath: string) {
  return shouldRevalidate({
    currentUrl: new URL(`https://www.wandini.shop${currentPath}`),
    nextUrl: new URL(`https://www.wandini.shop${nextPath}`),
  } as never);
}

describe('root locale revalidation', () => {
  it('revalidates locale-dependent root data in both directions', () => {
    expect(revalidates('/products/foo', '/en/products/foo')).toBe(true);
    expect(revalidates('/en/products/foo', '/products/foo')).toBe(true);
  });

  it('keeps the existing GET optimization within one locale', () => {
    expect(revalidates('/products/foo', '/collections/foo')).toBe(false);
    expect(revalidates('/en/products/foo', '/en/collections/foo')).toBe(false);
  });

  it('preserves mutation and manual revalidation behavior', () => {
    const currentUrl = new URL('https://www.wandini.shop/products/foo');

    expect(
      shouldRevalidate({
        currentUrl,
        nextUrl: new URL('https://www.wandini.shop/cart'),
        formMethod: 'POST',
      } as never),
    ).toBe(true);
    expect(shouldRevalidate({currentUrl, nextUrl: currentUrl} as never)).toBe(
      true,
    );
  });
});
