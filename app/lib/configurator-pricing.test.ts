import {describe, expect, it} from 'vitest';
import {
  addMoneyAmounts,
  calculateConfiguredWallpaperPrice,
  calculateConfiguratorAreaM2,
  parseConfiguratorPayload,
  resolveConfiguratorPricePerM2,
} from '~/lib/configurator-pricing';

describe('configured wallpaper pricing', () => {
  it('calculates the accepted totals for 100 × 100 and 200 × 250 cm', () => {
    expect(calculateConfiguratorAreaM2(100, 100)).toBe(1);
    expect(
      calculateConfiguredWallpaperPrice({
        pricePerM2: '28.89',
        widthMm: 1000,
        heightMm: 1000,
        currencyCode: 'EUR',
      }),
    ).toEqual({amount: '28.89', currencyCode: 'EUR'});
    expect(
      calculateConfiguredWallpaperPrice({
        pricePerM2: '28.89',
        widthMm: 2000,
        heightMm: 2500,
        currencyCode: 'EUR',
      }),
    ).toEqual({amount: '144.45', currencyCode: 'EUR'});
  });

  it('uses integer arithmetic and currency half-up rounding', () => {
    expect(
      calculateConfiguredWallpaperPrice({
        pricePerM2: '19.995',
        widthMm: 1000,
        heightMm: 1000,
        currencyCode: 'EUR',
      }),
    ).toEqual({amount: '20.00', currencyCode: 'EUR'});
    expect(
      calculateConfiguredWallpaperPrice({
        pricePerM2: '28.89',
        widthMm: 1234,
        heightMm: 2345,
        currencyCode: 'EUR',
      }),
    ).toEqual({amount: '83.60', currencyCode: 'EUR'});
  });

  it('uses Shopify native variant price as the per-m² price', () => {
    expect(resolveConfiguratorPricePerM2('31.50')).toBe('31.50');
    expect(resolveConfiguratorPricePerM2('28.89')).toBe('28.89');
    expect(resolveConfiguratorPricePerM2('0')).toBeNull();
  });

  it('validates production payloads strictly', () => {
    const valid = JSON.stringify({
      version: 1,
      master_asset_id: 'asset-1',
      output: {unit: 'mm', width: 2000, height: 2500},
      crop_ratio: {x: 0, y: 0.1, w: 1, h: 0.8},
    });
    expect(parseConfiguratorPayload(valid)?.output.width).toBe(2000);
    expect(
      parseConfiguratorPayload(valid.replace('2500', '3120'))?.output.height,
    ).toBe(3120);
    expect(parseConfiguratorPayload(valid.replace('2500', '3121'))).toBeNull();
    expect(parseConfiguratorPayload(valid.replace('2500', '-1'))).toBeNull();
    expect(
      parseConfiguratorPayload(valid.replace('"w":1', '"w":1.1')),
    ).toBeNull();
    expect(parseConfiguratorPayload('{not-json')).toBeNull();
  });

  it('aggregates money only when currencies match', () => {
    expect(
      addMoneyAmounts([
        {amount: '144.45', currencyCode: 'EUR'},
        {amount: '12.00', currencyCode: 'EUR'},
      ]),
    ).toEqual({amount: '156.45', currencyCode: 'EUR'});
    expect(
      addMoneyAmounts([
        {amount: '1.00', currencyCode: 'EUR'},
        {amount: '1.00', currencyCode: 'USD'},
      ]),
    ).toBeNull();
  });
});
