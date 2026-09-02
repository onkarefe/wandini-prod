import {buildLocaleSeoUrl, buildPaginationCanonicalUrl} from './seo';
import {createTranslator} from '~/i18n';
import {getLocaleFromPathname} from './locale';

export type BreadcrumbItem = {
  name: string;
  url: string;
};

type ContentBreadcrumbInput = {
  canonicalUrl: string | URL;
  currentName?: string | null;
  parent?: {name?: string | null; path: string} | null;
};

function getText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildContentBreadcrumbItems({
  canonicalUrl: canonicalInput,
  currentName,
  parent,
}: ContentBreadcrumbInput): BreadcrumbItem[] {
  const canonicalUrl = buildPaginationCanonicalUrl(canonicalInput);
  const pathname = new URL(canonicalUrl, 'https://canonical.invalid').pathname;
  const t = createTranslator(getLocaleFromPathname(pathname));
  const name = getText(currentName);

  if (!name) return [];

  const items: BreadcrumbItem[] = [
    {
      name: t('breadcrumb.home'),
      url: buildLocaleSeoUrl(canonicalUrl, '/'),
    },
  ];
  const parentName = getText(parent?.name);

  if (parent && parentName) {
    items.push({
      name: parentName,
      url: buildLocaleSeoUrl(canonicalUrl, parent.path),
    });
  }

  items.push({name, url: canonicalUrl});
  return items;
}

export function buildBreadcrumbStructuredData(items: BreadcrumbItem[]) {
  if (items.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
