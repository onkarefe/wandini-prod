import {redirect} from 'react-router';
import {getCanonicalLocalePathname} from './locale';

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
]);

function removeTrackingQueryParams(searchParams: URLSearchParams) {
  for (const key of [...searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.startsWith('utm_') ||
      TRACKING_QUERY_PARAMS.has(normalizedKey)
    ) {
      searchParams.delete(key);
    }
  }
}

export function buildSeoRedirectLocation(input: string | URL) {
  const url = new URL(input);
  removeTrackingQueryParams(url.searchParams);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildLocalizedHandleRedirectLocation(
  input: string | URL,
  replacements: Array<{currentHandle: string; localizedHandle: string}>,
) {
  const url = new URL(input);
  const replacementMap = new Map(
    replacements
      .filter(({currentHandle, localizedHandle}) => currentHandle !== localizedHandle)
      .map(({currentHandle, localizedHandle}) => [currentHandle, localizedHandle]),
  );

  if (replacementMap.size === 0) return null;

  let replaced = false;
  const segments = url.pathname.split('/').map((segment) => {
    let decodedSegment = segment;

    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      // Keep an invalid encoded segment unchanged.
    }

    const replacement = replacementMap.get(decodedSegment);
    if (!replacement) return segment;

    replaced = true;
    return encodeURIComponent(replacement);
  });

  if (!replaced) return null;

  url.pathname = getCanonicalLocalePathname(segments.join('/'));
  return buildSeoRedirectLocation(url);
}

export function redirectIfHandleIsLocalized(
  request: Request,
  ...localizedResources: Array<{
    handle: string;
    data: {handle: string} & unknown;
  }>
) {
  const location = buildLocalizedHandleRedirectLocation(
    request.url,
    localizedResources.map(({handle, data}) => ({
      currentHandle: handle,
      localizedHandle: data.handle,
    })),
  );

  if (location) throw redirect(location, 301);
}
