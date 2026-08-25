import {Link} from '~/lib/i18n-router';
import {Image, Money, Pagination} from '@shopify/hydrogen';
import {urlWithTrackingParams, type RegularSearchReturn} from '~/lib/search';
import nosrIcon from '~/assets/Icons/nosrIcon.png';
import {useTranslation} from '~/i18n/useTranslation';

type SearchItems = RegularSearchReturn['result']['items'];
type PartialSearchResult<ItemType extends keyof SearchItems> = Pick<
  SearchItems,
  ItemType
> &
  Pick<RegularSearchReturn, 'term'>;

type SearchResultsProps = RegularSearchReturn & {
  children: (args: SearchItems & {term: string}) => React.ReactNode;
};

export function SearchResults({
  term,
  result,
  children,
}: Omit<SearchResultsProps, 'error' | 'type'>) {
  if (!result?.total) {
    return null;
  }

  return children({...result.items, term});
}

SearchResults.Articles = SearchResultsArticles;
SearchResults.Pages = SearchResultsPages;
SearchResults.Products = SearchResultsProducts;
SearchResults.Empty = SearchResultsEmpty;

function SearchResultsArticles({
  term,
  articles,
}: PartialSearchResult<'articles'>) {
  const {t} = useTranslation();
  if (!articles?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <h2>{t('search.magazine')}</h2>
      <div>
        {articles.nodes.map((article) => {
          const blogHandle = article.blog?.handle;

          if (!blogHandle) {
            return (
              <div className="search-results-item" key={article.id}>
                <span>{article.title}</span>
              </div>
            );
          }

          const articleUrl = urlWithTrackingParams({
            baseUrl: `/blogs/${blogHandle}/${article.handle}`,
            trackingParams: article.trackingParameters,
            term,
          });

          return (
            <div className="search-results-item" key={article.id}>
              <Link prefetch="intent" to={articleUrl}>
                {article.title}
              </Link>
            </div>
          );
        })}
      </div>
      <br />
    </div>
  );
}

function SearchResultsPages({term, pages}: PartialSearchResult<'pages'>) {
  const {t} = useTranslation();
  if (!pages?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <h2>{t('search.pages')}</h2>
      <div>
        {pages.nodes.map((page) => {
          const pageUrl = urlWithTrackingParams({
            baseUrl: `/pages/${page.handle}`,
            trackingParams: page.trackingParameters,
            term,
          });

          return (
            <div className="search-results-item" key={page.id}>
              <Link prefetch="intent" to={pageUrl}>
                {page.title}
              </Link>
            </div>
          );
        })}
      </div>
      <br />
    </div>
  );
}

function SearchResultsProducts({
  term,
  products,
}: PartialSearchResult<'products'>) {
  const {t} = useTranslation();
  if (!products?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <h2>{t('search.products')}</h2>
      <Pagination connection={products}>
        {({nodes, isLoading, NextLink, PreviousLink}) => {
          const itemsMarkup = nodes.map((product) => {
            const productUrl = urlWithTrackingParams({
              baseUrl: `/products/${product.handle}`,
              trackingParams: product.trackingParameters,
              term,
            });

            const price = product.selectedOrFirstAvailableVariant?.price;
            const image = product.selectedOrFirstAvailableVariant?.image;

            return (
              <div className="search-results-item" key={product.id}>
                <Link prefetch="intent" to={productUrl}>
                  {image ? (
                    <Image data={image} alt={product.title} width={50} />
                  ) : null}
                  <div>
                    <p>{product.title}</p>
                    <small>{price ? <Money data={price} /> : null}</small>
                  </div>
                </Link>
              </div>
            );
          });

          return (
            <div>
              <div>
                <PreviousLink>
                  {isLoading ? (
                    t('common.loading')
                  ) : (
                    <span>{t('common.previous')}</span>
                  )}
                </PreviousLink>
              </div>
              <div>
                {itemsMarkup}
                <br />
              </div>
              <div>
                <NextLink>
                  {isLoading ? (
                    t('common.loading')
                  ) : (
                    <span>{t('common.next')}</span>
                  )}
                </NextLink>
              </div>
            </div>
          );
        }}
      </Pagination>
      <br />
    </div>
  );
}

function SearchResultsEmpty() {
  const {t} = useTranslation();

  return (
    <div className="noSR-mainbox">
      <img src={nosrIcon} alt="" aria-hidden="true" className="noSR-icon" />

      <h2 className="noSR-title">{t('search.emptyTitle')}</h2>

      <p className="noSR-desc">
        {t('search.emptyDescription')}
        <br />
        {t('search.emptyHelp')}
      </p>

      <Link to="/" className="noSR-button">
        {t('common.home')}
      </Link>
    </div>
  );
}
