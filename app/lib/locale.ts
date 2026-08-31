import {redirect} from 'react-router';

export type SelectedLocale = {
  language: 'DE' | 'EN';
  country: 'DE';
  pathPrefix: '' | '/en';
  htmlLang: 'de' | 'en';
};

export const GERMAN_LOCALE: SelectedLocale = {
  language: 'DE',
  country: 'DE',
  pathPrefix: '',
  htmlLang: 'de',
};

export const ENGLISH_LOCALE: SelectedLocale = {
  language: 'EN',
  country: 'DE',
  pathPrefix: '/en',
  htmlLang: 'en',
};

export const DEFAULT_LOCALE = GERMAN_LOCALE;

const LOCALE_SEGMENTS = {
  de: GERMAN_LOCALE,
  'de-de': GERMAN_LOCALE,
  en: ENGLISH_LOCALE,
  'en-us': ENGLISH_LOCALE,
  'en-en': ENGLISH_LOCALE,
} as const;

function normalizeLocaleSegment(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function getFirstPathSegment(pathname: string) {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  return normalizeLocaleSegment(firstSegment);
}

function normalizeReactRouterDataPathname(pathname: string) {
  if (pathname === '/_root.data') {
    return '/';
  }

  return pathname.replace(/\.data$/, '');
}

function getLocaleFromSegment(segment?: string | null) {
  const normalizedSegment = normalizeLocaleSegment(segment);
  return (
    LOCALE_SEGMENTS[normalizedSegment as keyof typeof LOCALE_SEGMENTS] ?? null
  );
}

export function getCanonicalLocaleSegment(locale?: string | null) {
  return getLocaleFromSegment(locale)?.pathPrefix.slice(1) ?? null;
}

export function getLocaleFromI18n(i18n: {
  language?: string | null;
  country?: string | null;
}) {
  return normalizeLocaleSegment(i18n.language) === 'en'
    ? ENGLISH_LOCALE
    : GERMAN_LOCALE;
}

export function getLocaleFromPathname(pathname: string) {
  const normalizedPathname = normalizeReactRouterDataPathname(pathname);
  return (
    getLocaleFromSegment(getFirstPathSegment(normalizedPathname)) ??
    DEFAULT_LOCALE
  );
}

export function getLocaleFromRequest(request: Request) {
  return getLocaleFromPathname(new URL(request.url).pathname);
}

export function getLocaleFromParam(locale?: string | null) {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  return getLocaleFromSegment(locale);
}

export function getCanonicalLocalePathname(pathname: string) {
  const localeMatch = pathname.match(/^\/([^/]+)(\/.*)?$/);

  if (!localeMatch) {
    return pathname;
  }

  const locale = getLocaleFromSegment(localeMatch[1]);

  if (!locale) {
    return pathname;
  }

  const remainingPathname = localeMatch[2] ?? '';

  if (locale.pathPrefix === '') {
    return remainingPathname || '/';
  }

  return `${locale.pathPrefix}${remainingPathname}`;
}

function isExternalPath(path: string) {
  return /^[a-z][a-z\d+\-.]*:/i.test(path) || path.startsWith('//');
}

export function isResourcePathname(pathname: string) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sitemap-similar-products.xml' ||
    pathname.startsWith('/sitemap/')
  );
}

function stripLocaleSegments(pathname: string) {
  let unlocalizedPathname = pathname;

  while (true) {
    const localeMatch = unlocalizedPathname.match(/^\/([^/]+)(?=\/|$)/);

    if (!localeMatch || !getLocaleFromSegment(localeMatch[1])) {
      break;
    }

    unlocalizedPathname =
      unlocalizedPathname.slice(localeMatch[0].length) || '/';
  }

  return unlocalizedPathname;
}

function splitPathSuffix(path: string) {
  const suffixIndex = path.search(/[?#]/);

  if (suffixIndex === -1) {
    return {pathname: path, suffix: ''};
  }

  return {
    pathname: path.slice(0, suffixIndex),
    suffix: path.slice(suffixIndex),
  };
}

export function prefixPathWithLocale(
  path: string,
  locale: SelectedLocale = DEFAULT_LOCALE,
) {
  if (!path || isExternalPath(path) || !path.startsWith('/')) {
    return path;
  }

  const {pathname, suffix} = splitPathSuffix(path);
  const unlocalizedPathname = stripLocaleSegments(pathname);

  if (isResourcePathname(unlocalizedPathname)) {
    return `${unlocalizedPathname}${suffix}`;
  }

  if (locale.pathPrefix === '') {
    return `${unlocalizedPathname}${suffix}`;
  }

  const localizedPathname =
    unlocalizedPathname === '/'
      ? locale.pathPrefix
      : `${locale.pathPrefix}${unlocalizedPathname}`;

  return `${localizedPathname}${suffix}`;
}

export function didLocaleChange(currentUrl: URL, nextUrl: URL) {
  return (
    getLocaleFromPathname(currentUrl.pathname).language !==
    getLocaleFromPathname(nextUrl.pathname).language
  );
}

export function redirectToLocalePath(
  request: Request,
  path: string,
  init?: number | ResponseInit,
) {
  return redirect(
    prefixPathWithLocale(path, getLocaleFromRequest(request)),
    init,
  );
}
