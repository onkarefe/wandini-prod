import {describe, expect, it} from 'vitest';
import {
  hasExplicitProductOptionSelection,
  resolveInitialWallpaperVariant,
} from './wallpaper-variant-selection';

type TestVariant = {
  id: string;
  availableForSale: boolean;
};

const nativeVariant: TestVariant = {
  id: 'native',
  availableForSale: true,
};
const selbstklebendVariant: TestVariant = {
  id: 'selbstklebend',
  availableForSale: true,
};

const options = [
  {
    name: 'Quality',
    optionValues: [
      {
        name: 'Selbstklebend',
        firstSelectableVariant: selbstklebendVariant,
      },
    ],
  },
];

describe('wallpaper initial variant selection', () => {
  it('uses Selbstklebend when no product option was selected', () => {
    expect(
      resolveInitialWallpaperVariant(options, nativeVariant, false),
    ).toBe(selbstklebendVariant);
  });

  it('never overrides an explicit customer or configurator selection', () => {
    expect(resolveInitialWallpaperVariant(options, nativeVariant, true)).toBe(
      nativeVariant,
    );
  });

  it('falls back to the Shopify variant when Selbstklebend is missing', () => {
    expect(resolveInitialWallpaperVariant([], nativeVariant, false)).toBe(
      nativeVariant,
    );
  });

  it('falls back to the Shopify variant when Selbstklebend is unavailable', () => {
    const unavailableOptions = [
      {
        name: 'Quality',
        optionValues: [
          {
            name: 'Selbstklebend',
            firstSelectableVariant: {
              ...selbstklebendVariant,
              availableForSale: false,
            },
          },
        ],
      },
    ];

    expect(
      resolveInitialWallpaperVariant(
        unavailableOptions,
        nativeVariant,
        false,
      ),
    ).toBe(nativeVariant);
  });

  it('ignores tracking parameters but detects real product options', () => {
    expect(
      hasExplicitProductOptionSelection(options, [
        {name: 'utm_source'},
        {name: 'Quality'},
      ]),
    ).toBe(true);
    expect(
      hasExplicitProductOptionSelection(options, [{name: 'utm_source'}]),
    ).toBe(false);
  });
});
