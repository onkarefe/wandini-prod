import {Analytics, Pagination, getPaginationVariables} from '@shopify/hydrogen';
import {useLoaderData, useNavigation} from 'react-router';
import type {PredictiveSearchQuery} from 'storefrontapi.generated';
import {useTranslation} from '~/i18n/useTranslation';
import {createTranslator} from '~/i18n';
import {getLocaleFromI18n} from '~/lib/locale';
import noSearchResultsIcon from '~/assets/Icons/nosrIcon.png';
import SearchProductCard from '~/components/SearchPageProductCard';
import {SearchForm} from '~/components/SearchForm';
import {Link} from '~/lib/i18n-router';
import {getRobotsDirective} from '~/lib/seo';
import {
  getEmptyPredictiveSearchResult,
  getEmptyRegularSearchResult,
  type PredictiveSearchReturn,
  type RegularSearchItems,
  type RegularSearchReturn,
  urlWithTrackingParams,
} from '~/lib/search';
import searchPageStyles from '~/styles/searchPage.css?url';
import type {Route} from './+types/search';

type SearchProducts = RegularSearchItems['products'];
type SearchPages = RegularSearchItems['pages'];
type SearchArticles = RegularSearchItems['articles'];
type SearchProduct = SearchProducts['nodes'][number];

const DEFAULT_PREDICTIVE_SEARCH_LIMIT = 5;
const MAX_PREDICTIVE_SEARCH_LIMIT = 10;
const SEARCH_PAGE_SIZE = 12;
const CONTENT_RESULT_LIMIT = 4;
const SEARCH_ERROR_KEY = 'search.unavailable' as const;

export function links() {
  return [{rel: 'stylesheet', href: searchPageStyles}];
}

export const meta: Route.MetaFunction = ({data}) => [
  {title: createTranslator(data?.selectedLocale)('search.metaTitle')},
  {name: 'robots', content: getRobotsDirective('noindex,follow')},
];

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const isPredictive = url.searchParams.has('predictive');
  const term = String(url.searchParams.get('q') || '').trim();
  const selectedLocale = getLocaleFromI18n(context.storefront.i18n);

  try {
    const searchData = isPredictive
      ? await predictiveSearch({request, context})
      : await regularSearch({request, context});

    return {...searchData, selectedLocale};
  } catch (error) {
    console.error(error);

    if (isPredictive) {
      return {
        type: 'predictive' as const,
        term,
        error: SEARCH_ERROR_KEY,
        result: getEmptyPredictiveSearchResult(),
        selectedLocale,
      };
    }

    return {
      type: 'regular' as const,
      term,
      error: SEARCH_ERROR_KEY,
      result: getEmptyRegularSearchResult(),
      selectedLocale,
    };
  }
}

export default function SearchPage() {
  const {t} = useTranslation();
  const {type, term, result, error} = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSearching =
    navigation.state === 'loading' &&
    navigation.location?.pathname.endsWith('/search');

  if (type === 'predictive') return null;

  const {products, pages, articles} = result.items;
  const hasResults = result.total > 0;

  return (
    <main className="search-page" aria-busy={isSearching}>
      <div className="search-page__container">
        <header className="search-page__header">
          <p className="search-page__eyebrow">Wandini</p>
          <h1>{t('search.title')}</h1>
          <p className="search-page__lead">{t('search.pageLead')}</p>
        </header>

        <SearchForm role="search" aria-label={t('search.label')}>
          {({inputRef}) => (
            <>
              <label className="search-page__label" htmlFor="search-query">
                {t('search.termLabel')}
              </label>
              <div className="search-page__field">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  autoComplete="off"
                  defaultValue={term}
                  enterKeyHint="search"
                  id="search-query"
                  name="q"
                  placeholder={t('search.pagePlaceholder')}
                  ref={inputRef}
                  type="search"
                />
                <button disabled={isSearching} type="submit">
                  {isSearching ? t('search.searching') : t('search.submit')}
                </button>
              </div>
            </>
          )}
        </SearchForm>

        {error ? (
          <p className="search-page__error" role="alert">
            {t('search.unavailable')}
          </p>
        ) : null}

        {!error && !term ? <SearchStart /> : null}
        {!error && term && !hasResults ? <SearchEmpty term={term} /> : null}

        {!error && term && hasResults ? (
          <div className="search-page__results">
            <div className="search-page__results-heading">
              <p>{t('search.resultsFor')}</p>
              <h2>{term}</h2>
            </div>

            <ProductResults products={products} term={term} />
            <ContentResults pages={pages} articles={articles} term={term} />
          </div>
        ) : null}

        <Analytics.SearchView
          data={{searchTerm: term, searchResults: result}}
        />
      </div>
    </main>
  );
}

