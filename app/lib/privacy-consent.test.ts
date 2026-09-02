import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {allowsThirdPartyTracking} from '~/lib/customer-privacy';

const APP_ROOT = new URL('../', import.meta.url);

function readAppFile(relativePath: string) {
  return readFileSync(new URL(relativePath, APP_ROOT), 'utf8');
}

describe('storefront privacy consent contract', () => {
  it('enables Shopify native privacy with authoritative runtime configuration', () => {
    const source = readAppFile('root.tsx');

    expect(source).toMatch(/withPrivacyBanner:\s*true/);
    expect(source).toMatch(/checkoutDomain:\s*env\.PUBLIC_CHECKOUT_DOMAIN/);
    expect(source).toMatch(
      /storefrontAccessToken:\s*env\.PUBLIC_STOREFRONT_API_TOKEN/,
    );
    expect(source).toMatch(
      /country:\s*args\.context\.storefront\.i18n\.country/,
    );
    expect(source).toMatch(
      /language:\s*args\.context\.storefront\.i18n\.language/,
    );
    expect(source).toMatch(
      /<Analytics\.Provider[\s\S]*?consent=\{data\.consent\}[\s\S]*?>/,
    );
    expect(source).not.toMatch(/<Analytics\.Provider[^>]*\bcanTrack=/);
  });

  it('requires both Shopify analytics and marketing consent for Google Maps', () => {
    const analyticsProcessingAllowed = vi.fn();
    const marketingAllowed = vi.fn();

    expect(
      allowsThirdPartyTracking({
        analyticsProcessingAllowed: () => false,
        marketingAllowed: () => true,
      }),
    ).toBe(false);
    expect(
      allowsThirdPartyTracking({
        analyticsProcessingAllowed: () => true,
        marketingAllowed: () => false,
      }),
    ).toBe(false);

    analyticsProcessingAllowed.mockReturnValue(true);
    marketingAllowed.mockReturnValue(true);
    expect(
      allowsThirdPartyTracking({
        analyticsProcessingAllowed,
        marketingAllowed,
      }),
    ).toBe(true);
  });

  it('keeps the existing Google Maps iframe behind Shopify consent state', () => {
    const source = readAppFile('components/kontakt.tsx');

    expect(source).toMatch(/allowsThirdPartyTracking\(privacyApi\)/);
    expect(source).toMatch(/if \(hasTrackingConsent\)[\s\S]*?<iframe/);
    expect(source).toMatch(/privacyBanner[\s\S]*?\.showPreferences\(\)/);
  });
});
