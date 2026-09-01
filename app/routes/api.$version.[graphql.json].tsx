import type {Route} from './+types/api.$version.[graphql.json]';
import {parse, visit} from 'graphql';

const SHOPIFY_API_VERSION_PATTERN = /^(unstable|\d{4}-\d{2})$/;
const MAX_GRAPHQL_BODY_BYTES = 128 * 1024;

function hasAllowedContentType(contentType: string | null) {
  const mimeType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return mimeType === 'application/json';
}

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getGraphqlQueries(value: unknown): string[] | null {
  const operations = Array.isArray(value) ? value : [value];
  if (!operations.length) return null;

  const queries = operations.map((operation) =>
    operation &&
    typeof operation === 'object' &&
    'query' in operation &&
    typeof operation.query === 'string'
      ? operation.query
      : null,
  );

  return queries.every((query): query is string => query !== null)
    ? queries
    : null;
}

function containsCheckoutOperation(query: string) {
  let blocked = false;

  visit(parse(query), {
    Field(node) {
      const fieldName = node.name.value;
      if (
        fieldName === 'checkoutUrl' ||
        fieldName.startsWith('checkout') ||
        fieldName === 'cartPrepareForCompletion' ||
        fieldName === 'cartSubmitForCompletion'
      ) {
        blocked = true;
      }
    },
  });

  return blocked;
}

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

  if (!hasTrustedOrigin(request)) {
    return new Response('Invalid request origin', {status: 403});
  }

  const requestHeaders = new Headers();
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');

  if (!hasAllowedContentType(contentType)) {
    return new Response('Unsupported media type', {status: 415});
  }

  requestHeaders.set('content-type', 'application/json');

  if (accept) {
    requestHeaders.set('accept', accept);
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_GRAPHQL_BODY_BYTES
  ) {
    return new Response('Request body is too large', {status: 413});
  }

  const requestBody = await request.arrayBuffer();

  if (requestBody.byteLength > MAX_GRAPHQL_BODY_BYTES) {
    return new Response('Request body is too large', {status: 413});
  }

  let queries: string[] | null;
  try {
    queries = getGraphqlQueries(
      JSON.parse(new TextDecoder().decode(requestBody)) as unknown,
    );
    if (!queries) {
      return new Response('Invalid GraphQL request', {status: 400});
    }
    if (queries.some(containsCheckoutOperation)) {
      return new Response(
        'Checkout operations are not available through this API',
        {status: 403},
      );
    }
  } catch {
    return new Response('Invalid GraphQL request', {status: 400});
  }

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
    'X-Content-Type-Options': 'nosniff',
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
