import { useLoaderData, data, type HeadersFunction } from 'react-router';
import type { Route } from './+types/cart';
import type { CartQueryDataReturn } from '@shopify/hydrogen';
import { CartForm, useOptimisticCart } from '@shopify/hydrogen';
import { CustomCart } from '~/components/customCart';
import { CartUpsellCard } from '~/components/CartUpsellCard';
import { CartSummary as CustomCartSummary } from '~/components/CustomCartSummary';
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
    { title: `Hydrogen | Cart` },
    {name: 'robots', content: 'noindex,follow'},
  ];
};

export const headers: HeadersFunction = ({ actionHeaders }) => actionHeaders;

export async function action({ request, context }: Route.ActionArgs) {
  const { cart } = context;

  const formData = await request.formData();

  const { action, inputs } = CartForm.getFormInput(formData);

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
  const { cart: cartResult, errors, warnings } = result;

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
    { status, headers },
  );
}

export async function loader({ context }: Route.LoaderArgs) {
  const { cart } = context;
  return await cart.get();
}

export default function Cart() {
  const cart = useLoaderData<typeof loader>();
  const optimisticCart = useOptimisticCart(cart);
  const cartHasItems = optimisticCart?.totalQuantity
    ? optimisticCart.totalQuantity > 0
    : false;

  return (
    <div className="cartMainContainer">
      <h1 className='carth1Title'>Cart </h1>
      <div className="cartMainRow">
        <div className="cart cartLeft">
          <CustomCart layout="page" cart={cart} />
          <CartUpsellCard />
        </div>
        <div className="cartRight">
          {cartHasItems && (
            <CustomCartSummary cart={optimisticCart} layout="page" />
          )}
        </div>
      </div>
    </div>
  );
}
