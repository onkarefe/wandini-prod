import type {Storefront} from '@shopify/hydrogen';
import {normalizeCanonicalOrigin} from './canonical-origin';

const SITEMAP_PAGE_SIZE = 250;

export type SitemapResourceType =
  | 'products'
  | 'collections'
  | 'pages'
  | 'blogs';

export type LocalizedSitemapEntry = {
  dePath: string;
  enPath?: string | null;
  updatedAt?: string | null;
};

type SitemapApiItem = {
  handle: string;
  updatedAt: string;
};

type SitemapApiPage = {
  sitemap?: {
    resources?: {
      hasNextPage: boolean;
      items: SitemapApiItem[];
    } | null;
  } | null;
};

type ArticleSitemapNode = {
  id: string;
  handle: string;
  publishedAt: string;
  blog: {handle: string};
};

type ArticleConnectionPage = {
  articles: {
    nodes: ArticleSitemapNode[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
};

type LocalizedArticleNodes = {
  nodes: Array<
    | {
        __typename: 'Article';
        id: string;
        handle: string;
        blog: {handle: string};
      }
    | null
  >;
};

const SITEMAP_TYPE_MAP: Record<SitemapResourceType, string> = {
  products: 'PRODUCT',
  collections: 'COLLECTION',
  pages: 'PAGE',
  blogs: 'BLOG',
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanSitemapPath(path: string) {
  return new URL(path, 'https://sitemap.invalid').pathname;
}

function buildResourcePath(type: SitemapResourceType, handle: string) {
  return `/${type}/${encodeURIComponent(handle)}`;
}

function renderAlternateLinks(
  origin: string,
  dePath: string,
  enPath?: string | null,
) {
  if (!enPath) return '';

  const deUrl = `${origin}${cleanSitemapPath(dePath)}`;
  const enUrl = `${origin}${cleanSitemapPath(enPath)}`;

  return `
  <xhtml:link rel="alternate" hreflang="de-DE" href="${escapeXml(deUrl)}" />
  <xhtml:link rel="alternate" hreflang="en-DE" href="${escapeXml(enUrl)}" />
  <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(deUrl)}" />`;
}

function renderUrl(
  origin: string,
  path: string,
  entry: LocalizedSitemapEntry,
) {
  const url = `${origin}${cleanSitemapPath(path)}`;
  const lastmod = entry.updatedAt?.trim();

  return `<url>
  <loc>${escapeXml(url)}</loc>${lastmod ? `
  <lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
  <changefreq>weekly</changefreq>${renderAlternateLinks(
    origin,
    entry.dePath,
    entry.enPath,
  )}
</url>`;
}

export function buildLocalizedSitemapXml({
  canonicalOrigin,
  entries,
}: {
  canonicalOrigin: string;
  entries: LocalizedSitemapEntry[];
}) {
  const origin = normalizeCanonicalOrigin(canonicalOrigin);
  if (!origin) throw new Error('A valid canonical HTTPS origin is required.');

  const urls = entries.flatMap((entry) => [
    renderUrl(origin, entry.dePath, entry),
    ...(entry.enPath ? [renderUrl(origin, entry.enPath, entry)] : []),
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.length ? `
${urls.join('\n')}` : ''}
</urlset>`;
}

export function pairLocalizedSitemapItems(
  type: SitemapResourceType,
  deItems: SitemapApiItem[],
  enItems: SitemapApiItem[],
): LocalizedSitemapEntry[] {
  return deItems.map((deItem, index) => {
    const enItem = enItems[index];

    return {
      dePath: buildResourcePath(type, deItem.handle),
      enPath: enItem
        ? `/en${buildResourcePath(type, enItem.handle)}`
        : null,
      updatedAt: deItem.updatedAt || enItem?.updatedAt || null,
    };
  });
}

export async function loadLocalizedResourceSitemapEntries({
  storefront,
  type,
  page,
}: {
  storefront: Storefront;
  type: SitemapResourceType;
  page: number;
}) {
  const loadLocale = (language: 'DE' | 'EN') =>
    storefront.query<SitemapApiPage>(LOCALIZED_SITEMAP_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        type: SITEMAP_TYPE_MAP[type],
        page,
        country: 'DE',
        language,
      },
    });
  const [deData, enData] = await Promise.all([
    loadLocale('DE'),
    loadLocale('EN'),
  ]);

  return pairLocalizedSitemapItems(
    type,
    deData.sitemap?.resources?.items ?? [],
    enData.sitemap?.resources?.items ?? [],
  );
}

export async function loadCursorConnectionPage<T>({
  page,
  loadPage,
}: {
  page: number;
  loadPage: (after: string | null) => Promise<{
    nodes: T[];
    pageInfo: {hasNextPage: boolean; endCursor?: string | null};
  }>;
}) {
  if (!Number.isInteger(page) || page < 1) return [];

  let after: string | null = null;

  for (let currentPage = 1; currentPage <= page; currentPage += 1) {
    const connection = await loadPage(after);
    if (currentPage === page) return connection.nodes;
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      return [];
    }
    after = connection.pageInfo.endCursor;
  }

  return [];
}

