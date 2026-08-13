import {useOptimisticCart} from '@shopify/hydrogen';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem} from '~/components/CartLineItem';
import {Link} from '~/lib/i18n-router';

export type CartLayout = 'page' | 'aside';

export type CustomCartProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

export function CustomCart({layout, cart: originalCart}: CustomCartProps) {
  const cart = useOptimisticCart(originalCart);
  const hasLines = Boolean(cart?.lines?.nodes?.length);
  const withDiscount = Boolean(
    cart?.discountCodes?.some((code) => code.applicable),
  );
  const className = `custom-cart-main custom-cart-main--${layout}${withDiscount ? ' with-discount' : ''}`;

  return (
    <div className={className}>
      <CartEmpty hidden={hasLines} />
      <div className="cart-details" aria-label="Warenkorbartikel">
        <ul>
          {(cart?.lines?.nodes ?? []).map((line) => (
            <CartLineItem key={line.id} line={line} layout={layout} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CartEmpty({hidden = false}: {hidden: boolean}) {
  const {close} = useAside();

  return (
    <div className="custom-cart-empty" hidden={hidden}>
      <h2>Ihr Warenkorb ist leer</h2>
      <p>Entdecken Sie unsere Fototapeten und finden Sie Ihr Lieblingsmotiv.</p>
      <Link to="/collections" onClick={close} prefetch="viewport">
        Produkte entdecken
      </Link>
    </div>
  );
}
