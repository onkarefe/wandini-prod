import {describe, expect, it} from 'vitest';
import {getCartLineDimensionText} from '~/lib/cart-line-dimensions';

const validPayload = JSON.stringify({
  version: 1,
  master_asset_id: 'gid://shopify/MediaImage/1',
  output: {unit: 'mm', width: 2005, height: 2500},
  crop_ratio: {x: 0, y: 0, w: 1, h: 1},
});

describe('getCartLineDimensionText', () => {
  it('formats the existing configurator output as centimetres', () => {
    expect(
      getCartLineDimensionText([
        {key: 'configurator_payload', value: validPayload},
      ]),
    ).toBe('200.5 cm x 250 cm');
  });

  it('does not expose dimensions without a valid configurator payload', () => {
    expect(getCartLineDimensionText(undefined)).toBeNull();
    expect(
      getCartLineDimensionText([
        {key: 'configurator_payload', value: '{invalid-json'},
      ]),
    ).toBeNull();
  });
});
