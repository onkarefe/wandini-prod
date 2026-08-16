import {Image, Money} from '@shopify/hydrogen';
import React, {useEffect, useRef} from 'react';
import {useFetcher, type Fetcher} from 'react-router';
import noSearchResultsIcon from '~/assets/Icons/nosrIcon.png';
import {Link} from '~/lib/i18n-router';
import {
  getEmptyPredictiveSearchResult,
  type PredictiveSearchReturn,
  urlWithTrackingParams,
} from '~/lib/search';
import {useAside} from './Aside';

const PREDICTIVE_SEARCH_INPUT_SELECTOR =
  '[data-predictive-search-input="true"]';

type PredictiveSearchItems = PredictiveSearchReturn['result']['items'];

type UsePredictiveSearchReturn = {
  term: React.MutableRefObject<string>;
  total: number;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  items: PredictiveSearchItems;
  fetcher: Fetcher<PredictiveSearchReturn>;
};

type SearchResultsPredictiveArgs = Pick<
  UsePredictiveSearchReturn,
  'term' | 'total' | 'inputRef' | 'items'
> & {
  state: Fetcher['state'];
  closeSearch: () => void;
};

type PartialPredictiveSearchResult<
  ItemType extends keyof PredictiveSearchItems,
  ExtraProps extends keyof SearchResultsPredictiveArgs = 'term' | 'closeSearch',
> = Pick<PredictiveSearchItems, ItemType> &
  Pick<SearchResultsPredictiveArgs, ExtraProps>;

type SearchResultsPredictiveProps = {
  children: (args: SearchResultsPredictiveArgs) => React.ReactNode;
};

export function SearchResultsPredictive({
  children,
}: SearchResultsPredictiveProps) {
  const aside = useAside();
  const {term, inputRef, fetcher, total, items} = usePredictiveSearch();

  function closeSearch() {
    if (inputRef.current) {
      inputRef.current.blur();
      inputRef.current.value = '';
    }

    term.current = '';
    aside.close();
  }

  return children({
    items,
    closeSearch,
    inputRef,
    state: fetcher.state,
    term,
    total,
  });
}

SearchResultsPredictive.Articles = SearchResultsPredictiveArticles;
SearchResultsPredictive.Collections = SearchResultsPredictiveCollections;
SearchResultsPredictive.Pages = SearchResultsPredictivePages;
SearchResultsPredictive.Products = SearchResultsPredictiveProducts;
SearchResultsPredictive.Queries = SearchResultsPredictiveQueries;
SearchResultsPredictive.Empty = SearchResultsPredictiveEmpty;

