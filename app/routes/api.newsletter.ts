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

// Keep this tiny URL normalizer local so Kontakt/FAQ behavior stays unchanged.
function getShopifyContactUrl(domain: string | undefined) {
  if (!domain) return null;

  try {
    const url = new URL(
      domain.startsWith('http://') || domain.startsWith('https://')
        ? domain
        : `https://${domain}`,
    );
    url.protocol = 'https:';
    url.username = '';
    url.password = '';
    url.pathname = '/contact';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
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

  const contactUrl = getShopifyContactUrl(context.env.PUBLIC_STORE_DOMAIN);
  if (!contactUrl) {
    return newsletterResponse({ok: false, error: 'upstream_failure'}, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        form_type: 'customer',
        utf8: '✓',
        'contact[email]': email,
        'contact[tags]': 'newsletter',
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    // A redirect to an interactive challenge/password page is not acceptance.
    const blockedRedirect =
      response.url &&
      /\/(?:challenge|password)(?:\/|$)/.test(new URL(response.url).pathname);
    if (!response.ok || blockedRedirect) {
      return newsletterResponse({ok: false, error: 'upstream_failure'}, 502);
    }

    // Never inspect or disclose whether the address already exists.
    return newsletterResponse({ok: true});
  } catch {
    return newsletterResponse({ok: false, error: 'upstream_failure'}, 502);
  } finally {
    clearTimeout(timeout);
  }
}
