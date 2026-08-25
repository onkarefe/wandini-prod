import type {Storefront} from '@shopify/hydrogen';
import {
  ENGLISH_LOCALE,
  GERMAN_LOCALE,
  getLocaleFromRequest,
  prefixPathWithLocale,
} from '~/lib/locale';

export type LanguageSwitchLinks = {
  DE: string;
  EN: string;
};

export type LocalizedResourceType =
  | 'Product'
  | 'Collection'
  | 'Page'
  | 'Blog'
  | 'Article';

type LocalizedResourceNode =
  | {__typename: 'Product'; handle: string}
  | {__typename: 'Collection'; handle: string}
  | {__typename: 'Page'; handle: string}
  | {__typename: 'Blog'; handle: string}
  | {
      __typename: 'Article';
      handle: string;
      blog: {handle: string};
    };

type LanguageSwitchResourceQuery = {
  node: LocalizedResourceNode | null;
};

const LANGUAGE_SWITCH_RESOURCE_QUERY = `#graphql
  query LanguageSwitchResource(
    $id: ID!
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    node(id: $id) {
      __typename
      ... on Product {
        handle
      }
      ... on Collection {
        handle
      }
      ... on Page {
        handle
      }
      ... on Blog {
        handle
      }
      ... on Article {
        handle
        blog {
          handle
        }
      }
    }
  }
` as const;

export function getFixedLanguageSwitchLinks(path: string): LanguageSwitchLinks {
  return {
    DE: prefixPathWithLocale(path, GERMAN_LOCALE),
    EN: prefixPathWithLocale(path, ENGLISH_LOCALE),
  };
}

export function isLanguageSwitchLinks(
  value: unknown,
): value is LanguageSwitchLinks {
  if (!value || typeof value !== 'object') return false;

  const links = value as Partial<LanguageSwitchLinks>;
  return typeof links.DE === 'string' && typeof links.EN === 'string';
}

function getLocalizedResourcePath(node: LocalizedResourceNode) {
  switch (node.__typename) {
    case 'Product':
      return `/products/${node.handle}`;
    case 'Collection':
      return `/collections/${node.handle}`;
    case 'Page':
      return `/pages/${node.handle}`;
    case 'Blog':
      return `/blogs/${node.handle}`;
    case 'Article':
      return `/blogs/${node.blog.handle}/${node.handle}`;
  }
}

export async function resolveResourceLanguageSwitchLinks({
  storefront,
  request,
  resourceId,
  resourceType,
}: {
  storefront: Storefront;
  request: Request;
  resourceId: string;
  resourceType: LocalizedResourceType;
}): Promise<LanguageSwitchLinks> {
  const currentLocale = getLocaleFromRequest(request);
  const targetLocale =
    currentLocale.language === 'DE' ? ENGLISH_LOCALE : GERMAN_LOCALE;
  const requestUrl = new URL(request.url);
  const currentPath = `${requestUrl.pathname}${requestUrl.search}`;
  const fallbackTarget = prefixPathWithLocale('/', targetLocale);
  const links: LanguageSwitchLinks = {
    DE: currentLocale.language === 'DE' ? currentPath : fallbackTarget,
    EN: currentLocale.language === 'EN' ? currentPath : fallbackTarget,
  };

  try {
    const {node} = await storefront.query<LanguageSwitchResourceQuery>(
      LANGUAGE_SWITCH_RESOURCE_QUERY,
      {
        cache: storefront.CacheLong(),
        variables: {
          id: resourceId,
          country: targetLocale.country,
          language: targetLocale.language,
        },
      },
    );

    if (node?.__typename !== resourceType) {
      return links;
    }

    const localizedPath = getLocalizedResourcePath(node);
    const targetPath = prefixPathWithLocale(
      `${localizedPath}${requestUrl.search}`,
      targetLocale,
    );
    links[targetLocale.language] = targetPath;
    return links;
  } catch {
    return links;
  }
}
