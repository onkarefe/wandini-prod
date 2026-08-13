import {Suspense} from 'react';
import {Await, useLoaderData, data, type HeadersFunction} from 'react-router';
import type {Route} from './+types/cart';
import type {CartQueryDataReturn} from '@shopify/hydrogen';
import {CartForm, useOptimisticCart} from '@shopify/hydrogen';
import {CustomCart} from '~/components/customCart';
import {
  CartUpsellCard,
  type CartUpsellProduct,
} from '~/components/CartUpsellCard';
import {CartSummary as CustomCartSummary} from '~/components/CustomCartSummary';
import {getLocaleFromRequest, prefixPathWithLocale} from '~/lib/locale';
import '~/styles/cart.css';

const INTERNAL_REDIRECT_ORIGIN = 'https://wandini.internal';

function getSafeRedirectPath(redirectParam: FormDataEntryValue | null) {
  if (typeof redirectParam !== 'string') {
    return null;
  }

  const trimmedRedirect = redirectParam.trim();

  if (
    !trimmedRedirect ||
    !trimmedRedirect.startsWith('/') ||
    trimmedRedirect.startsWith('//') ||
    trimmedRedirect.includes('\\')
  ) {
    return null;
  }

  try {
    const redirectUrl = new URL(trimmedRedirect, INTERNAL_REDIRECT_ORIGIN);

    if (redirectUrl.origin !== INTERNAL_REDIRECT_ORIGIN) {
      return null;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return null;
  }
}

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Warenkorb | Wandini'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export const headers: HeadersFunction = ({actionHeaders}) => actionHeaders;

export async function action({request, context}: Route.ActionArgs) {
  const {cart} = context;

  const formData = await request.formData();

  const {action, inputs} = CartForm.getFormInput(formData);

  if (!action) {
    return data(
      {
        cart: null,
        errors: [{message: 'No action provided'}],
        warnings: [],
        analytics: {
          cartId: null,
        },
      },
      {status: 400},
    );
  }

  let status = 200;
  let result: CartQueryDataReturn;

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      result = await cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await cart.removeLines(inputs.lineIds);
      break;
    case CartForm.ACTIONS.DiscountCodesUpdate: {
      const formDiscountCode = inputs.discountCode;

      // User inputted discount code
      const discountCodes = (
        formDiscountCode ? [formDiscountCode] : []
      ) as string[];

      // Combine discount codes already applied on cart
      discountCodes.push(...inputs.discountCodes);

      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesUpdate: {
      const formGiftCardCode = inputs.giftCardCode;

      // User inputted gift card code
      const giftCardCodes = (
        formGiftCardCode ? [formGiftCardCode] : []
      ) as string[];

      // Combine gift card codes already applied on cart
      giftCardCodes.push(...inputs.giftCardCodes);

      result = await cart.updateGiftCardCodes(giftCardCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesRemove: {
      const appliedGiftCardIds = inputs.giftCardCodes as string[];
      result = await cart.removeGiftCardCodes(appliedGiftCardIds);
      break;
    }
    case CartForm.ACTIONS.BuyerIdentityUpdate: {
      result = await cart.updateBuyerIdentity({
        ...inputs.buyerIdentity,
      });
      break;
    }
    default:
      return data(
        {
          cart: null,
          errors: [{message: `${action} cart action is not defined`}],
          warnings: [],
          analytics: {
            cartId: null,
          },
        },
        {status: 400},
      );
  }

  const cartId = result?.cart?.id;
  const headers = cartId ? cart.setCartId(result.cart.id) : new Headers();
  const {cart: cartResult, errors, warnings} = result;

  const redirectTo = getSafeRedirectPath(formData.get('redirectTo'));
  if (redirectTo) {
    status = 303;
    headers.set(
      'Location',
      prefixPathWithLocale(redirectTo, getLocaleFromRequest(request)),
    );
  }

  return data(
    {
      cart: cartResult,
      errors,
      warnings,
      analytics: {
        cartId,
      },
    },
    {status, headers},
  );
}

export async function loader({context}: Route.LoaderArgs) {
  const {cart, storefront} = context;
  const cartUpsellProducts = storefront
    .query(CART_UPSELL_PRODUCTS_QUERY, {
      cache: storefront.CacheLong(),
      displayName: 'CartUpsellProducts',
      variables: {collectionHandle: 'zubehor'},
    })
    .then(({collection}) => {
      const references =
        collection?.cartUpsellProducts?.references?.nodes ?? [];

      return references.flatMap((reference) =>
        reference.__typename === 'Product'
          ? [
              {
                id: reference.id,
                handle: reference.handle,
                title: reference.title,
                image: reference.featuredImage ?? null,
                variant: reference.selectedOrFirstAvailableVariant
                  ? {
                      id: reference.selectedOrFirstAvailableVariant.id,
                      availableForSale:
                        reference.selectedOrFirstAvailableVariant
                          .availableForSale,
                      price: reference.selectedOrFirstAvailableVariant.price,
                    }
                  : null,
              } satisfies CartUpsellProduct,
            ]
          : [],
      );
    })
    .catch((error: unknown) => {
      console.error('Cart upsell products could not be loaded.', error);
      return [] as CartUpsellProduct[];
    });

  return {
    cart: await cart.get(),
    cartUpsellProducts,
  };
}

export default function Cart() {
  const {cart, cartUpsellProducts} = useLoaderData<typeof loader>();
  const optimisticCart = useOptimisticCart(cart);
  const cartHasItems = optimisticCart?.totalQuantity
    ? optimisticCart.totalQuantity > 0
    : false;

  return (
    <div className="cartMainContainer">
      <header className="cart-page-header">
        <h1>Warenkorb</h1>
        <p>Überprüfen Sie Ihre Auswahl und schließen Sie Ihre Bestellung ab.</p>
      </header>
      <div className="cartMainRow">
        <div className="cartLeft">
          <CustomCart layout="page" cart={cart} />
        </div>
        <div className="cartRight">
          {cartHasItems && (
            <CustomCartSummary cart={optimisticCart} layout="page" />
          )}
        </div>
        <div className="cartExtras">
          <Suspense fallback={null}>
            <Await resolve={cartUpsellProducts} errorElement={null}>
              {(products) => <CartUpsellCard products={products} />}
            </Await>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

const CART_UPSELL_PRODUCTS_QUERY = `#graphql
  query CartUpsellProducts(
    $country: CountryCode
    $language: LanguageCode
    $collectionHandle: String!
  ) @inContext(country: $country, language: $language) {
    collection(handle: $collectionHandle) {
      cartUpsellProducts: metafield(
        namespace: "custom"
        key: "cart_upsell_products"
      ) {
        references(first: 3) {
          nodes {
            __typename
            ... on Product {
              id
              handle
              title
              featuredImage {
                url
                altText
                width
                height
              }
              selectedOrFirstAvailableVariant(
                ignoreUnknownOptions: true
                caseInsensitiveMatch: true
              ) {
                id
                availableForSale
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
` as const;
