import {useEffect, useState} from 'react';
import {useLoaderData, useRevalidator} from 'react-router';
import type {Route} from './+types/account.favorites';
import {CustomProductCard} from '~/components/CustomProductCard';
import {Link} from '~/lib/i18n-router';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {ACCOUNT_FAVORITES_PRODUCTS_QUERY} from '~/graphql/storefront/AccountFavoritesProductsQuery';
import {
  getWishlistRequestId,
  logWishlistError,
  WishlistServiceError,
} from '~/lib/wishlist-errors.server';
import {WISHLIST_LOAD_UNAVAILABLE_MESSAGE} from '~/lib/wishlist';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import '../styles/wishlistFeedback.css';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Favoriten'},
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

export async function loader({context, request}: Route.LoaderArgs) {
  const {customerAccount, storefront} = context;
  const requestId = getWishlistRequestId(request);
  let customerId: string;

  try {
    const {data, errors} = await customerAccount.query(
      CUSTOMER_WISHLIST_OWNER_QUERY,
      {
        variables: {language: customerAccount.i18n.language},
      },
    );

    if (errors?.length || !data?.customer?.id) {
      throw new WishlistServiceError(
        'CUSTOMER_ACCOUNT_ERROR',
        'Customer could not be resolved while loading favorites.',
        {retryable: true},
      );
    }

    customerId = data.customer.id;
  } catch (error) {
    logWishlistError({error, operation: 'resolve_customer', requestId});
    return {favorites: [], wishlistStatus: 'unavailable' as const};
  }

  let wishlistProductIds: string[];

  try {
    wishlistProductIds = await getCustomerWishlistProductIds({
      env: context.env,
      customerId,
    });
  } catch (error) {
    logWishlistError({error, operation: 'load_favorites', requestId});
    return {favorites: [], wishlistStatus: 'unavailable' as const};
  }

  if (wishlistProductIds.length === 0) {
    return {favorites: [], wishlistStatus: 'ready' as const};
  }

  try {
    const favoritesResult = await storefront.query(
      ACCOUNT_FAVORITES_PRODUCTS_QUERY,
      {
        variables: {
          ids: wishlistProductIds,
        },
      },
    );

    const favoriteProductsById = new Map(
      favoritesResult.nodes.flatMap((node) =>
        node?.__typename === 'Product' ? ([[node.id, node]] as const) : [],
      ),
    );

    const favorites = wishlistProductIds.flatMap((productId) => {
      const product = favoriteProductsById.get(productId);
      return product ? [product] : [];
    });

    return {favorites, wishlistStatus: 'ready' as const};
  } catch (error) {
    logWishlistError({error, operation: 'load_favorite_products', requestId});
    return {favorites: [], wishlistStatus: 'unavailable' as const};
  }
}

export default function AccountFavorites() {
  const {favorites, wishlistStatus} = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [favoriteProducts, setFavoriteProducts] = useState(favorites);

  useEffect(() => {
    setFavoriteProducts(favorites);
  }, [favorites]);

  return (
    <div className="account-page account-favorites">
      <header className="account-page__header">
        <div>
          <p className="account-page__eyebrow">Ihre Auswahl</p>
          <h2 className="account-page__title">Favoriten</h2>
          <p className="account-page__description">
            Hier finden Sie alle Produkte, die Sie für später gespeichert haben.
          </p>
        </div>
        {wishlistStatus === 'ready' && favoriteProducts.length > 0 ? (
          <span className="account-page__count">
            {favoriteProducts.length}{' '}
            {favoriteProducts.length === 1 ? 'Produkt' : 'Produkte'}
          </span>
        ) : null}
      </header>

      <section
        className="account-favorites__content"
        aria-busy={revalidator.state !== 'idle'}
      >
        {wishlistStatus === 'unavailable' ? (
          <div className="account-favorites__unavailable" role="status">
            <p className="account-message account-message--error">
              {WISHLIST_LOAD_UNAVAILABLE_MESSAGE}
            </p>
            <button
              type="button"
              className="account-button account-button--primary"
              disabled={revalidator.state !== 'idle'}
              onClick={() => {
                void revalidator.revalidate();
              }}
            >
              {revalidator.state === 'idle'
                ? 'Erneut versuchen'
                : 'Wird erneut versucht...'}
            </button>
          </div>
        ) : favoriteProducts.length === 0 ? (
          <div className="account-empty-state">
            <h3>Noch keine Favoriten</h3>
            <p>
              Speichern Sie Produkte über das Herzsymbol, um sie hier schnell
              wiederzufinden.
            </p>
            <Link
              className="account-button account-button--primary"
              to="/collections"
            >
              Produkte entdecken
            </Link>
          </div>
        ) : (
          <div className="custom-products-grid">
            {favoriteProducts.map((product) => (
              <CustomProductCard
                key={product.id}
                productId={product.id}
                title={product.title}
                images={product.images.nodes.map((image) => ({
                  url: image.url,
                  altText: image.altText ?? undefined,
                }))}
                productUrl={`/products/${product.handle}`}
                minPrice={product.priceRange.minVariantPrice}
                isLoggedIn
                isWishlisted
                onWishlistChange={(wishlisted) => {
                  if (!wishlisted) {
                    setFavoriteProducts((currentProducts) =>
                      currentProducts.filter(
                        (currentProduct) => currentProduct.id !== product.id,
                      ),
                    );
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
