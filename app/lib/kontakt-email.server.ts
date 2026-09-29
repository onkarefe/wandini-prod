import {createTranslator} from '~/i18n';
import type {BrevoMessage} from '~/lib/brevo.server';
import type {SelectedLocale} from '~/lib/locale';

type KontaktSubmission = {
  fullName: string;
  email: string;
  phone: string;
  message: string;
};
type KontaktLocale = Pick<SelectedLocale, 'language'>;

const EMAIL_COPY = {
  DE: {
    internalSubject: 'Neue Kontaktanfrage',
    acknowledgementSubject: 'Wir haben deine Nachricht erhalten',
    acknowledgementBody:
      'Vielen Dank für deine Nachricht. Wir haben sie erhalten und werden sie prüfen.',
  },
  EN: {
    internalSubject: 'New contact request',
    acknowledgementSubject: 'We received your message',
    acknowledgementBody:
      'Thank you for your message. We received it and will review it.',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailHtml(locale: KontaktLocale, content: string) {
  return `<!doctype html><html lang="${locale.language.toLowerCase()}"><body><h1>Wandini</h1>${content}</body></html>`;
}

// Call only with the existing action's trimmed, validated submission.
export function buildInternalKontaktEmail(
  submission: KontaktSubmission,
  locale: KontaktLocale,
): BrevoMessage {
  const t = createTranslator(locale);
  const fields: Array<[string, string]> = [
    [t('contact.fullName'), submission.fullName],
    [t('contact.emailAddress'), submission.email],
    [t('contact.phoneNumber'), submission.phone],
    [t('contact.message'), submission.message],
  ];
  return {
    to: [{email: 'info@wandini.shop'}],
    replyTo: {email: submission.email, name: submission.fullName},
    subject: `${EMAIL_COPY[locale.language].internalSubject} – ${submission.fullName}`,
    textContent:
      'Wandini\n\n' +
      fields.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
    htmlContent: emailHtml(
      locale,
      fields
        .map(
          ([label, value]) =>
            `<p><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>`,
        )
        .join(''),
    ),
  };
}

export function buildKontaktAcknowledgement(
  submission: KontaktSubmission,
  locale: KontaktLocale,
): BrevoMessage {
  const copy = EMAIL_COPY[locale.language];
  return {
    to: [{email: submission.email, name: submission.fullName}],
    subject: copy.acknowledgementSubject,
    textContent: 'Wandini\n\n' + copy.acknowledgementBody,
    htmlContent: emailHtml(
      locale,
      `<p>${escapeHtml(copy.acknowledgementBody)}</p>`,
    ),
  };
}
