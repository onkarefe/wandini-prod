import {useOptimisticCart} from '@shopify/hydrogen';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem} from '~/components/CartLineItem';
import {Link} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

export type CartLayout = 'page' | 'aside';

export type CustomCartProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

export function CustomCart({layout, cart: originalCart}: CustomCartProps) {
  const {t} = useTranslation();
  const cart = useOptimisticCart(originalCart);
  const hasLines = Boolean(cart?.lines?.nodes?.length);
  const withDiscount = Boolean(
    cart?.discountCodes?.some((code) => code.applicable),
  );
  const className = `custom-cart-main custom-cart-main--${layout}${withDiscount ? ' with-discount' : ''}`;

  return (
    <div className={className}>
      <CartEmpty hidden={hasLines} />
      <div className="cart-details" aria-label={t('cart.items')}>
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
  const {t} = useTranslation();
  const {close} = useAside();

  return (
    <div className="custom-cart-empty" hidden={hidden}>
      <h2>{t('cart.emptyTitle')}</h2>
      <p>{t('cart.emptyDescription')}</p>
      <Link to="/collections" onClick={close} prefetch="viewport">
        {t('cart.discoverProducts')}
      </Link>
    </div>
  );
}
