const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: 'Autorisiert',
  EXPIRED: 'Abgelaufen',
  PAID: 'Bezahlt',
  PARTIALLY_PAID: 'Teilweise bezahlt',
  PARTIALLY_REFUNDED: 'Teilweise erstattet',
  PENDING: 'Ausstehend',
  REFUNDED: 'Erstattet',
  VOIDED: 'Storniert',
};

const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Angenommen',
  CANCELLED: 'Storniert',
  ERROR: 'Fehlgeschlagen',
  FAILURE: 'Fehlgeschlagen',
  FULFILLED: 'Versendet',
  IN_PROGRESS: 'In Bearbeitung',
  ON_HOLD: 'Zurückgestellt',
  OPEN: 'Offen',
  PARTIALLY_FULFILLED: 'Teilweise versendet',
  PENDING: 'Ausstehend',
  RESTOCKED: 'Wiedereingelagert',
  SCHEDULED: 'Geplant',
  SUBMITTED: 'Eingereicht',
  SUCCESS: 'Versendet',
  UNFULFILLED: 'Noch nicht versendet',
};

function getGermanStatusLabel(
  status: string | null | undefined,
  labels: Record<string, string>,
) {
  if (!status) return null;
  return labels[status.toUpperCase()] ?? 'Unbekannt';
}

export function formatGermanFinancialStatus(status?: string | null) {
  return getGermanStatusLabel(status, FINANCIAL_STATUS_LABELS);
}

export function formatGermanFulfillmentStatus(status?: string | null) {
  return getGermanStatusLabel(status, FULFILLMENT_STATUS_LABELS);
}

export function formatGermanOrderDate(
  value: string | Date | null | undefined,
) {
  if (!value) return 'Datum nicht verfügbar';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Datum nicht verfügbar';

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