function SearchResultsPredictiveProducts({
  term,
  products,
  closeSearch,
}: PartialPredictiveSearchResult<'products'>) {
  if (!products.length) return null;

  return (
    <section className="predictive-search-result">
      <h2>Produkte</h2>
      <ul>
        {products.map((product) => {
          const productUrl = urlWithTrackingParams({
            baseUrl: `/products/${product.handle}`,
            trackingParams: product.trackingParameters,
            term: term.current,
          });
          const variant = product.selectedOrFirstAvailableVariant;

          return (
            <li className="predictive-search-result-item" key={product.id}>
              <Link to={productUrl} onClick={closeSearch}>
                <ResultImage
                  alt={variant?.image?.altText ?? product.title}
                  url={variant?.image?.url}
                />
                <span className="predictive-result__content">
                  <strong>{product.title}</strong>
                  {variant?.price ? (
                    <small>
                      <Money data={variant.price} />
                    </small>
                  ) : null}
                </span>
                <ResultArrow />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchResultsPredictiveCollections({
  term,
  collections,
  closeSearch,
}: PartialPredictiveSearchResult<'collections'>) {
  if (!collections.length) return null;

  return (
    <section className="predictive-search-result">
      <h2>Kollektionen</h2>
      <ul>
        {collections.map((collection) => {
          const collectionUrl = urlWithTrackingParams({
            baseUrl: `/collections/${collection.handle}`,
            trackingParams: collection.trackingParameters,
            term: term.current,
          });

          return (
            <li className="predictive-search-result-item" key={collection.id}>
              <Link onClick={closeSearch} to={collectionUrl}>
                <ResultImage
                  alt={collection.image?.altText ?? collection.title}
                  url={collection.image?.url}
                />
                <span className="predictive-result__content">
                  <strong>{collection.title}</strong>
                </span>
                <ResultArrow />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchResultsPredictivePages({
  term,
  pages,
  closeSearch,
}: PartialPredictiveSearchResult<'pages'>) {
  if (!pages.length) return null;

  return (
    <section className="predictive-search-result predictive-search-result--links">
      <h2>Seiten</h2>
      <ul>
        {pages.map((page) => (
          <li className="predictive-search-result-item" key={page.id}>
            <Link
              onClick={closeSearch}
              to={urlWithTrackingParams({
                baseUrl: `/pages/${page.handle}`,
                trackingParams: page.trackingParameters,
                term: term.current,
              })}
            >
              <span className="predictive-result__content">
                <strong>{page.title}</strong>
              </span>
              <ResultArrow />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SearchResultsPredictiveArticles({
  term,
  articles,
  closeSearch,
}: PartialPredictiveSearchResult<'articles'>) {
  if (!articles.length) return null;

  return (
    <section className="predictive-search-result">
      <h2>Magazin</h2>
      <ul>
        {articles.map((article) => {
          const articleUrl = urlWithTrackingParams({
            baseUrl: `/blogs/${article.blog.handle}/${article.handle}`,
            trackingParams: article.trackingParameters,
            term: term.current,
          });

          return (
            <li className="predictive-search-result-item" key={article.id}>
              <Link onClick={closeSearch} to={articleUrl}>
                <ResultImage
                  alt={article.image?.altText ?? article.title}
                  url={article.image?.url}
                />
                <span className="predictive-result__content">
                  <strong>{article.title}</strong>
                </span>
                <ResultArrow />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchResultsPredictiveQueries({
  queries,
  queriesDatalistId,
}: PartialPredictiveSearchResult<'queries', never> & {
  queriesDatalistId: string;
}) {
  if (!queries.length) return null;

  return (
    <datalist id={queriesDatalistId}>
      {queries.map((suggestion) =>
        suggestion ? (
          <option key={suggestion.text} value={suggestion.text} />
        ) : null,
      )}
    </datalist>
  );
}

function SearchResultsPredictiveEmpty({
  term,
}: {
  term: React.MutableRefObject<string>;
}) {
  if (!term.current) return null;

  return (
    <div className="predictive-search__empty" role="status">
      <img src={noSearchResultsIcon} alt="" aria-hidden="true" />
      <p>
        Keine Ergebnisse für <q>{term.current}</q> gefunden.
      </p>
    </div>
  );
}

function ResultImage({url, alt}: {url?: string; alt: string}) {
  return (
    <span className="predictive-result__media">
      {url ? (
        <Image alt={alt} src={url} width={72} height={72} loading="lazy" />
      ) : null}
    </span>
  );
}

function ResultArrow() {
  return (
    <svg
      className="predictive-result__arrow"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function usePredictiveSearch(): UsePredictiveSearchReturn {
  const fetcher = useFetcher<PredictiveSearchReturn>({key: 'search'});
  const term = useRef('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (fetcher.formData) {
    term.current = String(fetcher.formData.get('q') || '');
  }

  useEffect(() => {
    if (!inputRef.current) {
      inputRef.current = document.querySelector<HTMLInputElement>(
        PREDICTIVE_SEARCH_INPUT_SELECTOR,
      );
    }
  }, []);

  const result = fetcher.data?.result ?? getEmptyPredictiveSearchResult();
  const {items, total} = term.current
    ? result
    : getEmptyPredictiveSearchResult();

  return {items, total, inputRef, term, fetcher};
}
