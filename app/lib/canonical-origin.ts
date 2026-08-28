export function normalizeCanonicalOrigin(value?: string | null) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function buildCanonicalRequestUrl(
  input: string | URL,
  configuredOrigin?: string | null,
) {
  const inputUrl = new URL(input);
  const canonicalOrigin = normalizeCanonicalOrigin(configuredOrigin);

  if (!canonicalOrigin) return inputUrl.toString();

  const canonicalUrl = new URL(inputUrl.pathname + inputUrl.search, canonicalOrigin);
  canonicalUrl.hash = inputUrl.hash;
  return canonicalUrl.toString();
}

export function isCanonicalOriginRequest(
  input: string | URL,
  configuredOrigin?: string | null,
) {
  const canonicalOrigin = normalizeCanonicalOrigin(configuredOrigin);
  if (!canonicalOrigin) return false;

  try {
    return new URL(input).origin === canonicalOrigin;
  } catch {
    return false;
  }
}

export function isProductionSeoRequest({
  requestUrl,
  configuredOrigin,
  seoEnabled,
}: {
  requestUrl: string | URL;
  configuredOrigin?: string | null;
  seoEnabled: boolean;
}) {
  return (
    seoEnabled && isCanonicalOriginRequest(requestUrl, configuredOrigin)
  );
}
