import type {Route} from './+types/[robots.txt]';
import {
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from '~/lib/seo';
import {
  isProductionSeoRequest,
  normalizeCanonicalOrigin,
} from '~/lib/canonical-origin';

const DISABLED_ROBOTS_BODY = 'User-agent: *\nDisallow: /\n';

const ENABLED_DISALLOW_PATHS = [
  '/admin',
  '/cart',
  '/en/cart',
  '/account',
  '/en/account',
  '/checkout',
  '/en/checkout',
  '/checkouts/',
  '/orders',
  '/api/',
] as const;

export function buildRobotsTxt({
  seoEnabled,
  canonicalOrigin,
}: {
  seoEnabled: boolean;
  canonicalOrigin?: string | null;
}) {
  const normalizedOrigin = normalizeCanonicalOrigin(canonicalOrigin);

  if (!seoEnabled || !normalizedOrigin) return DISABLED_ROBOTS_BODY;

  const disallowRules = ENABLED_DISALLOW_PATHS.map(
    (path) => `Disallow: ${path}`,
  ).join('\n');

  return `User-agent: *
${disallowRules}

Sitemap: ${normalizedOrigin}/sitemap.xml
`;
}

export async function loader({request, context}: Route.LoaderArgs) {
  const isProductionRequest = isProductionSeoRequest({
    requestUrl: request.url,
    configuredOrigin: context.env.PUBLIC_CANONICAL_ORIGIN,
    seoEnabled: SEO_ENABLED,
  });
  const body = buildRobotsTxt({
    seoEnabled: isProductionRequest,
    canonicalOrigin: context.env.PUBLIC_CANONICAL_ORIGIN,
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': isProductionRequest
        ? `max-age=${60 * 60 * 24}`
        : 'no-store',
      ...(!isProductionRequest
        ? {'X-Robots-Tag': SEO_DISABLED_ROBOTS_DIRECTIVE}
        : {}),
    },
  });
}
