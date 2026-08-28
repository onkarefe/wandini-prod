import type {Storefront} from '@shopify/hydrogen';
import {normalizeCanonicalOrigin} from './canonical-origin';

const SITEMAP_PAGE_SIZE = 250;
const RESOURCE_IDENTITY_BATCH_SIZE = 50;

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

type SitemapResourceTypename =
  | 'Product'
  | 'Collection'
  | 'Page'
  | 'Blog';

type SitemapResourceIdentityNode = {
  __typename: SitemapResourceTypename;
  id: string;
  handle: string;
  updatedAt?: string | null;
};

type CursorConnection<T> = {
  nodes: T[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
};

type LocalizedSitemapResourceNodes = {
  nodes: Array<SitemapResourceIdentityNode | null>;
};

type SitemapResourceIdentityResponse = Record<
  string,
  SitemapResourceIdentityNode | null
>;

type ArticleSitemapNode = {
  id: string;
  handle: string;
  publishedAt: string;
  blog: {handle: string};
};

type ArticleConnectionPage = {
  articles: CursorConnection<ArticleSitemapNode>;
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

const SITEMAP_TYPENAME_MAP: Record<
  SitemapResourceType,
  SitemapResourceTypename
> = {
  products: 'Product',
  collections: 'Collection',
  pages: 'Page',
  blogs: 'Blog',
};

const SITEMAP_RESOURCE_FIELD_MAP: Record<SitemapResourceType, string> = {
  products: 'product',
  collections: 'collection',
  pages: 'page',
  blogs: 'blog',
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

export function pairLocalizedSitemapNodes(
  type: SitemapResourceType,
  deNodes: SitemapResourceIdentityNode[],
  enNodes: Array<SitemapResourceIdentityNode | null>,
): LocalizedSitemapEntry[] {
  const expectedTypename = SITEMAP_TYPENAME_MAP[type];
  const englishById = new Map(
    enNodes
      .filter(
        (node): node is SitemapResourceIdentityNode =>
          node?.__typename === expectedTypename,
      )
      .map((node) => [node.id, node]),
  );

  return deNodes
    .filter((node) => node.__typename === expectedTypename)
    .map((deNode) => {
      const enNode = englishById.get(deNode.id);

      return {
        dePath: buildResourcePath(type, deNode.handle),
        enPath: enNode
          ? `/en${buildResourcePath(type, enNode.handle)}`
          : null,
        updatedAt: deNode.updatedAt?.trim() || null,
      };
    });
}

function buildResourceIdentityQuery(type: SitemapResourceType, size: number) {
  const variables = Array.from(
    {length: size},
    (_, index) => `$handle${index}: String!`,
  ).join('\n    ');
  const field = SITEMAP_RESOURCE_FIELD_MAP[type];
  const selections = Array.from(
    {length: size},
    (_, index) => `resource${index}: ${field}(handle: $handle${index}) {
      __typename
      id
      handle
    }`,
  ).join('\n    ');

  return `
  query SitemapResourceIdentities(
    ${variables}
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    ${selections}
  }
`;
}

async function loadSitemapResourceIdentityNodes({
  storefront,
  type,
  items,
}: {
  storefront: Storefront;
  type: SitemapResourceType;
  items: SitemapApiItem[];
}) {
  const batches = Array.from(
    {length: Math.ceil(items.length / RESOURCE_IDENTITY_BATCH_SIZE)},
    (_, index) =>
      items.slice(
        index * RESOURCE_IDENTITY_BATCH_SIZE,
        (index + 1) * RESOURCE_IDENTITY_BATCH_SIZE,
      ),
  );
  const expectedTypename = SITEMAP_TYPENAME_MAP[type];
  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const variables = Object.fromEntries(
        batch.map((item, index) => [`handle${index}`, item.handle]),
      );
      const data = await storefront.query<SitemapResourceIdentityResponse>(
        buildResourceIdentityQuery(type, batch.length),
        {
          cache: storefront.CacheLong(),
          variables: {
            ...variables,
            country: 'DE',
            language: 'DE',
          },
        },
      );

      return batch.flatMap((item, index) => {
        const node = data[`resource${index}`];
        if (node?.__typename !== expectedTypename) return [];

        return [{...node, updatedAt: item.updatedAt}];
      });
    }),
  );

  return batchResults.flat();
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
  const sitemapData = await storefront.query<SitemapApiPage>(
    LOCALIZED_SITEMAP_QUERY,
    {
      cache: storefront.CacheLong(),
      variables: {
        type: SITEMAP_TYPE_MAP[type],
        page,
        country: 'DE',
        language: 'DE',
      },
    },
  );
  const sitemapItems = sitemapData.sitemap?.resources?.items ?? [];

  if (sitemapItems.length === 0) return [];

  const deNodes = await loadSitemapResourceIdentityNodes({
    storefront,
    type,
    items: sitemapItems,
  });

  if (deNodes.length === 0) return [];

  const englishData = await storefront.query<LocalizedSitemapResourceNodes>(
    LOCALIZED_RESOURCE_NODES_QUERY,
    {
      cache: storefront.CacheLong(),
      variables: {
        ids: deNodes.map(({id}) => id),
        country: 'DE',
        language: 'EN',
      },
    },
  );

  return pairLocalizedSitemapNodes(type, deNodes, englishData.nodes);
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

export async function countCursorConnectionPages<T>({
  loadPage,
}: {
  loadPage: (after: string | null) => Promise<CursorConnection<T>>;
}) {
  let after: string | null = null;
  let pageCount = 0;

  while (true) {
    const connection = await loadPage(after);
    if (connection.nodes.length === 0) return pageCount;

    pageCount += 1;

    if (!connection.pageInfo.hasNextPage) return pageCount;
    if (!connection.pageInfo.endCursor) {
      throw new Error('Sitemap pagination is missing an end cursor.');
    }

    after = connection.pageInfo.endCursor;
  }
}

export async function loadArticleSitemapPageCount(storefront: Storefront) {
  return countCursorConnectionPages({
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
}

export function buildArticleSitemapChildPaths(pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];

  return Array.from(
    {length: pageCount},
    (_, index) => `/sitemap/articles/${index + 1}.xml`,
  );
}

export function resolveSitemapLastmod(
  updatedAt?: string | null,
  publishedAt?: string | null,
) {
  return updatedAt?.trim() || publishedAt?.trim() || null;
}

async function loadSitemapModificationTimes(
  storefront: Storefront,
  type: string,
  handles: string[],
) {
  // This lookup enriches lastmod only. Cursor connections own child-page boundaries.
  const pendingHandles = new Set(handles);
  const updatedAtByHandle = new Map<string, string>();
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && pendingHandles.size > 0) {
    const data = await storefront.query<SitemapApiPage>(
      SITEMAP_MODIFICATION_QUERY,
      {
        cache: storefront.CacheLong(),
        variables: {
          type,
          page,
          country: 'DE',
          language: 'DE',
        },
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
    loadSitemapModificationTimes(
      storefront,
      'ARTICLE',
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

const LOCALIZED_RESOURCE_NODES_QUERY = `
  query LocalizedSitemapResourceNodes(
    $ids: [ID!]!
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      __typename
      ... on Product {
        id
        handle
      }
      ... on Collection {
        id
        handle
      }
      ... on Page {
        id
        handle
      }
      ... on Blog {
        id
        handle
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

const SITEMAP_MODIFICATION_QUERY = `
  query SitemapModificationTimes(
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
