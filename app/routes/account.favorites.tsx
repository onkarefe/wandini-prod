import {useLoaderData} from 'react-router';
import type {Route} from './+types/account.favorites';
import {CustomProductCard} from '~/components/CustomProductCard';
import {ACCOUNT_FAVORITES_PRODUCTS_QUERY} from '~/graphql/customer-account/AccountFavoritesProductsQuery';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';

type FavoriteProductNode = {
  id: string;
  handle: string;
  title: string;
  priceRange?: {
    minVariantPrice?: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
  images: {
    nodes: Array<{
      url: string;
      altText?: string | null;
    }>;
  };
};

type FavoritesQueryResult = {
  nodes: Array<FavoriteProductNode | null>;
};

const CUSTOMER_WISHLIST_OWNER_QUERY = `#graphql
  query WishlistCustomerOwner($language: LanguageCode)
  @inContext(language: $language) {
    customer {
      id
    }
  }
` as const;

export const meta: Route.MetaFunction = () => {
  return [{title: 'Favorites'}];
};

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount, storefront} = context;
  customerAccount.handleAuthStatus();

  const {data, errors} = await customerAccount.query(CUSTOMER_WISHLIST_OWNER_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer?.id) {
    throw new Response('Customer not found', {status: 404});
  }

  const wishlistProductIds = await getCustomerWishlistProductIds({
    env: context.env as {
      SHOPIFY_SHOP?: string;
      SHOPIFY_CLIENT_ID?: string;
      SHOPIFY_CLIENT_SECRET?: string;
    },
    customerId: data.customer.id,
  });

  if (wishlistProductIds.length === 0) {
    return {
      favorites: [],
      wishlistProductIds,
    };
  }

  const favoritesResult = await storefront.query(ACCOUNT_FAVORITES_PRODUCTS_QUERY, {
    variables: {
      ids: wishlistProductIds,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
  });

  const favoriteProductsById = new Map(
    ((favoritesResult as FavoritesQueryResult).nodes ?? [])
      .filter((node): node is FavoriteProductNode => Boolean(node?.id))
      .map((node) => [node.id, node]),
  );

  const favorites = wishlistProductIds
    .map((productId) => favoriteProductsById.get(productId))
    .filter((product): product is FavoriteProductNode => Boolean(product));

  return {
    favorites,
    wishlistProductIds,
  };
}

export default function AccountFavorites() {
  const {favorites} = useLoaderData<typeof loader>();

  return (
    <div className="account-favorites">
      <section className="account-profile__section">
        <h2 className="account-profile__title">My favorites</h2>

        {favorites.length === 0 ? (
          <p className="account-addresses__empty">
            You have not added any favorite products yet.
          </p>
        ) : (
          <div className="custom-products-grid">
            {favorites.map((product) => (
              <CustomProductCard
                key={product.id}
                productId={product.id}
                title={product.title}
                images={product.images.nodes.map((image) => ({
                  url: image.url,
                  altText: image.altText ?? undefined,
                }))}
                productUrl={`/products/${product.handle}`}
                minPrice={
                  product.priceRange?.minVariantPrice
                    ? {
                        amount: product.priceRange.minVariantPrice.amount,
                        currencyCode: product.priceRange.minVariantPrice.currencyCode,
                      }
                    : undefined
                }
                isLoggedIn
                isWishlisted
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
