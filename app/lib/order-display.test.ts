import {describe, expect, it} from 'vitest';
import {createTranslator} from '~/i18n';
import {
  formatFinancialStatus,
  formatFulfillmentStatus,
  formatOrderDate,
} from './order-display';

describe('localized order presentation', () => {
  it('uses the active language for statuses', () => {
    expect(formatFinancialStatus('PAID', createTranslator({language: 'DE'}))).toBe(
      'Bezahlt',
    );
    expect(formatFinancialStatus('PAID', createTranslator({language: 'EN'}))).toBe(
      'Paid',
    );
    expect(
      formatFulfillmentStatus('FULFILLED', createTranslator({language: 'EN'})),
    ).toBe('Shipped');
  });

  it('formats dates as German or English for the Germany market', () => {
    const date = '2026-08-25T12:00:00.000Z';
    const de = {
      language: 'DE',
      country: 'DE',
      pathPrefix: '',
      htmlLang: 'de',
    } as const;
    const en = {
      language: 'EN',
      country: 'DE',
      pathPrefix: '/en',
      htmlLang: 'en',
    } as const;

    expect(formatOrderDate(date, de, createTranslator(de))).toContain('August');
    expect(formatOrderDate(date, en, createTranslator(en))).toContain('August');
  });
});
