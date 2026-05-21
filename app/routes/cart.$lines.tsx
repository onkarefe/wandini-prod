import {Form, redirect, useLoaderData, useLocation} from 'react-router';
import type {Route} from './+types/cart.$lines';
import {redirectToLocalePath} from '~/lib/locale';
import {Link} from '~/lib/i18n-router';

type CartCheckoutConfirmation = {
  discountCode: string | null;
  lineCount: number;
};

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: 'noindex,follow'}];
};

function parseCartLines(lines: string) {
  const linesMap: Array<{merchandiseId: string; quantity: number}> = [];

  for (const line of lines.split(',')) {
    const lineDetails = line.split(':');
    const variantId = lineDetails[0];
    const quantity = Number.parseInt(lineDetails[1], 10);

    if (!/^\d+$/.test(variantId) || !Number.isSafeInteger(quantity) || quantity < 1) {
      return null;
    }

    linesMap.push({
      merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
      quantity,
    });
  }

  return linesMap;
}

/**
 * Automatically creates a new cart based on the URL and redirects straight to checkout.
 * Expected URL structure:
 * ```js
 * /cart/<variant_id>:<quantity>
 *
 * ```
 *
 * More than one `<variant_id>:<quantity>` separated by a comma, can be supplied in the URL, for
 * carts with more than one product variant.
 *
 * @example
 * Example path creating a cart with two product variants, different quantities, and a discount code in the querystring:
 * ```js
 * /cart/41007289663544:1,41007289696312:2?discount=HYDROBOARD
 *
 * ```
 */
export async function loader({request, context, params}: Route.LoaderArgs) {
  const {lines} = params;
  if (!lines) return redirectToLocalePath(request, '/cart');

  const linesMap = parseCartLines(lines);
  if (!linesMap) {
    throw new Response('Invalid cart link.', {status: 400});
  }

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const discount = searchParams.get('discount');

  return {
    discountCode: discount,
    lineCount: linesMap.length,
  } satisfies CartCheckoutConfirmation;
}

export async function action({request, context, params}: Route.ActionArgs) {
  const {cart} = context;
  const {lines} = params;

  if (!lines) {
    return redirectToLocalePath(request, '/cart');
  }

  const linesMap = parseCartLines(lines);
  if (!linesMap) {
    throw new Response('Invalid cart link.', {status: 400});
  }

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const discount = searchParams.get('discount');
  const discountArray = discount ? [discount] : [];

  // create a cart
  const result = await cart.create({
    lines: linesMap,
    discountCodes: discountArray,
  });

  const cartResult = result.cart;

  if (result.errors?.length || !cartResult) {
    throw new Response('Link may be expired. Try checking the URL.', {
      status: 410,
    });
  }

  // Update cart id in cookie
  const headers = cart.setCartId(cartResult.id);

  // redirect to checkout
  if (cartResult.checkoutUrl) {
    return redirect(cartResult.checkoutUrl, {headers});
  } else {
    throw new Error('No checkout URL found');
  }
}

export default function Component() {
  const {discountCode, lineCount} = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '32rem',
          border: '1px solid #d9d9d9',
          borderRadius: '1rem',
          padding: '1.5rem',
          background: '#fff',
        }}
      >
        <h1 style={{fontSize: '1.5rem', marginBottom: '0.75rem'}}>
          Continue to checkout?
        </h1>
        <p style={{marginBottom: '1rem'}}>
          This link will create a cart with {lineCount} item
          {lineCount === 1 ? '' : 's'} and send you to checkout.
        </p>
        {discountCode ? (
          <p style={{marginBottom: '1rem'}}>
            Discount code to apply: <strong>{discountCode}</strong>
          </p>
        ) : null}
        <Form method="post" action={`${location.pathname}${location.search}`}>
          <button type="submit">Continue to checkout</button>
        </Form>
        <p style={{marginTop: '1rem'}}>
          <Link to="/cart">Cancel and go to cart</Link>
        </p>
      </div>
    </main>
  );
}
