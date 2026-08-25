import {useLoaderData} from 'react-router';
import type {Route} from './+types/blogs.$blogHandle._index';
import {Image, getPaginationVariables} from '@shopify/hydrogen';
import type {ArticleItemFragment} from 'storefrontapi.generated';
import {useTranslation} from '~/i18n/useTranslation';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import blogHandleStyles from '~/styles/blogHandle.css?url';
import {Link} from '~/lib/i18n-router';
import {getRobotsDirective} from '~/lib/seo';
import {formatLocaleDate} from '~/lib/locale-format';

export function links() {
  return [{rel: 'stylesheet', href: blogHandleStyles}];
}

type BlogArticle = ArticleItemFragment & {
  excerpt?: string | null;
};

const BLOG_META_BRAND = 'Wandini';

type BlogMetaInput = {
  title?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
};

function normalizeMetaText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getBlogMetaTitle(blog?: BlogMetaInput | null) {
  const seoTitle = normalizeMetaText(blog?.seo?.title);

  if (seoTitle) {
    return seoTitle;
  }

  const blogTitle = normalizeMetaText(blog?.title);

  if (!blogTitle) {
    return BLOG_META_BRAND;
  }

  return blogTitle.toLowerCase().includes(BLOG_META_BRAND.toLowerCase())
    ? blogTitle
    : `${blogTitle} | ${BLOG_META_BRAND}`;
}

function getBlogMetaDescription(blog?: BlogMetaInput | null) {
  const description = normalizeMetaText(blog?.seo?.description);

  return description || null;
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const blog = data?.blog;
  const title = getBlogMetaTitle(blog);
  const description = getBlogMetaDescription(blog);
  const canonicalUrl =
    data?.canonicalUrl ?? `/blogs/${params.blogHandle ?? ''}`;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {name: 'robots', content: getRobotsDirective()},
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    ...(description ? [{property: 'og:description', content: description}] : []),
    {property: 'og:url', content: canonicalUrl},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    ...(description ? [{name: 'twitter:description', content: description}] : []),
  ];
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
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 4,
  });

  if (!params.blogHandle) {
    throw new Response(`blog not found`, {status: 404});
  }

  const [{blog}] = await Promise.all([
    context.storefront.query(BLOGS_QUERY, {
      variables: {
        blogHandle: params.blogHandle,
        ...paginationVariables,
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!blog?.articles) {
    throw new Response('Not found', {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle: params.blogHandle, data: blog});
  const url = new URL(request.url);

  return {blog, canonicalUrl: `${url.origin}${url.pathname}`};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Blog() {
  const {t} = useTranslation();
  const {blog} = useLoaderData<typeof loader>();
  const {articles} = blog;

  return (
    <div className="blog-handle-page">
      <div className="blog-handle-hero">
        <div className="container mx-auto">
          <p className="blog-handle-hero__eyebrow">
            {t('blog.categoryArchive')}
          </p>
          <h1 className="blog-handle-hero__title">{blog.title}</h1>
          {blog.seo?.description ? (
            <p className="blog-handle-hero__intro">{blog.seo.description}</p>
          ) : null}
        </div>
      </div>

      <div
        className="blog-handle-feed"
        aria-label={t('blog.articlesLabel', {title: blog.title})}
      >
        <div className="container mx-auto">
          <div className="blog-handle-feed__header">
            <p className="blog-handle-feed__eyebrow">
              {t('blog.allArticles')}
            </p>
          </div>
          <PaginatedResourceSection<ArticleItemFragment>
            connection={articles}
            resourcesClassName="blog-handle-feed__list"
          >
            {({node: article, index}) => (
              <ArticleItem
                article={article as BlogArticle}
                key={article.id}
                loading={index < 4 ? 'eager' : 'lazy'}
              />
            )}
          </PaginatedResourceSection>
        </div>
      </div>
    </div>
  );
}

function ArticleItem({
  article,
  loading,
}: {
  article: BlogArticle;
  loading?: HTMLImageElement['loading'];
}) {
  const {locale, t} = useTranslation();
  const publishedAt = formatLocaleDate(article.publishedAt!, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="blog-article" key={article.id}>
      <Link
        className="blog-article__link"
        to={`/blogs/${article.blog.handle}/${article.handle}`}
      >
        {article.image && (
          <div className="blog-article-image">
            <Image
              alt={article.image.altText || article.title}
              aspectRatio="3/2"
              data={article.image}
              loading={loading}
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        )}
        <div className="blog-article__content">
          <p className="blog-article__eyebrow">{t('blog.article')}</p>
          <h2 className="blog-article__title">{article.title}</h2>
          {article.excerpt ? (
            <p className="blog-article__excerpt">{article.excerpt}</p>
          ) : null}
          <div className="blog-article__footer">
            <small className="blog-article__date">{publishedAt}</small>
            <span className="blog-article__cta">{t('blog.readArticle')}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blog(
    $blogHandle: String!
    $country: CountryCode
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    blog(handle: $blogHandle) {
      title
      handle
      seo {
        title
        description
      }
      articles(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor
      ) {
        nodes {
          ...ArticleItem
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          hasNextPage
          endCursor
          startCursor
        }

      }
    }
  }
  fragment ArticleItem on Article {
    author: authorV2 {
      name
    }
    contentHtml
    excerpt
    handle
    id
    image {
      id
      altText
      url
      width
      height
    }
    publishedAt
    title
    blog {
      handle
    }
  }
` as const;