function ProductResults({
  products,
  term,
}: {
  products: SearchProducts;
  term: string;
}) {
  const {t} = useTranslation();
  if (!products.nodes.length) return null;

  return (
    <section
      className="search-products"
      aria-labelledby="search-products-title"
    >
      <div className="search-section__header">
        <h2 id="search-products-title">{t('search.products')}</h2>
      </div>

      <Pagination connection={products}>
        {({nodes, isLoading, NextLink, PreviousLink}) => (
          <div aria-busy={isLoading}>
            <div className="search-products__grid">
              {nodes.map((product: SearchProduct, index: number) => {
                const productUrl = urlWithTrackingParams({
                  baseUrl: `/products/${product.handle}`,
                  trackingParams: product.trackingParameters,
                  term,
                });

                return (
                  <SearchProductCard
                    key={product.id}
                    product={product}
                    to={productUrl}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />
                );
              })}
            </div>

            <nav
              className="search-pagination"
              aria-label={t('search.pagination')}
            >
              <PreviousLink className="search-pagination__link">
                {isLoading ? t('common.loading') : t('common.previous')}
              </PreviousLink>
              <NextLink className="search-pagination__link">
                {isLoading ? t('common.loading') : t('common.next')}
              </NextLink>
            </nav>
          </div>
        )}
      </Pagination>
    </section>
  );
}

