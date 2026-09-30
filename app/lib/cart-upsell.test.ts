import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CartUpsellCard,
  type CartUpsellProduct,
} from '~/components/CartUpsellCard';
import {createTranslator} from '~/i18n';
import {DEFAULT_LOCALE} from '~/lib/locale';
import {formatLocaleCurrency} from '~/lib/locale-format';
import {
  getCartUpsellButtonState,
  getCartUpsellSelectorLabel,
  getCartUpsellVariantLabel,
  resolveCartUpsellVariant,
  type CartUpsellVariant,
} from './cart-upsell';

const formMock = vi.hoisted(() => ({capture: vi.fn(), state: 'idle'}));

vi.mock('~/i18n/useTranslation', () => ({
  useTranslation: () => ({
    locale: DEFAULT_LOCALE,
    t: createTranslator(DEFAULT_LOCALE),
  }),
}));

vi.mock('~/lib/i18n-router', () => ({
  Link: ({to, children}: {to: string; children: ReactNode}) =>
    createElement('a', {href: to}, children),
  usePrefixPathWithLocale: (path: string) => path,
}));

vi.mock('@shopify/hydrogen', async (importOriginal) => {
  const original = await importOriginal<typeof import('@shopify/hydrogen')>();
  return {
    ...original,
    CartForm: Object.assign(
      ({
        children,
        ...props
      }: {
        children: (fetcher: {state: string}) => ReactNode;
        route: string;
        action: string;
        inputs: unknown;
      }) => {
        formMock.capture(props);
        return createElement('form', null, children({state: formMock.state}));
      },
      {ACTIONS: original.CartForm.ACTIONS},
    ),
  };
});

const variants: CartUpsellVariant[] = [
  {
    id: 'gid://shopify/ProductVariant/1',
    title: '2.5 Kg',
    availableForSale: false,
    price: {amount: '12.50', currencyCode: 'EUR'},
    selectedOptions: [{name: 'Größe', value: '2.5 Kg'}],
  },
  {
    id: 'gid://shopify/ProductVariant/2',
    title: '5 Kg',
    availableForSale: true,
    price: {amount: '20.00', currencyCode: 'EUR'},
    selectedOptions: [{name: 'Größe', value: '5 Kg'}],
  },
  {
    id: 'gid://shopify/ProductVariant/3',
    title: '10 Kg',
    availableForSale: true,
    price: {amount: '35.00', currencyCode: 'EUR'},
    selectedOptions: [{name: 'Größe', value: '10 Kg'}],
  },
];

const product: CartUpsellProduct = {
  id: 'gid://shopify/Product/1',
  handle: 'accessory',
  title: 'Accessory',
  image: null,
  variants,
};
const t = createTranslator(DEFAULT_LOCALE);
const render = (products = [product]) =>
  renderToStaticMarkup(createElement(CartUpsellCard, {products}));

beforeEach(() => {
  formMock.capture.mockClear();
  formMock.state = 'idle';
});

describe('cart upsell variant selection', () => {
  it('initially selects the first Shopify variant even when it is unavailable', () => {
    const selected = resolveCartUpsellVariant(variants, null);
    expect(selected).toBe(variants[0]);
    expect(selected?.price.amount).toBe('12.50');
    expect(getCartUpsellButtonState(selected)).toEqual({
      disabled: true,
      labelKey: 'product.unavailable',
    });
  });

  it.each([
    [1, '20.00'],
    [2, '35.00'],
  ] as const)(
    'resolves explicit selection %s to its own price, availability, and cart ID',
    (index, amount) => {
      const selected = resolveCartUpsellVariant(variants, variants[index].id);
      expect(selected?.id).toBe(variants[index].id);
      expect(selected?.price.amount).toBe(amount);
      expect(getCartUpsellButtonState(selected)).toEqual({
        disabled: false,
        labelKey: 'product.addToCart',
      });
    },
  );

  it('allows returning to the unavailable variant and never substitutes an available one', () => {
    for (const id of [variants[1].id, variants[2].id, variants[0].id]) {
      expect(resolveCartUpsellVariant(variants, id)?.id).toBe(id);
    }
    const updated = variants.map((variant) => ({
      ...variant,
      availableForSale: false,
    }));
    expect(resolveCartUpsellVariant(updated, variants[1].id)).toBe(updated[1]);
  });

  it('uses current product data and falls back in Shopify order for a removed or foreign ID', () => {
    expect(resolveCartUpsellVariant(variants, 'removed')).toBe(variants[0]);
    expect(resolveCartUpsellVariant([], variants[1].id)).toBeNull();
    const updated = variants.map((variant) => ({
      ...variant,
      price: {amount: '99.00', currencyCode: 'EUR'},
    }));
    expect(
      resolveCartUpsellVariant(updated, variants[1].id)?.price.amount,
    ).toBe('99.00');
  });

  it('disables submission while adding', () => {
    expect(getCartUpsellButtonState(variants[1], true)).toEqual({
      disabled: true,
      labelKey: 'cart.adding',
    });
    expect(getCartUpsellButtonState(null)).toEqual({
      disabled: true,
      labelKey: 'product.unavailable',
    });
  });

  it('derives option names and complete variant values without creating combinations', () => {
    expect(getCartUpsellSelectorLabel(variants, 'Variant')).toBe('Größe');
    expect(variants.map(getCartUpsellVariantLabel)).toEqual([
      '2.5 Kg',
      '5 Kg',
      '10 Kg',
    ]);
    const multi = {
      ...variants[1],
      selectedOptions: [
        {name: 'Color', value: 'Red'},
        {name: 'Size', value: 'Large'},
      ],
    };
    expect(getCartUpsellVariantLabel(multi)).toBe('Red / Large');
    expect(getCartUpsellSelectorLabel([multi], 'Variant')).toBe('Color / Size');
    expect(getCartUpsellVariantLabel({...multi, title: 'Default Title'})).toBe(
      'Red / Large',
    );
    expect(getCartUpsellVariantLabel({...multi, selectedOptions: []})).toBe(
      '5 Kg',
    );
    expect(
      getCartUpsellVariantLabel({
        ...multi,
        selectedOptions: [
          {name: 'Title', value: 'Default Title'},
          {name: 'Size', value: 'Large'},
        ],
      }),
    ).toBe('Large');
    expect(
      getCartUpsellSelectorLabel([{...multi, selectedOptions: []}], 'Variante'),
    ).toBe('Variante');
  });
});

