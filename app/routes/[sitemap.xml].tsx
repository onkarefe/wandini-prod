import type {Route} from './+types/[sitemap.xml]';
import {getSitemapIndex} from '@shopify/hydrogen';
import {
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from '~/lib/seo';
import {
  buildCanonicalRequestUrl,
  isProductionSeoRequest,
} from '~/lib/canonical-origin';
import {
  buildArticleSitemapChildPaths,
  loadArticleSitemapPageCount,
} from '~/lib/sitemap.server';

const SITEMAP_TYPES = [
  'products',
  'pages',
  'collections',
  'blogs',
] as const;

export async function loader({
  request,
  context: {storefront, env},
}: Route.LoaderArgs) {
  const isProductionRequest = isProductionSeoRequest({
    requestUrl: request.url,
    configuredOrigin: env.PUBLIC_CANONICAL_ORIGIN,
    seoEnabled: SEO_ENABLED,
  });

  if (!isProductionRequest) {
    return new Response('Sitemap is disabled while SEO is closed.', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': SEO_DISABLED_ROBOTS_DIRECTIVE,
      },
    });
  }

  const canonicalRequest = new Request(
    buildCanonicalRequestUrl(request.url, env.PUBLIC_CANONICAL_ORIGIN),
    request,
  );

  const articlePageCount = await loadArticleSitemapPageCount(storefront);
  const articleSitemaps = buildArticleSitemapChildPaths(articlePageCount);
  const response = await getSitemapIndex({
    storefront,
    request: canonicalRequest,
    types: [...SITEMAP_TYPES],
    customChildSitemaps: articleSitemaps,
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}