function ContentResults({
  pages,
  articles,
  term,
}: {
  pages: SearchPages;
  articles: SearchArticles;
  term: string;
}) {
  const {t} = useTranslation();
  if (!pages.nodes.length && !articles.nodes.length) return null;

  return (
    <div className="search-content-results">
      {pages.nodes.length ? (
        <section className="search-content-results__group">
          <h2>{t('search.pages')}</h2>
          <ul>
            {pages.nodes.map((page) => (
              <li key={page.id}>
                <Link
                  to={urlWithTrackingParams({
                    baseUrl: `/pages/${page.handle}`,
                    trackingParams: page.trackingParameters,
                    term,
                  })}
                >
                  <span>{page.title}</span>
                  <SearchArrow />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {articles.nodes.length ? (
        <section className="search-content-results__group">
          <h2>{t('search.magazine')}</h2>
          <ul>
            {articles.nodes.map((article) => {
              const blogHandle = article.blog?.handle;

              return (
                <li key={article.id}>
                  {blogHandle ? (
                    <Link
                      to={urlWithTrackingParams({
                        baseUrl: `/blogs/${blogHandle}/${article.handle}`,
                        trackingParams: article.trackingParameters,
                        term,
                      })}
                    >
                      <span>{article.title}</span>
                      <SearchArrow />
                    </Link>
                  ) : (
                    <span>{article.title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SearchStart() {
  const {t} = useTranslation();

  return (
    <section className="search-state">
      <SearchIcon />
      <h2>{t('search.startTitle')}</h2>
      <p>{t('search.startDescription')}</p>
    </section>
  );
}

function SearchEmpty({term}: {term: string}) {
  const {t} = useTranslation();

  return (
    <section className="search-state" aria-live="polite">
      <SearchIcon />
      <h2>{t('search.emptyTitle')}</h2>
      <p>{t('search.noResultsDescription', {term})}</p>
      <Link className="search-state__link" to="/">
        {t('common.home')}
      </Link>
    </section>
  );
}

function SearchIcon() {
  return (
    <img
      className="search-state__icon"
      src={noSearchResultsIcon}
      alt=""
      aria-hidden="true"
    />
  );
}

function SearchArrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

const SEARCH_PRODUCT_FRAGMENT = `#graphql
  fragment SearchProduct on Product {
    __typename
    handle
    id
    title
    trackingParameters
    selectedOrFirstAvailableVariant(
      selectedOptions: []
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      id
      image {
        url
        altText
        width
        height
      }
      price {
        amount
        currencyCode
      }
      compareAtPrice {
        amount
        currencyCode
      }
    }
  }
` as const;

const SEARCH_PAGE_FRAGMENT = `#graphql
  fragment SearchPage on Page {
    __typename
    handle
    id
    title
    trackingParameters
  }
` as const;

const SEARCH_ARTICLE_FRAGMENT = `#graphql
  fragment SearchArticle on Article {
    __typename
    handle
    id
    title
    blog {
      handle
    }
    trackingParameters
  }
` as const;

const PAGE_INFO_FRAGMENT = `#graphql
  fragment PageInfoFragment on PageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
` as const;

export const SEARCH_QUERY = `#graphql
  query RegularSearch(
    $contentFirst: Int!
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $term: String!
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    articles: search(query: $term, types: [ARTICLE], first: $contentFirst) {
      nodes {
        ... on Article {
          ...SearchArticle
        }
      }
    }
    pages: search(query: $term, types: [PAGE], first: $contentFirst) {
      nodes {
        ... on Page {
          ...SearchPage
        }
      }
    }
    products: search(
      after: $endCursor
      before: $startCursor
      first: $first
      last: $last
      query: $term
      sortKey: RELEVANCE
      types: [PRODUCT]
      unavailableProducts: HIDE
    ) {
      nodes {
        ... on Product {
          ...SearchProduct
        }
      }
      pageInfo {
        ...PageInfoFragment
      }
    }
  }
  ${SEARCH_PRODUCT_FRAGMENT}
  ${SEARCH_PAGE_FRAGMENT}
  ${SEARCH_ARTICLE_FRAGMENT}
  ${PAGE_INFO_FRAGMENT}
` as const;

async function regularSearch({
  request,
  context,
}: Pick<
  Route.LoaderArgs,
  'request' | 'context'
>): Promise<RegularSearchReturn> {
  const {storefront} = context;
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();

  if (!term) {
    return {
      type: 'regular',
      term,
      result: getEmptyRegularSearchResult(),
    };
  }

  const pagination = getPaginationVariables(request, {
    pageBy: SEARCH_PAGE_SIZE,
  });
  const queryResult = await storefront.query(SEARCH_QUERY, {
    cache: storefront.CacheShort(),
    variables: {
      ...pagination,
      contentFirst: CONTENT_RESULT_LIMIT,
      term,
    },
  });
  const {errors, ...items} = queryResult as {
    errors?: Array<{message: string}>;
  } & RegularSearchItems;

  const total = Object.values(items).reduce(
    (count, connection) => count + connection.nodes.length,
    0,
  );

  return {
    type: 'regular',
    term,
    error: errors?.length ? SEARCH_ERROR_KEY : undefined,
    result: {total, items},
  };
}

const PREDICTIVE_SEARCH_QUERY = `#graphql
  query PredictiveSearch(
    $country: CountryCode
    $language: LanguageCode
    $limit: Int!
    $limitScope: PredictiveSearchLimitScope!
    $term: String!
  ) @inContext(country: $country, language: $language) {
    predictiveSearch(
      limit: $limit
      limitScope: $limitScope
      query: $term
      types: [PRODUCT, COLLECTION, PAGE, ARTICLE, QUERY]
    ) {
      articles {
        __typename
        id
        title
        handle
        blog {
          handle
        }
        image {
          url
          altText
          width
          height
        }
        trackingParameters
      }
      collections {
        __typename
        id
        title
        handle
        image {
          url
          altText
          width
          height
        }
        trackingParameters
      }
      pages {
        __typename
        id
        title
        handle
        trackingParameters
      }
      products {
        __typename
        id
        title
        handle
        trackingParameters
        selectedOrFirstAvailableVariant(
          selectedOptions: []
          ignoreUnknownOptions: true
          caseInsensitiveMatch: true
        ) {
          id
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
        }
      }
      queries {
        __typename
        text
        styledText
        trackingParameters
      }
    }
  }
` as const;

async function predictiveSearch({
  request,
  context,
}: Pick<
  Route.ActionArgs,
  'request' | 'context'
>): Promise<PredictiveSearchReturn> {
  const {storefront} = context;
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();
  const limit = getPredictiveSearchLimit(url.searchParams.get('limit'));

  if (!term) {
    return {
      type: 'predictive',
      term,
      result: getEmptyPredictiveSearchResult(),
    };
  }

  const {
    predictiveSearch: items,
    errors,
  }: PredictiveSearchQuery & {
    errors?: Array<{message: string}>;
  } = await storefront.query(PREDICTIVE_SEARCH_QUERY, {
    cache: storefront.CacheShort(),
    variables: {
      limit,
      limitScope: 'ALL',
      term,
    },
  });

  if (errors?.length || !items) {
    throw new Error('Predictive search request failed');
  }

  const total = Object.values(items).reduce(
    (count: number, item: Array<unknown>) => count + item.length,
    0,
  );

  return {type: 'predictive', term, result: {items, total}};
}

function getPredictiveSearchLimit(rawLimit: string | null) {
  const parsedLimit = Number(rawLimit);

  if (!Number.isFinite(parsedLimit)) return DEFAULT_PREDICTIVE_SEARCH_LIMIT;

  return Math.min(
    MAX_PREDICTIVE_SEARCH_LIMIT,
    Math.max(1, Math.floor(parsedLimit)),
  );
}
