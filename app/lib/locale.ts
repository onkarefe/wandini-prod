import {redirect} from 'react-router';

export type SelectedLocale = {
  language: 'EN' | 'DE';
  country: 'US' | 'DE';
  locale: 'EN-US' | 'DE-DE';
  pathPrefix: '' | '/de-de';
  htmlLang: 'en' | 'de';
};

export const DEFAULT_LOCALE: SelectedLocale = {
  language: 'EN',
  country: 'US',
  locale: 'EN-US',
  pathPrefix: '',
  htmlLang: 'en',
};

export const GERMAN_LOCALE: SelectedLocale = {
  language: 'DE',
  country: 'DE',
  locale: 'DE-DE',
  pathPrefix: '/de-de',
  htmlLang: 'de',
};

function normalizeLocaleSegment(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function getFirstPathSegment(pathname: string) {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  return normalizeLocaleSegment(firstSegment);
}

export function getCanonicalLocaleSegment(locale?: string | null) {
  const normalizedLocale = normalizeLocaleSegment(locale);

  if (normalizedLocale === 'de' || normalizedLocale === 'de-de') {
    return 'de-de';
  }

  return null;
}

export function getLocaleFromI18n(i18n: {
  language?: string | null;
  country?: string | null;
}) {
  if (
    normalizeLocaleSegment(i18n.language) === 'de' &&
    normalizeLocaleSegment(i18n.country) === 'de'
  ) {
    return GERMAN_LOCALE;
  }

  return DEFAULT_LOCALE;
}

export function getLocaleFromRequest(request: Request) {
  const url = new URL(request.url);
  const localeSegment = getFirstPathSegment(url.pathname);

  if (getCanonicalLocaleSegment(localeSegment) === 'de-de') {
    return GERMAN_LOCALE;
  }

  return DEFAULT_LOCALE;
}

export function getLocaleFromParam(locale?: string | null) {
  const canonicalLocale = getCanonicalLocaleSegment(locale);

  if (!locale) {
    return DEFAULT_LOCALE;
  }

  if (canonicalLocale === 'de-de') {
    return GERMAN_LOCALE;
  }

  return null;
}

export function getCanonicalLocalePathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return pathname;
  }

  const canonicalLocale = getCanonicalLocaleSegment(segments[0]);

  if (!canonicalLocale || segments[0] === canonicalLocale) {
    return pathname;
  }

  segments[0] = canonicalLocale;
  return `/${segments.join('/')}`;
}

function isExternalPath(path: string) {
  return /^[a-z][a-z\d+\-.]*:/i.test(path) || path.startsWith('//');
}

function isResourcePath(path: string) {
  return (
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path.startsWith('/api/') ||
    path.startsWith('/sitemap/')
  );
}

export function prefixPathWithLocale(
  path: string,
  locale: SelectedLocale = DEFAULT_LOCALE,
) {
  if (
    !path ||
    !path.startsWith('/') ||
    locale.pathPrefix === '' ||
    isExternalPath(path) ||
    isResourcePath(path)
  ) {
    return path;
  }

  if (
    path === locale.pathPrefix ||
    path.startsWith(`${locale.pathPrefix}/`) ||
    path.startsWith(`${locale.pathPrefix}?`) ||
    path.startsWith(`${locale.pathPrefix}#`)
  ) {
    return path;
  }

  return path === '/' ? locale.pathPrefix : `${locale.pathPrefix}${path}`;
}

export function redirectToLocalePath(
  request: Request,
  path: string,
  init?: number | ResponseInit,
) {
  return redirect(prefixPathWithLocale(path, getLocaleFromRequest(request)), init);
}
