import {describe, expect, it} from 'vitest';
import {resolveMaterialVisual} from '~/components/ConfiguratorModal';

describe('configurator material identity', () => {
  it('classifies stable technical identities, not localized display titles', () => {
    expect(resolveMaterialVisual('selbstklebend')).toEqual({
      objectPosition: 'center bottom',
    });
    expect(resolveMaterialVisual('gid://shopify/Metaobject/selbstklebend')).toEqual({
      objectPosition: 'center bottom',
    });
    expect(resolveMaterialVisual('Self-adhesive wallpaper')).toBeNull();
  });
});
