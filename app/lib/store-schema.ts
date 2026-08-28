import {buildCanonicalUrl} from './seo';

const DEFAULT_STORE_NAME = 'Wandini';

type StoreSchemaInput = {
  canonicalUrl: string | URL;
  name?: string | null;
  logo?: string | null;
};

function getText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getStoreRootUrl(canonicalInput: string | URL) {
  const canonicalUrl = buildCanonicalUrl(canonicalInput);
  const isAbsolute = /^https?:\/\//i.test(canonicalUrl);
  const url = new URL(canonicalUrl, 'https://canonical.invalid');

  return isAbsolute ? `${url.origin}/` : '/';
}

export function getOnlineStoreId(canonicalInput: string | URL) {
  return `${getStoreRootUrl(canonicalInput)}#online-store`;
}

export function getWebsiteId(canonicalInput: string | URL) {
  return `${getStoreRootUrl(canonicalInput)}#website`;
}

export function buildOnlineStoreJsonLd({
  canonicalUrl,
  name,
  logo,
}: StoreSchemaInput) {
  const logoUrl = getText(logo);

  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': getOnlineStoreId(canonicalUrl),
    name: getText(name) ?? DEFAULT_STORE_NAME,
    url: getStoreRootUrl(canonicalUrl),
    ...(logoUrl ? {logo: logoUrl} : {}),
  };
}

export function buildWebsiteJsonLd({canonicalUrl, name}: StoreSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': getWebsiteId(canonicalUrl),
    name: getText(name) ?? DEFAULT_STORE_NAME,
    url: getStoreRootUrl(canonicalUrl),
    publisher: {'@id': getOnlineStoreId(canonicalUrl)},
  };
}

export function buildStorePublisherReference(canonicalInput: string | URL) {
  return {'@id': getOnlineStoreId(canonicalInput)};
}
