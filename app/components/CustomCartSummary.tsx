import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {
  Form,
  useFetcher,
  useNavigation,
  type FetcherWithComponents,
} from 'react-router';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {
  calculateCartDisplaySubtotal,
  hasConfiguredCartLines,
  type CartLinePricingLike,
} from '~/lib/cart-pricing';
import type {ConfiguredMoney} from '~/lib/configurator-pricing';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
import {
  getGiftCardStorageKey,
  getPersistedGiftCardCodes,
  rememberGiftCardCode,
} from '~/lib/cartGiftCardCodeStorage';
import {
  claimConfiguredCheckoutSubmission,
  releaseConfiguredCheckoutSubmission,
} from '~/lib/configured-checkout-submission';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
  pricingQuote?: {
    subtotalAmount: ConfiguredMoney;
    totalAmount: ConfiguredMoney;
    discountCodes: string[];
  } | null;
  checkoutMode: 'native' | 'draft' | 'blocked';
};

type CartFetcher = FetcherWithComponents<unknown>;

function hasErrors(data: unknown) {
  if (!data || typeof data !== 'object' || !('errors' in data)) return false;
  const errors = (data as {errors?: unknown}).errors;
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
}

export function CartSummary({
  cart,
  layout,
  pricingQuote,
  checkoutMode,
}: CartSummaryProps) {
  const quantity = cart?.totalQuantity ?? 0;
  const checkoutPath = usePrefixPathWithLocale('/checkout');
  const navigation = useNavigation();
  const checkoutSubmissionLock = useRef(false);
  const [checkoutSubmissionClaimed, setCheckoutSubmissionClaimed] =
    useState(false);
  const configuredCheckoutPending = checkoutSubmissionClaimed;
  const lines = (cart?.lines?.nodes ?? []) as unknown as CartLinePricingLike[];
  const hasConfiguredLines = hasConfiguredCartLines(lines);
  const configuredSubtotal = hasConfiguredLines
    ? calculateCartDisplaySubtotal(lines)
    : null;
  const subtotalAmount =
    pricingQuote?.subtotalAmount ??
    configuredSubtotal ??
    cart?.cost?.subtotalAmount;
  const totalAmount =
    pricingQuote?.totalAmount ?? configuredSubtotal ?? cart?.cost?.totalAmount;

  useEffect(() => {
    if (navigation.state === 'idle') {
      releaseConfiguredCheckoutSubmission(checkoutSubmissionLock);
      setCheckoutSubmissionClaimed(false);
    }
  }, [navigation.state]);

  return (
    <section
      className={`order-summary order-summary--${layout}`}
      aria-labelledby="order-summary-title"
    >
      <header className="order-summary__header">
        <h2 id="order-summary-title">Bestellübersicht</h2>
        <span>{quantity} Artikel</span>
      </header>

      <dl className="order-summary__prices">
        <div>
          <dt>Zwischensumme</dt>
          <dd>
            {subtotalAmount?.amount ? (
              <Money
                data={
                  subtotalAmount as NonNullable<
                    CartApiQueryFragment['cost']['subtotalAmount']
                  >
                }
              />
            ) : (
              '–'
            )}
          </dd>
        </div>
        <div>
          <dt>Versand</dt>
          <dd className="order-summary__shipping">An der Kasse</dd>
        </div>
        <div className="order-summary__total">
          <dt>Gesamtsumme</dt>
          <dd>
            {totalAmount?.amount ? (
              <Money
                data={
                  totalAmount as NonNullable<
                    CartApiQueryFragment['cost']['totalAmount']
                  >
                }
              />
            ) : (
              '–'
            )}
          </dd>
        </div>
      </dl>

      <div className="order-summary__codes">
        <DiscountCode
          discountCodes={cart?.discountCodes}
          validatedCodes={pricingQuote?.discountCodes}
        />
        <GiftCard cartId={cart?.id} giftCardCodes={cart?.appliedGiftCards} />
      </div>

      {checkoutMode === 'draft' ? (
        <>
          {cart?.appliedGiftCards?.length ? (
            <p className="order-summary__error">
              Geschenkkarten müssen im Shopify Checkout erneut eingegeben
              werden.
            </p>
          ) : null}
          <Form
            method="post"
            action={checkoutPath}
            onSubmit={(event) => {
              if (!claimConfiguredCheckoutSubmission(checkoutSubmissionLock)) {
                event.preventDefault();
                return;
              }
              setCheckoutSubmissionClaimed(true);
            }}
          >
            <button
              className="order-summary__checkout"
              type="submit"
              disabled={configuredCheckoutPending}
              aria-busy={configuredCheckoutPending || undefined}
            >
              {configuredCheckoutPending ? 'Bitte warten' : 'Zur Kasse'}
            </button>
          </Form>
        </>
      ) : checkoutMode === 'native' && cart?.checkoutUrl ? (
        <a className="order-summary__checkout" href={cart.checkoutUrl}>
          Zur Kasse
        </a>
      ) : (
        <p className="order-summary__error" role="alert">
          Der Checkout ist für diesen Warenkorb derzeit nicht verfügbar. Bitte
          prüfen Sie die Produktkonfiguration.
        </p>
      )}
    </section>
  );
}

