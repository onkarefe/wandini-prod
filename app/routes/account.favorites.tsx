import {useEffect, useState} from 'react';
import {useLoaderData, useRevalidator} from 'react-router';
import type {Route} from './+types/account.favorites';
import {CustomProductCard} from '~/components/CustomProductCard';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {ACCOUNT_FAVORITES_PRODUCTS_QUERY} from '~/graphql/storefront/AccountFavoritesProductsQuery';
import {
  getWishlistRequestId,
  logWishlistError,
  WishlistServiceError,
} from '~/lib/wishlist-errors.server';
import {WISHLIST_LOAD_UNAVAILABLE_MESSAGE} from '~/lib/wishlist';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';
import '../styles/wishlistFeedback.css';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Favorites'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({context, request}: Route.LoaderArgs) {
  const {customerAccount, storefront} = context;
  await customerAccount.handleAuthStatus();
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
          country: storefront.i18n.country,
          language: storefront.i18n.language,
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
    <div className="account-favorites">
      <section className="account-profile__section">
        <h2 className="account-profile__title">My favorites</h2>

        {wishlistStatus === 'unavailable' ? (
          <div className="account-favorites__unavailable" role="status">
            <p className="account-profile__error">
              <mark className="account-profile__error-mark">
                {WISHLIST_LOAD_UNAVAILABLE_MESSAGE}
              </mark>
            </p>
            <button
              type="button"
              className="account-profile__button"
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
          <p className="account-addresses__empty">
            You have not added any favorite products yet.
          </p>
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
