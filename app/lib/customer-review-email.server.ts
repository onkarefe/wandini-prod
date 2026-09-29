import {createTranslator} from '~/i18n';
import type {BrevoMessage} from '~/lib/brevo.server';
import type {
  ValidatedReviewPhoto,
  validateReviewFields,
} from '~/lib/customer-review.server';

type ReviewValues = ReturnType<typeof validateReviewFields>['value'];

export function escapeReviewEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function customerName(review: ReviewValues) {
  return [review.firstName, review.lastName].filter(Boolean).join(' ');
}

function photoBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  // Bound each argument list; a valid 5 MiB photo must not overflow the stack.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  }
  return btoa(chunks.join(''));
}

function emailHtml(locale: ReviewValues['locale'], content: string) {
  return `<!doctype html><html lang="${locale.toLowerCase()}"><body><h1>Wandini</h1>${content}</body></html>`;
}

export function buildInternalReviewEmail(
  review: ReviewValues,
  photo?: ValidatedReviewPhoto,
): BrevoMessage {
  const t = createTranslator({language: review.locale});
  const fields: Array<[string, string]> = [
    [t('account.firstName'), review.firstName],
    ...(review.lastName
      ? [[t('account.lastName'), review.lastName] as [string, string]]
      : []),
    [t('contact.emailAddress'), review.email],
    ...(review.phone
      ? [[t('contact.phoneNumber'), review.phone] as [string, string]]
      : []),
    [t('reviews.yourRating'), `${review.rating}/5`],
    [t('reviews.experience'), review.comment],
    [
      t('reviews.email.photo'),
      t(photo ? 'reviews.email.photoYes' : 'reviews.email.photoNo'),
    ],
  ];
  const message: BrevoMessage = {
    to: [{email: 'info@wandini.shop'}],
    replyTo: {email: review.email, name: customerName(review)},
    subject: t('reviews.email.internalSubject', {
      rating: review.rating,
      customerName: customerName(review),
    }),
    htmlContent: emailHtml(
      review.locale,
      fields
        .map(
          ([label, value]) =>
            `<p><strong>${escapeReviewEmailHtml(label)}:</strong><br>${escapeReviewEmailHtml(value).replace(/\r?\n/g, '<br>')}</p>`,
        )
        .join(''),
    ),
    textContent:
      'Wandini\n\n' +
      fields.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
  };
  if (photo) {
    const extension = photo.format === 'jpeg' ? 'jpg' : photo.format;
    message.attachment = [
      {
        content: photoBase64(photo.bytes),
        name: `customer-review.${extension}`,
      },
    ];
  }
  return message;
}

export function buildReviewAcknowledgement(review: ReviewValues): BrevoMessage {
  const t = createTranslator({language: review.locale});
  return {
    to: [{email: review.email, name: customerName(review)}],
    subject: t('reviews.email.acknowledgementSubject'),
    htmlContent: emailHtml(
      review.locale,
      `<p>${escapeReviewEmailHtml(t('reviews.success'))}</p>`,
    ),
    textContent: 'Wandini\n\n' + t('reviews.success'),
  };
}
