import {sendBrevoEmail} from '~/lib/brevo.server';
import {
  buildInternalReviewEmail,
  buildReviewAcknowledgement,
} from '~/lib/customer-review-email.server';
import type {Route} from './+types/api.customer-review';
import {
  readReviewForm,
  validateReviewFields,
  validateReviewPhoto,
  type CustomerReviewActionData,
} from '~/lib/customer-review.server';

function reviewResponse(data: CustomerReviewActionData, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(status === 405 ? {Allow: 'POST'} : {}),
    },
  });
}

export function loader() {
  return reviewResponse({ok: false, fieldErrors: {_form: 'method'}}, 405);
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.method !== 'POST') return loader();
  const form = await readReviewForm(request);
  if (typeof form === 'string') {
    return reviewResponse(
      {ok: false, fieldErrors: {_form: form}},
      form === 'requestSize' ? 413 : form === 'contentType' ? 415 : 400,
    );
  }

  // Same response as legitimate success; trapped fields/photos are not validated.
  if (
    form
      .getAll('company')
      .some((value) => typeof value === 'string' && value.length > 0)
  ) {
    return reviewResponse({ok: true});
  }

  const allowedFields = new Set([
    'firstName',
    'lastName',
    'email',
    'phone',
    'rating',
    'comment',
    'photo',
    'company',
    'locale',
  ]);
  if (
    Array.from(form.keys()).some((key) => !allowedFields.has(key)) ||
    form.getAll('company').length > 1 ||
    form.getAll('company').some((value) => typeof value !== 'string')
  ) {
    return reviewResponse({ok: false, fieldErrors: {_form: 'malformed'}}, 400);
  }

  const {value, fieldErrors} = validateReviewFields(form);
  const photo = await validateReviewPhoto(form);
  const photoError = typeof photo === 'string' ? photo : undefined;
  if (photoError) fieldErrors.photo = photoError;
  if (Object.keys(fieldErrors).length) {
    return reviewResponse(
      {ok: false, fieldErrors},
      photoError === 'photoSize' ? 413 : 400,
    );
  }

  const apiKey = context.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    return reviewResponse({ok: false, fieldErrors: {_form: 'delivery'}}, 503);
  }

  const internalAccepted = await sendBrevoEmail(
    apiKey,
    buildInternalReviewEmail(
      value,
      typeof photo === 'string' ? undefined : photo,
    ),
  );
  if (!internalAccepted) {
    return reviewResponse({ok: false, fieldErrors: {_form: 'delivery'}}, 502);
  }

  // Acknowledgement is attempted only after acceptance; its failure cannot
  // turn an already delivered review into a failed storefront submission.
  await sendBrevoEmail(apiKey, buildReviewAcknowledgement(value));
  return reviewResponse({ok: true});
}
