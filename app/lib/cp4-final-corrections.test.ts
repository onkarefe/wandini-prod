import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createTranslator} from '~/i18n';
import {
  ENGLISH_LOCALE,
  GERMAN_LOCALE,
  prefixPathWithLocale,
} from '~/lib/locale';
import {meta as favoritesMeta} from '~/routes/account.favorites';

const source = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('checkpoint 4 final corrections', () => {
  const de = createTranslator(GERMAN_LOCALE);
  const en = createTranslator(ENGLISH_LOCALE);

  it('localizes accessory wishlist login URLs without localizing resources', () => {
    const loginUrl = '/account/login?return_to=%2Fen%2Fproducts%2Fbrush';

    expect(prefixPathWithLocale(loginUrl, GERMAN_LOCALE)).toBe(loginUrl);
    expect(prefixPathWithLocale(loginUrl, ENGLISH_LOCALE)).toBe(
      '/en/account/login?return_to=%2Fen%2Fproducts%2Fbrush',
    );
    expect(prefixPathWithLocale('/api/wishlist', ENGLISH_LOCALE)).toBe(
      '/api/wishlist',
    );
    expect(
      prefixPathWithLocale('https://accounts.example/login', ENGLISH_LOCALE),
    ).toBe('https://accounts.example/login');
  });

  it('resolves every order-detail label in German and English', () => {
    expect([
      de('account.confirmationWithNumber', {number: 'ABC'}),
      de('account.openOrderStatus'),
      de('account.itemCount', {count: 2}),
      de('account.discount'),
      de('account.discountPercentage', {percent: 10}),
      de('account.subtotal'),
      de('account.tax'),
      de('account.total'),
      de('account.product'),
      de('account.quantity'),
      de('account.unitPrice'),
      de('account.sum'),
    ]).toEqual([
      'Bestätigung ABC',
      'Bestellstatus öffnen',
      '2 Artikel',
      'Rabatt',
      '-10% Rabatt',
      'Zwischensumme',
      'Steuer',
      'Gesamtsumme',
      'Produkt',
      'Menge',
      'Einzelpreis',
      'Summe',
    ]);
    expect([
      en('account.confirmationWithNumber', {number: 'ABC'}),
      en('account.openOrderStatus'),
      en('account.itemCount', {count: 2}),
      en('account.discount'),
      en('account.discountPercentage', {percent: 10}),
      en('account.subtotal'),
      en('account.tax'),
      en('account.total'),
      en('account.product'),
      en('account.quantity'),
      en('account.unitPrice'),
      en('account.sum'),
    ]).toEqual([
      'Confirmation ABC',
      'Open order status',
      '2 items',
      'Discount',
      '-10% discount',
      'Subtotal',
      'Tax',
      'Total',
      'Product',
      'Quantity',
      'Unit price',
      'Total',
    ]);
  });

  it('resolves checkout and favorites copy in both languages', () => {
    expect([
      de('cart.wait'),
      de('cart.checkout'),
      de('wishlist.title'),
    ]).toEqual(['Bitte warten', 'Zur Kasse', 'Favoriten']);
    expect([
      en('cart.wait'),
      en('cart.checkout'),
      en('wishlist.title'),
    ]).toEqual(['Please wait', 'Checkout', 'Favorites']);
    expect(
      favoritesMeta({data: {selectedLocale: GERMAN_LOCALE}} as never),
    ).toContainEqual({title: 'Favoriten'});
    expect(
      favoritesMeta({data: {selectedLocale: ENGLISH_LOCALE}} as never),
    ).toContainEqual({title: 'Favorites'});
  });

  it('resolves product and accessory loading copy in both languages', () => {
    expect([
      de('product.previousImage'),
      de('product.nextImage'),
      de('product.loading'),
      de('filters.updating'),
    ]).toEqual([
      'Vorheriges Produktbild',
      'Nächstes Produktbild',
      'Produkt wird geladen',
      'Produkte werden aktualisiert',
    ]);
    expect([
      en('product.previousImage'),
      en('product.nextImage'),
      en('product.loading'),
      en('filters.updating'),
    ]).toEqual([
      'Previous product image',
      'Next product image',
      'Product is loading',
      'Updating products',
    ]);
  });

  it('wires the corrected surfaces to typed translations', () => {
    const accessoryCard = source('../components/ZubehorProductCard.tsx');
    const orderDetail = source('../routes/account.orders.$id.tsx');
    const cartSummary = source('../components/CustomCartSummary.tsx');
    const favoritesRoute = source('../routes/account.favorites.tsx');
    const accountRoute = source('../routes/account.tsx');
    const productImage = source('../components/ProductImage.tsx');
    const productRoute = source('../routes/products.$handle.tsx');
    const accessoryCollection = source(
      '../components/ZubehorCollectionLayout.tsx',
    );

    expect(accessoryCard).toContain("fetcher.data?.loginUrl ?? ''");
    expect(accessoryCard).toContain('window.location.href = fetcherLoginUrl');
    expect(accessoryCard).not.toContain(
      'window.location.href = fetcher.data.loginUrl',
    );
    expect(accessoryCard).toContain("action: '/api/wishlist'");

    expect(orderDetail).not.toMatch(
      /Bestätigung|Bestellstatus öffnen|Artikel|Rabatt|Zwischensumme|Steuer|Gesamtsumme|data-label="(?:Produkt|Menge|Einzelpreis|Summe)"/,
    );
    expect(cartSummary).not.toMatch(/'Bitte warten'|'Zur Kasse'/);
    expect(favoritesRoute).not.toContain('Favoriten');
    expect(accountRoute).not.toContain('Favoriten');
    expect(productImage).not.toMatch(
      /Show previous product image|Show next product image/,
    );
    expect(productRoute).not.toContain('Produkt wird geladen');
    expect(accessoryCollection).not.toContain('Produkte werden aktualisiert');
  });
});
