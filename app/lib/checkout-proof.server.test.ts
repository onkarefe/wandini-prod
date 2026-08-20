import {describe, expect, it} from 'vitest';
import {
  CheckoutProofError,
  assertCheckoutGuardSecret,
  createCheckoutProof,
  parseEurMinorUnits,
} from '~/lib/checkout-proof.server';

const FIXTURE_SECRET = 'wandini-checkpoint-4a-fixture-secret-2026';
const FIXTURE_INPUT = {
  variantId: 'gid://shopify/ProductVariant/9876543210',
  instanceId: '550e8400-e29b-41d4-a716-446655440000',
  payload:
    '{\u0022width_cm\u0022:250,\u0022height_cm\u0022:240,\u0022crop\u0022:\u0022center\u0022}',
  quantity: 1,
  amount: '144.45',
  currencyCode: 'EUR',
};
const FIXTURE_HASH = 'BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA';
const FIXTURE_CANONICAL =
  'v1.Z2lkOi8vc2hvcGlmeS9Qcm9kdWN0VmFyaWFudC85ODc2NTQzMjEw.NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAw.BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA.1.14445.EUR';
const FIXTURE_HMAC = 'kJItHGdvBL01EhxN-lTX7phPxF_2QGRKrRE6kzLsu18';

describe('checkout proof v1', () => {
  it('reproduces the fixed Checkpoint 4A interoperability vector', async () => {
    const result = await createCheckoutProof(FIXTURE_INPUT, FIXTURE_SECRET);

    expect(result).toEqual({
      payloadHash: FIXTURE_HASH,
      unitMinor: '14445',
      canonical: FIXTURE_CANONICAL,
      signature: FIXTURE_HMAC,
      proof: `${FIXTURE_CANONICAL}.${FIXTURE_HMAC}`,
    });
  });

  it('hashes the exact original payload UTF-8 string', async () => {
    const alteredWhitespace =
      '{ \u0022width_cm\u0022:250,\u0022height_cm\u0022:240,\u0022crop\u0022:\u0022center\u0022 }';
    const exact = await createCheckoutProof(FIXTURE_INPUT, FIXTURE_SECRET);
    const altered = await createCheckoutProof(
      {...FIXTURE_INPUT, payload: alteredWhitespace},
      FIXTURE_SECRET,
    );

    expect(altered.payloadHash).not.toBe(exact.payloadHash);
    expect(altered.proof).not.toBe(exact.proof);
  });

  it.each([
    ['144.45', '14445'],
    ['144.450', '14445'],
    ['28.89', '2889'],
    ['0', '0'],
    ['001.20', '120'],
  ])('parses %s into exact EUR minor units', (amount, expected) => {
    expect(parseEurMinorUnits(amount)).toBe(expected);
  });

  it.each([
    '1e2',
    '-1',
    '+1',
    '1.',
    '.25',
    '1.001',
    '1.2301',
    '144.45\n',
    'not-money',
  ])('rejects malformed or unsupported money %s', (amount) => {
    expect(() => parseEurMinorUnits(amount)).toThrowError(
      expect.objectContaining({code: 'INVALID_AMOUNT'}),
    );
  });

  it.each([
    undefined,
    '',
    '   ',
    'short',
    'x'.repeat(31),
    'x'.repeat(129),
    `${'x'.repeat(32)}\n`,
    `${'x'.repeat(31)}\u007f`,
  ])('rejects an invalid checkout proof secret', (secret) => {
    expect(() => assertCheckoutGuardSecret(secret)).toThrowError(
      expect.objectContaining({code: 'INVALID_SECRET'}),
    );
  });

  it('accepts only 32-128 printable non-whitespace ASCII characters', () => {
    expect(assertCheckoutGuardSecret('!'.repeat(32))).toBe('!'.repeat(32));
    expect(assertCheckoutGuardSecret('~'.repeat(128))).toBe('~'.repeat(128));
  });

  it('rejects incompatible currency and quantity claims', async () => {
    await expect(
      createCheckoutProof(
        {...FIXTURE_INPUT, currencyCode: 'USD'},
        FIXTURE_SECRET,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_CURRENCY',
    } satisfies Partial<CheckoutProofError>);
    await expect(
      createCheckoutProof({...FIXTURE_INPUT, quantity: 2}, FIXTURE_SECRET),
    ).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    } satisfies Partial<CheckoutProofError>);
  });
});
