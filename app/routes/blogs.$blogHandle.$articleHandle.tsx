import {useLoaderData} from 'react-router';
import type {Route} from './+types/blogs.$blogHandle.$articleHandle';
import {Image} from '@shopify/hydrogen';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import blogDetailStyles from '~/styles/blogDetail.css?url';
import {Link} from '~/lib/i18n-router';
import {
  buildCanonicalUrl,
  buildSeoMetadata,
  normalizeSeoText as normalizeMetaText,
  resolveSeoDescription,
} from '~/lib/seo';
import {useTranslation} from '~/i18n/useTranslation';
import {formatLocaleDate} from '~/lib/locale-format';
import {resolveResourceLanguageSwitchLinks} from '~/lib/language-switcher';

const BLOCKED_HTML_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'link',
  'meta',
  'base',
] as const;

function sanitizeInlineStyles(html: string) {
  return html.replace(
    /\sstyle\s*=\s*(["'])(.*?)\1/gi,
    (_match, quote, rawStyle) => {
      const sanitizedStyle = String(rawStyle)
        .replace(/expression\s*\([^)]*\)/gi, '')
        .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\1\s*\)/gi, '')
        .replace(/-moz-binding\s*:[^;]+;?/gi, '')
        .trim();

      return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : '';
    },
  );
}

function sanitizeBlogArticleHtml(html: string | null | undefined) {
  if (!html) {
    return '';
  }

  let sanitizedHtml = html;

  for (const tagName of BLOCKED_HTML_TAGS) {
    const blockTagPattern = new RegExp(
      `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      'gi',
    );
    const selfClosingTagPattern = new RegExp(`<${tagName}\\b[^>]*\\/?>`, 'gi');

    sanitizedHtml = sanitizedHtml
      .replace(blockTagPattern, '')
      .replace(selfClosingTagPattern, '');
  }

  sanitizedHtml = sanitizeInlineStyles(sanitizedHtml)
    .replace(/\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(
      /\s(href|src|xlink:href|formaction|poster|srcdoc)\s*=\s*(["'])\s*(javascript:|vbscript:|data:(?!image\/))[\s\S]*?\2/gi,
      (_match, attributeName, quote) => ` ${attributeName}=${quote}#${quote}`,
    );

  return sanitizedHtml;
}

export function links() {
  return [{rel: 'stylesheet', href: blogDetailStyles}];
}

type RelatedArticle = {
  id?: string | null;
  handle: string;
  title: string;
  excerpt?: string | null;
  publishedAt: string;
  image?: {
    id?: string | null;
    altText?: string | null;
    url: string;
    width?: number | null;
    height?: number | null;
  } | null;
};

type ArticleMetaInput = {
  title?: string | null;
  contentHtml?: string | null;
  publishedAt?: string | null;
  author?: {
    name?: string | null;
  } | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  image?: {
    url?: string | null;
  } | null;
};

function getArticleMetaDescription(article?: ArticleMetaInput | null) {
  return resolveSeoDescription({
    explicit: article?.seo?.description,
    fallback: article?.contentHtml,
  });
}

function getArticleMetaImage(article?: ArticleMetaInput | null) {
  return article?.image?.url ?? null;
}

function getArticleLocalePrefix(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  const [firstSegment] = url.pathname.split('/').filter(Boolean);

  return firstSegment && /^[a-z]{2}-[a-z]{2}$/i.test(firstSegment)
    ? `/${firstSegment.toLowerCase()}`
    : '';
}

function getArticleHomeUrl(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  const localePrefix = getArticleLocalePrefix(canonicalUrl);

  return `${url.origin}${localePrefix || '/'}`;
}

function getArticleBlogUrl(canonicalUrl: string, blogHandle?: string | null) {
  const handle = normalizeMetaText(blogHandle);

  if (!handle) {
    return null;
  }

  const url = new URL(canonicalUrl);
  const localePrefix = getArticleLocalePrefix(canonicalUrl);

  return `${url.origin}${localePrefix}/blogs/${handle}`;
}

function buildArticleJsonLd(article: ArticleMetaInput, canonicalUrl: string) {
  const headline = normalizeMetaText(article.title);

  if (!headline) {
    return null;
  }

  const description = getArticleMetaDescription(article);
  const image = getArticleMetaImage(article);
  const datePublished = normalizeMetaText(article.publishedAt);
  const authorName = normalizeMetaText(article.author?.name);

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    ...(description ? {description} : {}),
    ...(image ? {image} : {}),
    ...(datePublished ? {datePublished} : {}),
    ...(authorName ? {author: {'@type': 'Person', name: authorName}} : {}),
    url: canonicalUrl,
  };
}

