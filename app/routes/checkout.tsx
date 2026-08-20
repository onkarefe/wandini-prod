import {redirect} from 'react-router';
import type {Route} from './+types/checkout';
import {
  DynamicPricingError,
  getOrCreateDraftOrderCheckout,
  type DynamicPricingCart,
} from '~/lib/dynamic-pricing.server';
import {redirectToLocalePath} from '~/lib/locale';

export async function loader({request}: Route.LoaderArgs) {
  return redirectToLocalePath(request, '/cart');
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    return redirectToLocalePath(request, '/cart');
  }

  try {
    const cart = await context.cart.get();
    if (!cart?.lines.nodes.length) {
      throw new DynamicPricingError('INVALID_CART', 'The cart is empty.');
    }

    const checkout = await getOrCreateDraftOrderCheckout(
      cart as unknown as DynamicPricingCart,
      context.env,
    );
    return redirect(checkout.invoiceUrl, {status: 303});
  } catch (error) {
    console.error('Configured checkout creation failed.', {
      code:
        error instanceof DynamicPricingError ? error.code : 'UNEXPECTED_ERROR',
      retryable: error instanceof DynamicPricingError ? error.retryable : false,
    });
    return redirectToLocalePath(
      request,
      error instanceof DynamicPricingError &&
        error.code === 'DYNAMIC_CHECKOUT_DISABLED'
        ? '/cart?checkout=disabled'
        : '/cart?checkout=error',
    );
  }
}

export default function CheckoutRoute() {
  return null;
}
