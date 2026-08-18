import {describe, expect, it} from 'vitest';
import {
  calculateCartDisplaySubtotal,
  getCartLineDisplayTotal,
  isConfiguredCartLine,
  resolveConfiguredCartLine,
  type CartLinePricingLike,
} from '~/lib/cart-pricing';

function configuredLine(instanceId = 'configuration-1'): CartLinePricingLike {
  return {
    id: instanceId,
    quantity: 1,
    attributes: [
      {
        key: 'configurator_payload',
        value: JSON.stringify({
          version: 1,
          master_asset_id: 'asset-1',
          output: {unit: 'mm', width: 2000, height: 2500},
          crop_ratio: {x: 0, y: 0, w: 1, h: 1},
        }),
      },
      {key: 'configurator_instance_id', value: instanceId},
    ],
    cost: {
      subtotalAmount: {amount: '0.29', currencyCode: 'EUR'},
      totalAmount: {amount: '0.29', currencyCode: 'EUR'},
    },
    merchandise: {
      id: 'gid://shopify/ProductVariant/1',
      price: {amount: '0.29', currencyCode: 'EUR'},
      printQuality: {
        reference: {pricePerM2: {value: '28.89'}},
      },
    },
  };
}

function ordinaryLine(
  id: string,
  quantity: number,
  total: string,
): CartLinePricingLike {
  return {
    id,
    quantity,
    attributes: [],
    cost: {
      subtotalAmount: {amount: total, currencyCode: 'EUR'},
      totalAmount: {amount: total, currencyCode: 'EUR'},
    },
    merchandise: {id: `gid://shopify/ProductVariant/${id}`},
  };
}

describe('configured cart pricing', () => {
  it('classifies and prices a configured line independently of catalog cost', () => {
    const line = configuredLine();
    expect(isConfiguredCartLine(line)).toBe(true);
    expect(resolveConfiguredCartLine(line)?.payload.output.width).toBe(2000);
    expect(getCartLineDisplayTotal(line)).toEqual({
      amount: '144.45',
      currencyCode: 'EUR',
    });
  });

  it('aggregates a wallpaper, two adhesive products, and one tool set', () => {
    const lines = [
      configuredLine(),
      ordinaryLine('2', 2, '24.00'),
      ordinaryLine('3', 1, '18.50'),
    ];
    expect(calculateCartDisplaySubtotal(lines)).toEqual({
      amount: '186.95',
      currencyCode: 'EUR',
    });
    expect(lines.map(({quantity}) => quantity)).toEqual([1, 2, 1]);
  });

  it('keeps different configurations as separately priced physical lines', () => {
    const first = configuredLine('configuration-1');
    const second = configuredLine('configuration-2');
    expect(calculateCartDisplaySubtotal([first, second])).toEqual({
      amount: '288.90',
      currencyCode: 'EUR',
    });
  });

  it('does not fall back to the tiny catalog amount for malformed configuration', () => {
    const line = configuredLine();
    line.attributes![0].value = '{}';
    expect(isConfiguredCartLine(line)).toBe(true);
    expect(getCartLineDisplayTotal(line)).toBeNull();
    expect(
      calculateCartDisplaySubtotal([line, ordinaryLine('2', 1, '12.00')]),
    ).toBeNull();
  });
});
