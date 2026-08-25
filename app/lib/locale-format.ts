import type {SelectedLocale} from '~/lib/locale';

type DisplayLocale = Pick<SelectedLocale, 'language' | 'country'>;

export function getDisplayLocale(locale: DisplayLocale) {
  return `${locale.language.toLowerCase()}-${locale.country}`;
}

export function formatLocaleNumber(
  value: number,
  locale: DisplayLocale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getDisplayLocale(locale), options).format(value);
}

export function formatLocaleCurrency(
  amount: string | number,
  currencyCode: string,
  locale: DisplayLocale,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
) {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currencyCode}`;
  }

  try {
    return new Intl.NumberFormat(getDisplayLocale(locale), {
      style: 'currency',
      currency: currencyCode,
      ...options,
    }).format(numericAmount);
  } catch {
    return `${amount} ${currencyCode}`;
  }
}

export function formatLocaleDate(
  value: string | Date,
  locale: DisplayLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(getDisplayLocale(locale), options).format(date);
}

export function getLocaleRegionName(
  regionCode: string,
  locale: DisplayLocale,
) {
  try {
    return (
      new Intl.DisplayNames([getDisplayLocale(locale)], {type: 'region'}).of(
        regionCode,
      ) ?? regionCode
    );
  } catch {
    return regionCode;
  }
}
