export const CHECKOUT_PROOF_ATTRIBUTE = '_wandini_checkout_proof';
export const CHECKOUT_PROOF_VERSION = 'v1';
export const CHECKOUT_PROOF_CURRENCY = 'EUR';

const DECIMAL_MONEY_PATTERN = /^\d+(?:\.(\d+))?$/;

export type CheckoutProofErrorCode =
  | 'INVALID_SECRET'
  | 'INVALID_CLAIM'
  | 'INVALID_QUANTITY'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY';

export class CheckoutProofError extends Error {
  code: CheckoutProofErrorCode;

  constructor(code: CheckoutProofErrorCode, message: string) {
    super(message);
    this.name = 'CheckoutProofError';
    this.code = code;
  }
}

export type CheckoutProofInput = {
  variantId: string;
  instanceId: string;
  payload: string;
  quantity: number;
  amount: string;
  currencyCode: string;
};

export type CheckoutProofResult = {
  payloadHash: string;
  unitMinor: string;
  canonical: string;
  signature: string;
  proof: string;
};

export function assertCheckoutGuardSecret(value: string | undefined): string {
  if (
    !value ||
    value.length < 32 ||
    value.length > 128 ||
    /[^\x21-\x7e]/.test(value)
  ) {
    throw new CheckoutProofError(
      'INVALID_SECRET',
      'The checkout proof secret is not configured correctly.',
    );
  }
  return value;
}

export function parseEurMinorUnits(amount: string): string {
  const match = DECIMAL_MONEY_PATTERN.exec(amount);
  if (!match || match[0] !== amount) {
    throw new CheckoutProofError(
      'INVALID_AMOUNT',
      'The configured checkout amount is invalid.',
    );
  }

  const fraction = match[1] ?? '';
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) {
    throw new CheckoutProofError(
      'INVALID_AMOUNT',
      'The configured checkout amount has unsupported precision.',
    );
  }

  const whole = amount.split('.')[0];
  const cents = `${fraction}00`.slice(0, 2);
  return (BigInt(whole) * 100n + BigInt(cents)).toString();
}

export async function createCheckoutProof(
  input: CheckoutProofInput,
  secretValue: string | undefined,
): Promise<CheckoutProofResult> {
  const secret = assertCheckoutGuardSecret(secretValue);
  if (
    !input.variantId ||
    !input.instanceId ||
    typeof input.payload !== 'string'
  ) {
    throw new CheckoutProofError(
      'INVALID_CLAIM',
      'A configured checkout proof claim is invalid.',
    );
  }
  if (input.quantity !== 1) {
    throw new CheckoutProofError(
      'INVALID_QUANTITY',
      'Configured checkout proof quantity must be one.',
    );
  }
  if (input.currencyCode !== CHECKOUT_PROOF_CURRENCY) {
    throw new CheckoutProofError(
      'INVALID_CURRENCY',
      'Configured checkout proof currency must be EUR.',
    );
  }

  const payloadHash = await sha256Base64Url(input.payload);
  const unitMinor = parseEurMinorUnits(input.amount);
  const canonical = [
    CHECKOUT_PROOF_VERSION,
    utf8Base64Url(input.variantId),
    utf8Base64Url(input.instanceId),
    payloadHash,
    '1',
    unitMinor,
    input.currencyCode,
  ].join('.');
  const signature = await hmacSha256Base64Url(canonical, secret);

  return {
    payloadHash,
    unitMinor,
    canonical,
    signature,
    proof: `${canonical}.${signature}`,
  };
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return bytesBase64Url(new Uint8Array(digest));
}

async function hmacSha256Base64Url(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, utf8(value));
  return bytesBase64Url(new Uint8Array(signature));
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function utf8Base64Url(value: string) {
  return bytesBase64Url(utf8(value));
}

function bytesBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
