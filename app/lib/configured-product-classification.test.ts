import {describe, expect, it} from 'vitest';
import {
  CONFIGURED_PRODUCT_CLASSIFICATION,
  classifyConfiguredProduct,
  classifyConfiguredProductMetafields,
} from '~/lib/configured-product-classification';

const printQuality = {
  __typename: 'Metaobject',
  id: 'gid://shopify/Metaobject/1',
};

describe('authoritative configured-product classification', () => {
  it('classifies neither Shopify signal as ordinary', () => {
    expect(
      classifyConfiguredProduct({
        masterAssetId: null,
        printQualityReference: null,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.ORDINARY);
  });

  it('classifies both Shopify signals as configured', () => {
    expect(
      classifyConfiguredProduct({
        masterAssetId: 'asset-1',
        printQualityReference: printQuality,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.CONFIGURED);
  });

  it('rejects a product with only master_asset_id', () => {
    expect(
      classifyConfiguredProduct({
        masterAssetId: 'asset-1',
        printQualityReference: null,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
  });

  it('rejects a product with only print_quality', () => {
    expect(
      classifyConfiguredProduct({
        masterAssetId: null,
        printQualityReference: printQuality,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
  });

  it('fails closed when either Shopify classification field was not fetched', () => {
    expect(
      classifyConfiguredProduct({
        masterAssetId: undefined,
        printQualityReference: null,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
    expect(
      classifyConfiguredProduct({
        masterAssetId: null,
        printQualityReference: undefined,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
  });

  it('fails closed for present but malformed Shopify metafields', () => {
    expect(
      classifyConfiguredProductMetafields({
        masterAssetMetafield: {value: null},
        printQualityMetafield: null,
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
    expect(
      classifyConfiguredProductMetafields({
        masterAssetMetafield: null,
        printQualityMetafield: {reference: null},
      }),
    ).toBe(CONFIGURED_PRODUCT_CLASSIFICATION.INVALID);
  });
});