export function resolveSitemapLastmod(
  updatedAt?: string | null,
  publishedAt?: string | null,
) {
  return updatedAt?.trim() || publishedAt?.trim() || null;
}

async function loadArticleModificationTimes(
  storefront: Storefront,
  handles: string[],
) {
  const pendingHandles = new Set(handles);
  const updatedAtByHandle = new Map<string, string>();
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && pendingHandles.size > 0) {
    const data = await storefront.query<SitemapApiPage>(
      ARTICLE_MODIFICATION_SITEMAP_QUERY,
      {
        cache: storefront.CacheLong(),
        variables: {page},
      },
    );
    const resources = data.sitemap?.resources;

    for (const item of resources?.items ?? []) {
      if (pendingHandles.has(item.handle)) {
        updatedAtByHandle.set(item.handle, item.updatedAt);
        pendingHandles.delete(item.handle);
      }
    }

    hasNextPage = Boolean(resources?.hasNextPage);
    page += 1;
  }

  return updatedAtByHandle;
}

export async function loadArticleSitemapEntries({
  storefront,
  page,
}: {
  storefront: Storefront;
  page: number;
}) {
  const germanArticles = await loadCursorConnectionPage({
    page,
    loadPage: async (after) => {
      const data = await storefront.query<ArticleConnectionPage>(
        ARTICLE_CONNECTION_QUERY,
        {
          cache: storefront.CacheLong(),
          variables: {
            first: SITEMAP_PAGE_SIZE,
            after,
            country: 'DE',
            language: 'DE',
          },
        },
      );
      return data.articles;
    },
  });

  if (germanArticles.length === 0) return [];

  const [englishData, updatedAtByHandle] = await Promise.all([
    storefront.query<LocalizedArticleNodes>(ARTICLE_LOCALIZED_NODES_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        ids: germanArticles.map(({id}) => id),
        country: 'DE',
        language: 'EN',
      },
    }),
    loadArticleModificationTimes(
      storefront,
      germanArticles.map(({handle}) => handle),
    ),
  ]);
  const englishById = new Map(
    englishData.nodes
      .filter(
        (node): node is NonNullable<(typeof englishData.nodes)[number]> =>
          node?.__typename === 'Article',
      )
      .map((node) => [node.id, node]),
  );

  return germanArticles.map((article) => {
    const englishArticle = englishById.get(article.id);

    return {
      dePath: `/blogs/${encodeURIComponent(
        article.blog.handle,
      )}/${encodeURIComponent(article.handle)}`,
      enPath: englishArticle
        ? `/en/blogs/${encodeURIComponent(
            englishArticle.blog.handle,
          )}/${encodeURIComponent(englishArticle.handle)}`
        : null,
      updatedAt: resolveSitemapLastmod(
        updatedAtByHandle.get(article.handle),
        article.publishedAt,
      ),
    };
  });
}

const LOCALIZED_SITEMAP_QUERY = `
  query LocalizedSitemapResources(
    $type: SitemapType!
    $page: Int!
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    sitemap(type: $type) {
      resources(page: $page) {
        hasNextPage
        items {
          handle
          updatedAt
        }
      }
    }
  }
`;

const ARTICLE_CONNECTION_QUERY = `
  query ArticleSitemapConnection(
    $first: Int!
    $after: String
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    articles(first: $first, after: $after, sortKey: ID) {
      nodes {
        id
        handle
        publishedAt
        blog {
          handle
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const ARTICLE_LOCALIZED_NODES_QUERY = `
  query LocalizedArticleSitemapNodes(
    $ids: [ID!]!
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      __typename
      ... on Article {
        id
        handle
        blog {
          handle
        }
      }
    }
  }
`;

const ARTICLE_MODIFICATION_SITEMAP_QUERY = `
  query ArticleModificationSitemap($page: Int!) {
    sitemap(type: ARTICLE) {
      resources(page: $page) {
        hasNextPage
        items {
          handle
          updatedAt
        }
      }
    }
  }
`;