function buildArticleBreadcrumbJsonLd({
  article,
  blogHandle,
  blogTitle,
  canonicalUrl,
}: {
  article: ArticleMetaInput;
  blogHandle?: string | null;
  blogTitle?: string | null;
  canonicalUrl: string;
}) {
  const articleName = normalizeMetaText(article.title);
  const blogUrl = getArticleBlogUrl(canonicalUrl, blogHandle);

  if (!articleName || !blogUrl) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: getArticleHomeUrl(canonicalUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: normalizeMetaText(blogTitle) || 'Blog',
        item: blogUrl,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: articleName,
        item: canonicalUrl,
      },
    ],
  };
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const article = data?.article;

  return buildSeoMetadata({
    title: {
      explicit: article?.seo?.title,
      fallback: article?.title,
    },
    description: {
      explicit: article?.seo?.description,
      fallback: article?.contentHtml,
    },
    canonicalUrl:
      data?.canonicalUrl ??
      `/blogs/${params.blogHandle ?? ''}/${params.articleHandle ?? ''}`,
    openGraphType: 'article',
    image: getArticleMetaImage(article),
  });
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, request, params}: Route.LoaderArgs) {
  const {blogHandle, articleHandle} = params;

  if (!articleHandle || !blogHandle) {
    throw new Response('Not found', {status: 404});
  }

  const [{blog}] = await Promise.all([
    context.storefront.query(ARTICLE_QUERY, {
      variables: {blogHandle, articleHandle},
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!blog?.articleByHandle) {
    throw new Response(null, {status: 404});
  }

  redirectIfHandleIsLocalized(
    request,
    {
      handle: articleHandle,
      data: blog.articleByHandle,
    },
    {
      handle: blogHandle,
      data: blog,
    },
  );

  const article = blog.articleByHandle;
  const relatedArticles =
    blog.articles?.nodes?.filter((item) => item.handle !== articleHandle) ?? [];
  const languageSwitchLinks = await resolveResourceLanguageSwitchLinks({
    storefront: context.storefront,
    request,
    resourceId: article.id,
    resourceType: 'Article',
  });

  return {
    canonicalUrl: buildCanonicalUrl(request.url),
    languageSwitchLinks,
    article: {
      ...article,
      contentHtml: sanitizeBlogArticleHtml(article.contentHtml),
    },
    relatedArticles,
    blogHandle,
    blogTitle: blog.title,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Article() {
  const {locale, t} = useTranslation();
  const {article, relatedArticles, blogHandle, blogTitle, canonicalUrl} =
    useLoaderData<typeof loader>();
  const {title, image, contentHtml, author} = article;
  const articleJsonLd = buildArticleJsonLd(article, canonicalUrl);
  const breadcrumbJsonLd = buildArticleBreadcrumbJsonLd({
    article,
    blogHandle,
    blogTitle,
    canonicalUrl,
  });

  const publishedDate = formatLocaleDate(article.publishedAt, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="blog-detail-page">
      {articleJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: stringifyJsonLd(articleJsonLd)}}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: stringifyJsonLd(breadcrumbJsonLd)}}
        />
      ) : null}
      <div className="container mx-auto">
        <div className="blog-detail-header-wrap">
          <div className="blog-detail-header">
            <p className="blog-detail-kicker">{blogTitle}</p>
            <h1 className="blog-detail-title">{title}</h1>
            <div className="blog-detail-meta">
              <time dateTime={article.publishedAt}>{publishedDate}</time>
              {author?.name ? <span>{author.name}</span> : null}
            </div>
          </div>
        </div>

        <div className="blog-detail-shell">
          <div className="blog-detail-main">
            {image ? (
              <div className="blog-detail-hero-media">
                <Image
                  data={image}
                  sizes="(min-width: 1200px) 60vw, 100vw"
                  loading="eager"
                />
              </div>
            ) : null}

            <div
              dangerouslySetInnerHTML={{__html: contentHtml}}
              className="blog-detail-body"
            />
          </div>

          <div className="blog-detail-sidebar">
            <div className="blog-detail-sidebar__inner">
              <p className="blog-detail-sidebar__eyebrow">
                {t('blog.moreInCategory')}
              </p>
              <div className="blog-detail-sidebar__list">
                {relatedArticles.map((relatedArticle) => {
                  const relatedDate = formatLocaleDate(
                    relatedArticle.publishedAt,
                    locale,
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    },
                  );

                  return (
                    <div
                      className="blog-detail-related-card"
                      key={relatedArticle.id ?? relatedArticle.handle}
                    >
                      <Link
                        className="blog-detail-related-card__link"
                        to={`/blogs/${blogHandle}/${relatedArticle.handle}`}
                      >
                        {relatedArticle.image ? (
                          <div className="blog-detail-related-card__media">
                            <Image
                              alt={
                                relatedArticle.image.altText ||
                                relatedArticle.title
                              }
                              data={relatedArticle.image}
                              sizes="120px"
                            />
                          </div>
                        ) : null}
                        <div className="blog-detail-related-card__content">
                          <p className="blog-detail-related-card__title">
                            {relatedArticle.title}
                          </p>
                          {relatedArticle.excerpt ? (
                            <p className="blog-detail-related-card__excerpt">
                              {relatedArticle.excerpt}
                            </p>
                          ) : null}
                          <span className="blog-detail-related-card__date">
                            {relatedDate}
                          </span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog#field-blog-articlebyhandle
const ARTICLE_QUERY = `#graphql
  query Article(
    $articleHandle: String!
    $blogHandle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(language: $language, country: $country) {
    blog(handle: $blogHandle) {
      title
      handle
      articleByHandle(handle: $articleHandle) {
        id
        handle
        title
        contentHtml
        publishedAt
        author: authorV2 {
          name
        }
        image {
          id
          altText
          url
          width
          height
        }
        seo {
          description
          title
        }
      }
      articles(first: 12) {
        nodes {
          id
          handle
          title
          excerpt
          publishedAt
          image {
            id
            altText
            url
            width
            height
          }
        }
      }
    }
  }
` as const;
