import {subscribeToNewsletter} from '~/lib/newsletter.server';
import {ShopifyAdminError} from '~/lib/shopify-admin.server';
import type {Route} from './+types/api.newsletter';

export type NewsletterActionData =
  | {ok: true}
  | {
      ok: false;
      fieldErrors?: {email?: 'required' | 'invalid'};
      error?: 'method_not_allowed' | 'upstream_failure';
    };

function newsletterResponse(data: NewsletterActionData, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(status === 405 ? {Allow: 'POST'} : {}),
    },
  });
}

export function loader() {
  return newsletterResponse({ok: false, error: 'method_not_allowed'}, 405);
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.method !== 'POST') return loader();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return newsletterResponse(
      {ok: false, fieldErrors: {email: 'invalid'}},
      400,
    );
  }

  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    return newsletterResponse(
      {ok: false, fieldErrors: {email: 'required'}},
      400,
    );
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return newsletterResponse(
      {ok: false, fieldErrors: {email: 'invalid'}},
      400,
    );
  }

  try {
    await subscribeToNewsletter(context.env, email);
    return newsletterResponse({ok: true});
  } catch (error) {
    const status =
      error instanceof ShopifyAdminError && error.code === 'CONFIGURATION_ERROR'
        ? 503
        : 502;
    return newsletterResponse({ok: false, error: 'upstream_failure'}, status);
  }
}
