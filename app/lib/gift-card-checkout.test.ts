import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createTranslator} from '~/i18n';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from '~/lib/locale';

const summarySource = readFileSync(
  fileURLToPath(
    new URL('../components/CustomCartSummary.tsx', import.meta.url),
  ),
  'utf8',
);

describe('gift-card checkout presentation', () => {
  it('keeps Storefront gift-card controls only on native checkout', () => {
    expect(summarySource).toMatch(
      /checkoutMode === 'native'[\s\S]*?<GiftCard[\s\S]*?checkoutMode === 'draft'[\s\S]*?<DraftGiftCardNotice/,
    );

    const giftCardControls = summarySource.slice(
      summarySource.indexOf('function GiftCard({'),
      summarySource.indexOf('function GiftCardForm({'),
    );
    expect(giftCardControls).toContain('giftCard.amountUsed');
    expect(giftCardControls).toContain('gift-card-code');
    expect(summarySource).toContain('CartForm.ACTIONS.GiftCardCodesUpdate');
    expect(summarySource).toContain('CartForm.ACTIONS.GiftCardCodesRemove');
  });

  it('never presents a Storefront-applied value as applied to Draft checkout', () => {
    const draftNotice = summarySource.slice(
      summarySource.indexOf('function DraftGiftCardNotice({'),
      summarySource.indexOf('function GiftCard({'),
    );

    expect(draftNotice).toContain('giftCardDraftCheckoutNotice');
    expect(draftNotice).toContain('giftCardDraftReentryNotice');
    expect(draftNotice).not.toMatch(
      /amountUsed|lastCharacters|<Money|GiftCardForm|CartForm/,
    );
  });

  it('explains Shopify Draft checkout redemption in German and English', () => {
    const de = createTranslator(GERMAN_LOCALE);
    const en = createTranslator(ENGLISH_LOCALE);

    expect(de('cart.giftCardDraftCheckoutNotice')).toBe(
      'Geschenkkarten können nach dem Fortfahren im Shopify Checkout eingelöst werden.',
    );
    expect(de('cart.giftCardDraftReentryNotice')).toBe(
      'Im Warenkorb eingegebene Geschenkkarten werden nicht übertragen. Geben Sie den Code nach dem Fortfahren im Shopify Checkout erneut ein.',
    );
    expect(en('cart.giftCardDraftCheckoutNotice')).toBe(
      'Redeem gift cards in Shopify Checkout after continuing.',
    );
    expect(en('cart.giftCardDraftReentryNotice')).toBe(
      "Gift cards entered in this cart aren't transferred. Enter the code again in Shopify Checkout after continuing.",
    );
  });
});
