import {useLoaderData} from 'react-router';
import type { Route } from './+types/blogs._index';
import { Image, getPaginationVariables } from '@shopify/hydrogen';
import { PaginatedResourceSection } from '~/components/PaginatedResourceSection';
import type { BlogsQuery } from 'storefrontapi.generated';
import {useTranslation} from '~/i18n/useTranslation';
import blogMainStyles from '~/styles/blogMain.css?url';
import {Link} from '~/lib/i18n-router';
import {
  buildFixedSeoAlternateUrls,
  buildSeoMetadata,
  resolvePaginationSeoPolicy,
} from '~/lib/seo';

type BlogNode = BlogsQuery['blogs']['nodes'][0] & {
  blogCategoryDescription?: {
    value?: string | null;
  } | null;
  blogCategoryImage?: {
    reference?: {
      image?: {
        url: string;
        altText?: string | null;
        width?: number | null;
        height?: number | null;
      } | null;
    } | null;
  } | null;
};

type BlogListingField = {
  key: string;
  value?: string | null;
};

type BlogListingMetaobject = {
  fields?: BlogListingField[] | null;
};

function getBlogListingFields(
  blogListingContent?: BlogsQuery['blogListingContent'] | null,
) {
  return (blogListingContent?.nodes?.[0] as BlogListingMetaobject | undefined)
    ?.fields;
}

function getBlogListingFieldValue(
  fields: BlogListingField[] | null | undefined,
  ...keys: string[]
) {
  return fields?.find((field) => keys.includes(field.key))?.value ?? '';
}

export function links() {
  return [{ rel: 'stylesheet', href: blogMainStyles }];
}

export const meta: Route.MetaFunction = ({data}) => {
  const fields = getBlogListingFields(data?.blogListingContent);

  return buildSeoMetadata({
    title: {
      fallback: getBlogListingFieldValue(fields, 'title', 'main_title'),
      systemFallback: 'Blogs',
    },
    description: {
      fallback: getBlogListingFieldValue(fields, 'subtitle', 'sub_title'),
    },
    canonicalUrl: data?.canonicalUrl ?? '/blogs',
    preservePagination: true,
    robots: data?.listingRobots ?? 'index,follow',
    alternates: buildFixedSeoAlternateUrls(
      data?.canonicalUrl ?? '/blogs',
      '/blogs',
    ),
  });
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return { ...deferredData, ...criticalData };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({ context, request }: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 10,
  });

  const [{ blogs, blogListingContent }] = await Promise.all([
    context.storefront.query(BLOGS_QUERY, {
      variables: {
        ...paginationVariables,
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);
  const paginationSeo = resolvePaginationSeoPolicy(request.url);

  return {
    blogs,
    blogListingContent,
    canonicalUrl: paginationSeo.canonicalUrl,
    listingRobots: paginationSeo.robots,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({ context }: Route.LoaderArgs) {
  return {};
}

export default function Blogs() {
  const {t} = useTranslation();
  const { blogs, blogListingContent } = useLoaderData<typeof loader>();
  const heroFields = getBlogListingFields(blogListingContent);

  const getFieldValue = (...keys: string[]) =>
    getBlogListingFieldValue(heroFields, ...keys);

  const kicker = getFieldValue('label');
  const title = getFieldValue('title', 'main_title');
  const intro = getFieldValue('subtitle', 'sub_title');

  return (
    <main className="blogs-page">
      <section className="blogs-hero">
        <div className="container mx-auto">
          {kicker ? <p className="blogs-kicker">{kicker}</p> : null}
          {title ? <h1 className="blogs-title">{title}</h1> : null}
          {intro ? <p className="blogs-intro">{intro}</p> : null}
        </div>
      </section>

      <section className="blogs-grid-section" aria-label={t('blog.list')}>
        <div className="container mx-auto">
          <PaginatedResourceSection<BlogNode> connection={blogs}>
            {({ node: blog, index }) => (
              <Link
                className={`blog-card ${index === 0 ? 'blog-card--featured' : ''}`}
                key={blog.handle}
                prefetch="intent"
                to={`/blogs/${blog.handle}`}
              >
                {blog.blogCategoryImage?.reference?.image ? (
                  <div className="blog-card__media">
                    <Image
                      data={blog.blogCategoryImage.reference.image}
                      alt={
                        blog.blogCategoryImage.reference.image.altText ||
                        blog.title
                      }
                      className="blog-card__image"
                      sizes={index === 0 ? '100vw' : '(min-width: 960px) 50vw, 100vw'}
                    />
                  </div>
                ) : null}
                <div className="blog-card__content">
                  <p className="blog-card__eyebrow">{t('blog.blog')}</p>
                  <h2 className="blog-card__title">{blog.title}</h2>
                  <p className="blog-card__excerpt">
                    {blog.blogCategoryDescription?.value || blog.seo?.description || ''}
                  </p>
                  <div className="blog-card__footer">
                    <span className="blog-card__link">
                      {t('blog.exploreArticles')}
                    </span>
                  </div>
                </div>
              </Link>
            )}
          </PaginatedResourceSection>
        </div>
      </section>
    </main>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blogs(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    blogs(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      nodes {
        title
        handle
        seo {
          title
          description
        }
        blogCategoryDescription: metafield(namespace: "custom", key: "blog_category_description") {
          value
        }
        blogCategoryImage: metafield(namespace: "custom", key: "blog_category_image") {
          reference {
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
          }
        }
      }
    }
    blogListingContent: metaobjects(first: 1, type: "blog_listing_data") {
      nodes {
        ... on Metaobject {
          fields {
            key
            value
          }
        }
      }
    }
  }
` as const;
