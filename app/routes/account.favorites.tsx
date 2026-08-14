import {useEffect, useState} from 'react';
import {useLoaderData} from 'react-router';
import type {Route} from './+types/account.favorites';
import {CustomProductCard} from '~/components/CustomProductCard';
import {CUSTOMER_WISHLIST_OWNER_QUERY} from '~/graphql/customer-account/WishlistCustomerOwnerQuery';
import {ACCOUNT_FAVORITES_PRODUCTS_QUERY} from '~/graphql/storefront/AccountFavoritesProductsQuery';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Favorites'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount, storefront} = context;
  await customerAccount.handleAuthStatus();

  const {data, errors} = await customerAccount.query(
    CUSTOMER_WISHLIST_OWNER_QUERY,
    {
      variables: {language: customerAccount.i18n.language},
    },
  );

  if (errors?.length || !data?.customer?.id) {
    throw new Response('Customer not found', {status: 404});
  }

  const wishlistProductIds = await getCustomerWishlistProductIds({
    env: context.env,
    customerId: data.customer.id,
  });

  if (wishlistProductIds.length === 0) {
    return {favorites: []};
  }

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

  return {favorites};
}

export default function AccountFavorites() {
  const {favorites} = useLoaderData<typeof loader>();
  const [favoriteProducts, setFavoriteProducts] = useState(favorites);

  useEffect(() => {
    setFavoriteProducts(favorites);
  }, [favorites]);

  return (
    <div className="account-favorites">
      <section className="account-profile__section">
        <h2 className="account-profile__title">My favorites</h2>

        {favoriteProducts.length === 0 ? (
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
