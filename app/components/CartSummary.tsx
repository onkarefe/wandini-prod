import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';
import type { CartLayout } from '~/components/CartMain';
import { CartForm, Money, type OptimisticCart } from '@shopify/hydrogen';
import { useEffect, useRef, useState } from 'react';
import {useFetcher} from 'react-router';
import type { FetcherWithComponents } from 'react-router';
import {
  getGiftCardStorageKey,
  getPersistedGiftCardCodes,
  rememberGiftCardCode,
} from '~/lib/cartGiftCardCodeStorage';
import {
  calculateCartDisplaySubtotal,
  hasConfiguredCartLines,
  type CartLinePricingLike,
} from '~/lib/cart-pricing';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({ cart, layout }: CartSummaryProps) {
  const {t} = useTranslation();
  const className =
    layout === 'page' ? 'cart-summary-page' : 'cart-summary-aside';
  const cartPath = usePrefixPathWithLocale('/cart');
  const lines = (cart?.lines?.nodes ?? []) as unknown as CartLinePricingLike[];
  const hasConfiguredLines = hasConfiguredCartLines(lines);
  const subtotal = hasConfiguredLines
    ? calculateCartDisplaySubtotal(lines)
    : cart?.cost?.subtotalAmount;

  return (
    <div aria-labelledby="cart-summary" className={className}>
      <dl className="cart-subtotal">
        <dt>{t('cart.subtotal')}</dt>
        <dd>
          {subtotal?.amount ? (
            <Money data={subtotal as MoneyV2} />
          ) : (
            '-'
          )}
        </dd>
      </dl>
      <CartDiscounts discountCodes={cart?.discountCodes} />
      <CartGiftCard
        cartId={cart?.id}
        giftCardCodes={cart?.appliedGiftCards}
      />
      <CartCheckoutActions cartPath={cartPath} />
    </div>
  );
}

function CartCheckoutActions({cartPath}: {cartPath: string}) {
  const {t} = useTranslation();
  return (
    <div>
      <a href={cartPath} target="_self">
        <p>{t('cart.checkout')} &rarr;</p>
      </a>
      <br />
    </div>
  );
}

function CartDiscounts({
  discountCodes,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
}) {
  const {t} = useTranslation();
  const codes: string[] =
    discountCodes
      ?.filter((discount) => discount.applicable)
      ?.map(({ code }) => code) || [];

  return (
    <div>
      {/* Have existing discount, display it with a remove option */}
      <dl hidden={!codes.length}>
        <div>
          <dt>{t('cart.discountCode')}</dt>
          <UpdateDiscountForm>
            <div className="cart-discount">
              <code>{codes?.join(', ')}</code>
              &nbsp;
              <button>{t('cart.remove')}</button>
            </div>
          </UpdateDiscountForm>
        </div>
      </dl>

      {/* Show an input to apply a discount */}
      <UpdateDiscountForm discountCodes={codes}>
        <div>
          <input
            type="text"
            name="discountCode"
            placeholder={t('cart.discountCode')}
          />
          &nbsp;
          <button type="submit">{t('cart.redeem')}</button>
        </div>
      </UpdateDiscountForm>
    </div>
  );
}

function UpdateDiscountForm({
  discountCodes,
  children,
}: {
  discountCodes?: string[];
  children: React.ReactNode;
}) {
  const cartPath = usePrefixPathWithLocale('/cart');
  return (
    <CartForm
      route={cartPath}
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{
        discountCodes: discountCodes || [],
      }}
    >
      {children}
    </CartForm>
  );
}

function CartGiftCard({
  cartId,
  giftCardCodes,
}: {
  cartId?: string | null;
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
}) {
  const {t} = useTranslation();
  const giftCardCodeInput = useRef<HTMLInputElement>(null);
  const giftCardAddFetcher = useFetcher({ key: 'gift-card-add' });
  const storageKey = getGiftCardStorageKey(cartId);
  const [persistedGiftCardCodes, setPersistedGiftCardCodes] = useState<
    string[]
  >([]);

  useEffect(() => {
    setPersistedGiftCardCodes(
      getPersistedGiftCardCodes(storageKey, giftCardCodes),
    );
  }, [giftCardCodes, storageKey]);

  // Clear the gift card code input after the gift card is added
  useEffect(() => {
    if (giftCardAddFetcher.data) {
      giftCardCodeInput.current!.value = '';
    }
  }, [giftCardAddFetcher.data]);

  function saveAppliedCode(code: string) {
    setPersistedGiftCardCodes(rememberGiftCardCode(storageKey, code));
  }

  return (
    <div>
      {/* Display applied gift cards with individual remove buttons */}
      {giftCardCodes && giftCardCodes.length > 0 && (
        <dl>
          <dt>{t('cart.giftCard')}</dt>
          {giftCardCodes.map((giftCard) => (
            <RemoveGiftCardForm key={giftCard.id} giftCardId={giftCard.id}>
              <div className="cart-discount">
                <code>***{giftCard.lastCharacters}</code>
                &nbsp;
                <Money data={giftCard.amountUsed} />
                &nbsp;
                <button type="submit">{t('cart.remove')}</button>
              </div>
            </RemoveGiftCardForm>
          ))}
        </dl>
      )}

      {/* Show an input to apply a gift card */}
      <UpdateGiftCardForm
        giftCardCodes={persistedGiftCardCodes}
        saveAppliedCode={saveAppliedCode}
        fetcherKey="gift-card-add"
      >
        <div>
          <input
            type="text"
            name="giftCardCode"
            placeholder={t('cart.giftCard')}
            ref={giftCardCodeInput}
          />
          &nbsp;
          <button type="submit" disabled={giftCardAddFetcher.state !== 'idle'}>
            {t('cart.redeem')}
          </button>
        </div>
      </UpdateGiftCardForm>
    </div>
  );
}

function UpdateGiftCardForm({
  giftCardCodes,
  saveAppliedCode,
  fetcherKey,
  children,
}: {
  giftCardCodes?: string[];
  saveAppliedCode?: (code: string) => void;
  fetcherKey?: string;
  children: React.ReactNode;
}) {
  const cartPath = usePrefixPathWithLocale('/cart');
  return (
    <CartForm
      fetcherKey={fetcherKey}
      route={cartPath}
      action={CartForm.ACTIONS.GiftCardCodesUpdate}
      inputs={{
        giftCardCodes: giftCardCodes || [],
      }}
    >
      {(fetcher: FetcherWithComponents<any>) => {
        const code = fetcher.formData?.get('giftCardCode');
        if (code && saveAppliedCode) {
          saveAppliedCode(code as string);
        }
        return children;
      }}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  children,
}: {
  giftCardId: string;
  children: React.ReactNode;
}) {
  const cartPath = usePrefixPathWithLocale('/cart');
  return (
    <CartForm
      route={cartPath}
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{
        giftCardCodes: [giftCardId],
      }}
    >
      {children}
    </CartForm>
  );
}
