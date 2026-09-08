import {describe, expect, it} from 'vitest';
import {
  isSeamlessMaterialIdentity,
  resolveMaterialVisual,
} from '~/components/ConfiguratorModal';
import {calculatePreviewPanelWidths} from '~/components/ConfigratorScene2';

describe('configurator material identity', () => {
  it('classifies stable technical identities, not localized display titles', () => {
    expect(resolveMaterialVisual('selbstklebend')).toEqual({
      objectPosition: 'center bottom',
    });
    expect(
      resolveMaterialVisual('gid://shopify/Metaobject/selbstklebend'),
    ).toEqual({
      objectPosition: 'center bottom',
    });
    expect(resolveMaterialVisual('Self-adhesive wallpaper')).toBeNull();
  });

  it('treats only the airtex-exklusiv technical identity as seamless', () => {
    expect(isSeamlessMaterialIdentity('airtex-exklusiv')).toBe(true);
    expect(isSeamlessMaterialIdentity(' AIRTEX-EXKLUSIV ')).toBe(true);
    expect(isSeamlessMaterialIdentity('airtex')).toBe(false);
    expect(isSeamlessMaterialIdentity('Nahtlos')).toBe(false);
  });

  it('keeps seamless previews free of panel divisions', () => {
    expect(calculatePreviewPanelWidths(210, true)).toEqual([]);
    expect(calculatePreviewPanelWidths(210, false)).toEqual([70, 70, 70]);
  });
});
