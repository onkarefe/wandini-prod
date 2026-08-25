import type {Translator} from '~/i18n';
import type {TranslationKey} from '~/i18n/de';
import type {SelectedLocale} from '~/lib/locale';
import {formatLocaleDate} from '~/lib/locale-format';

const FINANCIAL_STATUS_KEYS: Record<string, TranslationKey> = {
  AUTHORIZED: 'order.financial.AUTHORIZED',
  EXPIRED: 'order.financial.EXPIRED',
  PAID: 'order.financial.PAID',
  PARTIALLY_PAID: 'order.financial.PARTIALLY_PAID',
  PARTIALLY_REFUNDED: 'order.financial.PARTIALLY_REFUNDED',
  PENDING: 'order.financial.PENDING',
  REFUNDED: 'order.financial.REFUNDED',
  VOIDED: 'order.financial.VOIDED',
};

const FULFILLMENT_STATUS_KEYS: Record<string, TranslationKey> = {
  ACCEPTED: 'order.fulfillment.ACCEPTED',
  CANCELLED: 'order.fulfillment.CANCELLED',
  ERROR: 'order.fulfillment.ERROR',
  FAILURE: 'order.fulfillment.FAILURE',
  FULFILLED: 'order.fulfillment.FULFILLED',
  IN_PROGRESS: 'order.fulfillment.IN_PROGRESS',
  ON_HOLD: 'order.fulfillment.ON_HOLD',
  OPEN: 'order.fulfillment.OPEN',
  PARTIALLY_FULFILLED: 'order.fulfillment.PARTIALLY_FULFILLED',
  PENDING: 'order.fulfillment.PENDING',
  RESTOCKED: 'order.fulfillment.RESTOCKED',
  SCHEDULED: 'order.fulfillment.SCHEDULED',
  SUBMITTED: 'order.fulfillment.SUBMITTED',
  UNFULFILLED: 'order.fulfillment.UNFULFILLED',
};

function formatStatus(
  value: string | null | undefined,
  keys: Record<string, TranslationKey>,
  t: Translator,
) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const key = keys[normalized];
  return key ? t(key, undefined as never) : value;
}

export function formatFinancialStatus(
  value: string | null | undefined,
  t: Translator,
) {
  return formatStatus(value, FINANCIAL_STATUS_KEYS, t);
}

export function formatFulfillmentStatus(
  value: string | null | undefined,
  t: Translator,
) {
  return formatStatus(value, FULFILLMENT_STATUS_KEYS, t);
}

export function formatOrderDate(
  value: string | Date | null | undefined,
  locale: SelectedLocale,
  t: Translator,
) {
  if (!value) return t('order.dateUnavailable');

  return (
    formatLocaleDate(value, locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }) ?? t('order.dateUnavailable')
  );
}