function DiscountCode({
  discountCodes,
  validatedCodes,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
  validatedCodes?: string[];
}) {
  const appliedCodes =
    validatedCodes ??
    discountCodes?.filter(({applicable}) => applicable).map(({code}) => code) ??
    [];
  const hasInvalidCode = validatedCodes
    ? Boolean(discountCodes?.some(({code}) => !validatedCodes.includes(code)))
    : Boolean(discountCodes?.some(({applicable}) => !applicable));

  return (
    <div className="order-summary__code-group">
      <label htmlFor="discount-code">Rabattcode</label>

      {appliedCodes.map((code) => (
        <DiscountForm
          key={code}
          discountCodes={appliedCodes.filter((item) => item !== code)}
        >
          {(fetcher) => (
            <AppliedCode
              label={code}
              pending={fetcher.state !== 'idle'}
              removeLabel={`Rabattcode ${code} entfernen`}
            />
          )}
        </DiscountForm>
      ))}

      <DiscountForm discountCodes={appliedCodes}>
        {(fetcher) => {
          const pending = fetcher.state !== 'idle';
          const error = hasInvalidCode || hasErrors(fetcher.data);

          return (
            <>
              <div className="order-summary__code-input">
                <input
                  id="discount-code"
                  name="discountCode"
                  type="text"
                  placeholder="Code eingeben"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  aria-invalid={error || undefined}
                  aria-describedby={error ? 'discount-code-error' : undefined}
                />
                <button type="submit" disabled={pending}>
                  {pending ? 'Bitte warten' : 'Einlösen'}
                </button>
              </div>
              {error ? (
                <p id="discount-code-error" className="order-summary__error">
                  Dieser Rabattcode ist nicht gültig.
                </p>
              ) : null}
            </>
          );
        }}
      </DiscountForm>
    </div>
  );
}

function DiscountForm({
  discountCodes,
  children,
}: {
  discountCodes: string[];
  children: (fetcher: CartFetcher) => ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{discountCodes}}
    >
      {children}
    </CartForm>
  );
}

function GiftCard({
  cartId,
  giftCardCodes,
}: {
  cartId?: string | null;
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedCode = useRef<string | null>(null);
  const fetcher = useFetcher({key: 'gift-card-add'});
  const storageKey = getGiftCardStorageKey(cartId);
  const [storedCodes, setStoredCodes] = useState<string[]>([]);

  useEffect(() => {
    setStoredCodes(getPersistedGiftCardCodes(storageKey, giftCardCodes));
  }, [giftCardCodes, storageKey]);

  useEffect(() => {
    const code = fetcher.formData?.get('giftCardCode');
    if (fetcher.state !== 'idle' && typeof code === 'string' && code.trim()) {
      submittedCode.current = code.replace(/\s/g, '');
    }
  }, [fetcher.formData, fetcher.state]);

  useEffect(() => {
    if (
      fetcher.state !== 'idle' ||
      !fetcher.data ||
      !submittedCode.current ||
      hasErrors(fetcher.data)
    ) {
      return;
    }

    const code = submittedCode.current;
    const applied = giftCardCodes?.some((giftCard) =>
      code.endsWith(giftCard.lastCharacters),
    );
    if (!applied) return;

    setStoredCodes(rememberGiftCardCode(storageKey, code));
    submittedCode.current = null;
    if (inputRef.current) inputRef.current.value = '';
  }, [fetcher.data, fetcher.state, giftCardCodes, storageKey]);

  return (
    <div className="order-summary__code-group">
      <label htmlFor="gift-card-code">Geschenkkarte</label>

      {giftCardCodes?.map((giftCard) => (
        <RemoveGiftCardForm key={giftCard.id} giftCardId={giftCard.id}>
          {(removeFetcher) => (
            <AppliedCode
              label={`•••• ${giftCard.lastCharacters}`}
              amount={<Money data={giftCard.amountUsed} />}
              pending={removeFetcher.state !== 'idle'}
              removeLabel={`Geschenkkarte mit der Endung ${giftCard.lastCharacters} entfernen`}
            />
          )}
        </RemoveGiftCardForm>
      ))}

      <GiftCardForm giftCardCodes={storedCodes}>
        {(formFetcher) => {
          const pending = formFetcher.state !== 'idle';
          const error = hasErrors(formFetcher.data);

          return (
            <>
              <div className="order-summary__code-input">
                <input
                  id="gift-card-code"
                  name="giftCardCode"
                  type="text"
                  placeholder="Code eingeben"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  ref={inputRef}
                  aria-invalid={error || undefined}
                  aria-describedby={error ? 'gift-card-error' : undefined}
                />
                <button type="submit" disabled={pending}>
                  {pending ? 'Bitte warten' : 'Einlösen'}
                </button>
              </div>
              {error ? (
                <p id="gift-card-error" className="order-summary__error">
                  Die Geschenkkarte konnte nicht eingelöst werden.
                </p>
              ) : null}
            </>
          );
        }}
      </GiftCardForm>
    </div>
  );
}

function GiftCardForm({
  giftCardCodes,
  children,
}: {
  giftCardCodes: string[];
  children: (fetcher: CartFetcher) => ReactNode;
}) {
  return (
    <CartForm
      fetcherKey="gift-card-add"
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesUpdate}
      inputs={{giftCardCodes}}
    >
      {children}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  children,
}: {
  giftCardId: string;
  children: (fetcher: CartFetcher) => ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{giftCardCodes: [giftCardId]}}
    >
      {children}
    </CartForm>
  );
}

function AppliedCode({
  label,
  amount,
  pending,
  removeLabel,
}: {
  label: string;
  amount?: ReactNode;
  pending: boolean;
  removeLabel: string;
}) {
  return (
    <div className="order-summary__applied-code">
      <span>
        <strong>{label}</strong>
        {amount}
      </span>
      <button type="submit" disabled={pending} aria-label={removeLabel}>
        {pending ? 'Wird entfernt' : 'Entfernen'}
      </button>
    </div>
  );
}
