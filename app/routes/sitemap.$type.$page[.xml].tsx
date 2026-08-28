import type {Route} from './+types/sitemap.$type.$page[.xml]';
import {
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from '~/lib/seo';
import {
  isProductionSeoRequest,
  normalizeCanonicalOrigin,
} from '~/lib/canonical-origin';
import {
  buildLocalizedSitemapXml,
  loadArticleSitemapEntries,
  loadLocalizedResourceSitemapEntries,
  type SitemapResourceType,
} from '~/lib/sitemap.server';

const RESOURCE_TYPES = new Set<SitemapResourceType>([
  'products',
  'collections',
  'pages',
  'blogs',
]);

function unavailableSitemapResponse() {
  return new Response('Sitemap is unavailable.', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': SEO_DISABLED_ROBOTS_DIRECTIVE,
    },
  });
}

export async function loader({
  request,
  params,
  context: {storefront, env},
}: Route.LoaderArgs) {
  const canonicalOrigin = normalizeCanonicalOrigin(
    env.PUBLIC_CANONICAL_ORIGIN,
  );
  const isProductionRequest = isProductionSeoRequest({
    requestUrl: request.url,
    configuredOrigin: canonicalOrigin,
    seoEnabled: SEO_ENABLED,
  });

  if (!isProductionRequest || !canonicalOrigin) {
    return unavailableSitemapResponse();
  }

  const page = Number.parseInt(params.page ?? '', 10);
  if (!Number.isInteger(page) || page < 1) {
    return unavailableSitemapResponse();
  }

  let entries;

  if (params.type === 'articles') {
    entries = await loadArticleSitemapEntries({storefront, page});
  } else if (RESOURCE_TYPES.has(params.type as SitemapResourceType)) {
    entries = await loadLocalizedResourceSitemapEntries({
      storefront,
      type: params.type as SitemapResourceType,
      page,
    });
  } else {
    return unavailableSitemapResponse();
  }

  return new Response(
    buildLocalizedSitemapXml({canonicalOrigin, entries}),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': `max-age=${60 * 60 * 24}`,
      },
    },
  );
}
