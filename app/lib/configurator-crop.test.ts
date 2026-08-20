import {describe, expect, it} from 'vitest';
import {createNormalizedCropRatio} from '~/components/Configurator';
import {createConfiguratorPayload} from '~/lib/configurator-pricing';

describe('configurator crop conversion', () => {
  it('keeps independently rounded image-edge crops inside payload bounds', () => {
    const crop = createNormalizedCropRatio({
      x: 500.5,
      y: 250.5,
      width: 499.5,
      height: 749.5,
      imageWidth: 1000,
      imageHeight: 1000,
    });

    expect(crop.x + crop.w).toBe(1);
    expect(crop.y + crop.h).toBe(1);
    expect(
      createConfiguratorPayload({
        widthCm: 200,
        heightCm: 250,
        crop,
        masterAssetId: 'asset-1',
      }),
    ).not.toBeNull();
  });
});
