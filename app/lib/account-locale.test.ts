import {describe, expect, it} from 'vitest';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from '~/lib/locale';
import {
  getCustomerAccountUiLocale,
  getDefaultAccountReturnPath,
  getPostLogoutRedirectPath,
  getSafeAccountReturnPath,
} from './account-locale';

describe('customer account locale flows', () => {
  it('derives Customer Account UI language from the URL-selected locale', () => {
    expect(getCustomerAccountUiLocale(GERMAN_LOCALE)).toBe('DE');
    expect(getCustomerAccountUiLocale(ENGLISH_LOCALE)).toBe('EN');
  });

  it('returns logout to the active storefront language', () => {
    expect(getPostLogoutRedirectPath(GERMAN_LOCALE)).toBe('/');
    expect(getPostLogoutRedirectPath(ENGLISH_LOCALE)).toBe('/en');
  });

  it('defaults account login returns to the active storefront language', () => {
    expect(getDefaultAccountReturnPath(GERMAN_LOCALE)).toBe('/account');
    expect(getDefaultAccountReturnPath(ENGLISH_LOCALE)).toBe('/en/account');
  });

  it('preserves safe return paths and rejects external returns', () => {
    expect(
      getSafeAccountReturnPath(
        new Request(
          'https://www.wandini.shop/en/account/login?return_to=%2Fen%2Faccount%2Forders%3Ffilter%3Dopen',
        ),
        ENGLISH_LOCALE,
      ),
    ).toBe('/en/account/orders?filter=open');

    expect(
      getSafeAccountReturnPath(
        new Request(
          'https://www.wandini.shop/en/account/login?return_to=https%3A%2F%2Fevil.example%2Fsteal',
        ),
        ENGLISH_LOCALE,
      ),
    ).toBe('/en/account');
  });
});
