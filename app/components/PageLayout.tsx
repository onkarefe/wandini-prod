import {Await} from 'react-router';
import {Suspense, useId} from 'react';
import type {
  CartApiQueryFragment,
  FooterQuery,
  HeaderQuery,
} from 'storefrontapi.generated';
import {Aside} from '~/components/Aside';
import {Footer} from '~/components/Footer';
import {Header} from '~/components/Header';
import {CartMain} from '~/components/CartMain';
import {
  SEARCH_ENDPOINT,
  SearchFormPredictive,
} from '~/components/SearchFormPredictive';
import {SearchResultsPredictive} from '~/components/SearchResultsPredictive';
import {Link} from '~/lib/i18n-router';

interface PageLayoutProps {
  cart: Promise<CartApiQueryFragment | null>;
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
  children?: React.ReactNode;
}

export function PageLayout({
  cart,
  children = null,
  footer,
  header,
  isLoggedIn,
  publicStoreDomain,
}: PageLayoutProps) {
  return (
    <Aside.Provider>
      <CartAside cart={cart} />
      <SearchAside />
      {header ? (
        <Header
          header={header}
          cart={cart}
          isLoggedIn={isLoggedIn}
          publicStoreDomain={publicStoreDomain}
        />
      ) : null}
      <main>{children}</main>
      <Footer
        footer={footer}
        header={header}
        publicStoreDomain={publicStoreDomain}
      />
    </Aside.Provider>
  );
}

function CartAside({cart}: {cart: PageLayoutProps['cart']}) {
  return (
    <Aside type="cart" heading="WARENKORB">
      <Suspense fallback={<p>Warenkorb wird geladen …</p>}>
        <Await resolve={cart}>
          {(resolvedCart) => {
            return <CartMain cart={resolvedCart} layout="aside" />;
          }}
        </Await>
      </Suspense>
    </Aside>
  );
}

function SearchAside() {
  const queriesDatalistId = useId();

  return (
    <Aside type="search" heading="SUCHE">
      <div className="predictive-search">
        <SearchFormPredictive>
          {({fetchResults, inputRef}) => (
            <div className="predictive-search-form__field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                data-predictive-search-input="true"
                name="q"
                onChange={fetchResults}
                onFocus={fetchResults}
                placeholder="Suchen"
                ref={inputRef}
                type="search"
                list={queriesDatalistId}
              />
              <button type="submit" aria-label="Suchen">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10h11M11 6l4 4-4 4" />
                </svg>
              </button>
            </div>
          )}
        </SearchFormPredictive>

        <SearchResultsPredictive>
          {({items, total, term, state, closeSearch}) => {
            const {articles, collections, pages, products, queries} = items;
            const searchUrl = term.current
              ? `${SEARCH_ENDPOINT}?${new URLSearchParams({
                  q: term.current,
                }).toString()}`
              : SEARCH_ENDPOINT;

            if (state !== 'idle' && term.current) {
              return (
                <div className="predictive-search__loading" role="status">
                  <span aria-hidden="true" />
                  Wird gesucht …
                </div>
              );
            }

            if (!total) {
              return <SearchResultsPredictive.Empty term={term} />;
            }

            return (
              <>
                <SearchResultsPredictive.Queries
                  queries={queries}
                  queriesDatalistId={queriesDatalistId}
                />
                <SearchResultsPredictive.Products
                  products={products}
                  closeSearch={closeSearch}
                  term={term}
                />
                <SearchResultsPredictive.Collections
                  collections={collections}
                  closeSearch={closeSearch}
                  term={term}
                />
                <SearchResultsPredictive.Pages
                  pages={pages}
                  closeSearch={closeSearch}
                  term={term}
                />
                <SearchResultsPredictive.Articles
                  articles={articles}
                  closeSearch={closeSearch}
                  term={term}
                />
                {term.current && total ? (
                  <Link
                    className="predictive-search__all"
                    onClick={closeSearch}
                    to={searchUrl}
                  >
                    <span>
                      Alle Ergebnisse für <q>{term.current}</q> anzeigen
                    </span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10h11M11 6l4 4-4 4" />
                    </svg>
                  </Link>
                ) : null}
              </>
            );
          }}
        </SearchResultsPredictive>
      </div>
    </Aside>
  );
}
