import type {SelectedLocale} from '~/lib/locale';
import {prefixPathWithLocale} from '~/lib/locale';

export function getCustomerAccountUiLocale(
  locale: Pick<SelectedLocale, 'language'>,
) {
  return locale.language;
}

export function getPostLogoutRedirectPath(locale: SelectedLocale) {
  return prefixPathWithLocale('/', locale);
}

export function getDefaultAccountReturnPath(locale: SelectedLocale) {
  return prefixPathWithLocale('/account', locale);
}

export function getSafeAccountReturnPath(
  request: Request,
  locale: SelectedLocale,
) {
  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get('return_to');

  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return getDefaultAccountReturnPath(locale);
  }

  try {
    const returnUrl = new URL(returnTo, requestUrl.origin);

    if (returnUrl.origin !== requestUrl.origin) {
      return getDefaultAccountReturnPath(locale);
    }

    return `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
  } catch {
    return getDefaultAccountReturnPath(locale);
  }
}
