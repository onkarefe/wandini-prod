import type {Route} from './+types/[sitemap.xml]';
import {getSitemapIndex} from '@shopify/hydrogen';
import {
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from '~/lib/seo';

const SITEMAP_TYPES = [
  'products',
  'pages',
  'collections',
  'articles',
  'blogs',
] as const;

export async function loader({
  request,
  context: {storefront},
}: Route.LoaderArgs) {
  if (!SEO_ENABLED) {
    return new Response('Sitemap is disabled while SEO is closed.', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': SEO_DISABLED_ROBOTS_DIRECTIVE,
      },
    });
  }

  const response = await getSitemapIndex({
    storefront,
    request,
    types: [...SITEMAP_TYPES],
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}
