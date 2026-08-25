import {describe, expect, it} from 'vitest';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from '~/lib/locale';
import {
  formatLocaleCurrency,
  formatLocaleDate,
  getDisplayLocale,
} from './locale-format';

describe('locale-sensitive storefront formatting', () => {
  it('uses Germany display conventions for both storefront languages', () => {
    expect(getDisplayLocale(GERMAN_LOCALE)).toBe('de-DE');
    expect(getDisplayLocale(ENGLISH_LOCALE)).toBe('en-DE');
  });

  it('changes currency presentation without changing the amount or currency', () => {
    const german = formatLocaleCurrency('1234.5', 'EUR', GERMAN_LOCALE);
    const english = formatLocaleCurrency('1234.5', 'EUR', ENGLISH_LOCALE);

    expect(german).toMatch(/1[.\s]234,50/);
    expect(english).toMatch(/1[.,\s]234[.,]50/);
    expect(german).toContain('€');
    expect(english).toContain('€');
  });

  it('formats order dates with the active language', () => {
    const date = '2026-08-25T12:00:00.000Z';
    const options = {day: '2-digit', month: 'long', year: 'numeric'} as const;

    expect(formatLocaleDate(date, GERMAN_LOCALE, options)).toContain('August');
    expect(formatLocaleDate(date, ENGLISH_LOCALE, options)).toContain('August');
  });
});
