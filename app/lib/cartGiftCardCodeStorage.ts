import type { CartApiQueryFragment } from 'storefrontapi.generated';

type AppliedGiftCards = CartApiQueryFragment['appliedGiftCards'];

type StoredGiftCardCode = {
  code: string;
  lastCharacters: string;
};

const DEFAULT_STORAGE_KEY = 'cart-gift-card-codes';

function canUseSessionStorage() {
  return (
    typeof window !== 'undefined' &&
    typeof window.sessionStorage !== 'undefined'
  );
}

function isStoredGiftCardCode(entry: unknown): entry is StoredGiftCardCode {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'code' in entry &&
    'lastCharacters' in entry &&
    typeof entry.code === 'string' &&
    typeof entry.lastCharacters === 'string'
  );
}

function readStoredGiftCardCodes(storageKey: string): StoredGiftCardCode[] {
  if (!canUseSessionStorage()) {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isStoredGiftCardCode);
  } catch {
    return [];
  }
}

function writeStoredGiftCardCodes(
  storageKey: string,
  entries: StoredGiftCardCode[],
) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // Ignore storage write failures and fall back to current request only.
  }
}

export function getGiftCardStorageKey(cartId?: string | null) {
  return cartId ? `${DEFAULT_STORAGE_KEY}:${cartId}` : DEFAULT_STORAGE_KEY;
}

export function normalizeGiftCardCode(code: string) {
  return code.replace(/\s/g, '');
}

export function getPersistedGiftCardCodes(
  storageKey: string,
  appliedGiftCards: AppliedGiftCards | undefined,
) {
  const storedEntries = readStoredGiftCardCodes(storageKey);

  if (!appliedGiftCards?.length) {
    writeStoredGiftCardCodes(storageKey, []);
    return [];
  }

  const appliedLastCharacters = new Set(
    appliedGiftCards.map((giftCard) => giftCard.lastCharacters),
  );

  const matchedEntries = storedEntries.filter((entry) =>
    appliedLastCharacters.has(entry.lastCharacters),
  );

  writeStoredGiftCardCodes(storageKey, matchedEntries);

  return matchedEntries.map((entry) => entry.code);
}

export function rememberGiftCardCode(storageKey: string, code: string) {
  const formattedCode = normalizeGiftCardCode(code);

  if (!formattedCode) {
    return readStoredGiftCardCodes(storageKey).map((entry) => entry.code);
  }

  const storedEntries = readStoredGiftCardCodes(storageKey);

  if (storedEntries.some((entry) => entry.code === formattedCode)) {
    return storedEntries.map((entry) => entry.code);
  }

  const nextEntries = [
    ...storedEntries,
    {
      code: formattedCode,
      lastCharacters: formattedCode.slice(-4),
    },
  ];

  writeStoredGiftCardCodes(storageKey, nextEntries);

  return nextEntries.map((entry) => entry.code);
}
