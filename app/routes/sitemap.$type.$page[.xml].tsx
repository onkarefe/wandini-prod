import type {Route} from './+types/sitemap.$type.$page[.xml]';
import {getSitemap} from '@shopify/hydrogen';

const ARTICLE_SITEMAP_BLOG_LIMIT = 50;
const ARTICLE_SITEMAP_ARTICLE_LIMIT = 100;

export async function loader({
  request,
  params,
  context: {storefront},
}: Route.LoaderArgs) {
  if (params.type === 'metaObjects') {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': `max-age=${60 * 60 * 24}`,
      },
    });
  }

  if (params.type === 'articles') {
    const page = Number.parseInt(params.page ?? '', 10);

    if (page !== 1) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `max-age=${60 * 60 * 24}`,
        },
      });
    }

    const data = await storefront.query(ARTICLE_SITEMAP_QUERY, {
      variables: {
        blogsFirst: ARTICLE_SITEMAP_BLOG_LIMIT,
        articlesFirst: ARTICLE_SITEMAP_ARTICLE_LIMIT,
      },
    });
    const baseUrl = new URL(request.url).origin;
    const body = buildArticleSitemapXml({
      baseUrl,
      blogs: data.blogs?.nodes ?? [],
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': `max-age=${60 * 60 * 24}`,
      },
    });
  }

  const response = await getSitemap({
    storefront,
    request,
    params,
    locales: ['DE-DE'],
    getLink: ({type, baseUrl, handle, locale}) => {
      if (!locale) return `${baseUrl}/${type}/${handle}`;
      return `${baseUrl}/${locale.toLowerCase()}/${type}/${handle}`;
    },
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}

type ArticleSitemapBlog = {
  handle?: string | null;
  articles?: {
    nodes?: Array<{
      handle?: string | null;
      publishedAt?: string | null;
    } | null> | null;
  } | null;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildArticleUrl(baseUrl: string, blogHandle: string, articleHandle: string) {
  return `${baseUrl}/blogs/${blogHandle}/${articleHandle}`;
}

function buildLocalizedArticleUrl(
  baseUrl: string,
  blogHandle: string,
  articleHandle: string,
) {
  return `${baseUrl}/de-de/blogs/${blogHandle}/${articleHandle}`;
}

function buildArticleSitemapXml({
  baseUrl,
  blogs,
}: {
  baseUrl: string;
  blogs: ArticleSitemapBlog[];
}) {
  const urls = blogs.flatMap((blog) => {
    const blogHandle = blog.handle?.trim();

    if (!blogHandle) {
      return [];
    }

    return (blog.articles?.nodes ?? [])
      .map((article) => {
        const articleHandle = article?.handle?.trim();

        if (!articleHandle) {
          return null;
        }

        const url = buildArticleUrl(baseUrl, blogHandle, articleHandle);
        const localizedUrl = buildLocalizedArticleUrl(
          baseUrl,
          blogHandle,
          articleHandle,
        );
        const lastmod = article?.publishedAt?.trim();

        return `<url>
  <loc>${escapeXml(url)}</loc>${lastmod ? `
  <lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
  <changefreq>weekly</changefreq>
  <xhtml:link rel="alternate" hreflang="DE-DE" href="${escapeXml(localizedUrl)}" />
</url>`;
      })
      .filter((url): url is string => Boolean(url));
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.length ? `
${urls.join('\n')}` : ''}
</urlset>`;
}

const ARTICLE_SITEMAP_QUERY = `#graphql
  query ArticleSitemap(
    $country: CountryCode
    $language: LanguageCode
    $blogsFirst: Int!
    $articlesFirst: Int!
  ) @inContext(country: $country, language: $language) {
    blogs(first: $blogsFirst) {
      nodes {
        handle
        articles(first: $articlesFirst) {
          nodes {
            handle
            publishedAt
          }
        }
      }
    }
  }
` as const;