describe('cart upsell rendered cards and CartForm contract', () => {
  it('renders all variants, keeps the unavailable option selectable, and associates the label', () => {
    const html = render();
    expect(html).toContain('<article');
    expect(html.match(/<option /g)).toHaveLength(3);
    expect(html).toContain(`value="${variants[0].id}" selected=""`);
    expect(html).toContain(`2.5 Kg — ${t('product.unavailable')}`);
    expect(html).not.toMatch(/<option[^>]*disabled/);
    expect(html).toContain(
      formatLocaleCurrency('12.50', 'EUR', DEFAULT_LOCALE),
    );
    expect(html).toMatch(/<button[^>]*disabled=""/);
    const selectId = html.match(/<select[^>]*id="([^"]+)"/)?.[1];
    expect(selectId).toBeTruthy();
    expect(html).toContain(`for="${selectId}"`);
    expect(html).toContain('>Größe</label>');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<select/);
    expect(html).toContain('href="/products/accessory"');
  });

  it.each([1, 2])(
    'renders available variant %s with its price and exact accessory LinesAdd input',
    (index) => {
      const variant = variants[index];
      const html = render([{...product, variants: [variant]}]);
      expect(html).not.toContain('<select');
      expect(html).not.toMatch(/<button[^>]*disabled/);
      expect(html).toContain(t('product.addToCart'));
      expect(html).toContain(
        formatLocaleCurrency(variant.price.amount, 'EUR', DEFAULT_LOCALE),
      );
      expect(formMock.capture).toHaveBeenLastCalledWith({
        route: '/cart',
        action: 'LinesAdd',
        inputs: {lines: [{merchandiseId: variant.id, quantity: 1}]},
      });
    },
  );

  it('keeps a single unavailable variant visible with its own price', () => {
    const html = render([{...product, variants: [variants[0]]}]);
    expect(html).toContain('<article');
    expect(html).not.toContain('<select');
    expect(html).toContain(
      formatLocaleCurrency('12.50', 'EUR', DEFAULT_LOCALE),
    );
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain(t('product.unavailable'));
  });

  it('keeps a product with zero variants visible and cannot submit a cart line', () => {
    const html = render([{...product, variants: []}]);
    expect(html).toContain('<article');
    expect(html).not.toContain('<select');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain(t('product.unavailable'));
    expect(formMock.capture).not.toHaveBeenCalled();
  });

  it('renders the localized pending state with an actually disabled button', () => {
    formMock.state = 'submitting';
    const html = render([{...product, variants: [variants[1]]}]);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain(t('cart.adding'));
  });

  it('gives each card its own selector ID and initial variant', () => {
    const html = render([
      product,
      {...product, id: 'other-product', variants: [variants[2], variants[1]]},
    ]);
    const ids = [...html.matchAll(/<select[^>]*id="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(
      formMock.capture.mock.calls.map(
        ([props]) => props.inputs.lines[0].merchandiseId,
      ),
    ).toEqual([variants[0].id, variants[2].id]);
  });
});
