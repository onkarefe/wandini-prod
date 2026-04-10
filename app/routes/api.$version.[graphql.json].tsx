import type {Route} from './+types/api.$version.[graphql.json]';

const SHOPIFY_API_VERSION_PATTERN = /^(unstable|\d{4}-\d{2})$/;

export async function action({params, context, request}: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  const version = params.version ?? '';

  if (!SHOPIFY_API_VERSION_PATTERN.test(version)) {
    return new Response('Invalid API version', {status: 400});
  }

  const checkoutDomain = context.env.PUBLIC_CHECKOUT_DOMAIN;

  if (!checkoutDomain) {
    return new Response('Checkout API is unavailable', {status: 503});
  }

  const requestHeaders = new Headers();
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');

  if (contentType) {
    requestHeaders.set('content-type', contentType);
  }

  if (accept) {
    requestHeaders.set('accept', accept);
  }

  const requestBody = await request.arrayBuffer();

  let response: Response;

  try {
    response = await fetch(
      `https://${checkoutDomain}/api/${version}/graphql.json`,
      {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
      },
    );
  } catch {
    return new Response('Checkout API request failed', {status: 502});
  }

  const responseHeaders = new Headers({
    'Cache-Control': 'no-store',
  });
  const responseContentType = response.headers.get('content-type');

  if (responseContentType) {
    responseHeaders.set('content-type', responseContentType);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
