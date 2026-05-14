import type {Route} from './+types/[sitemap-similar-products.xml]';
import {getSimilarProductsSitemapEntries} from '~/lib/similar-products';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(entries: ReturnType<typeof getSimilarProductsSitemapEntries>) {
  const urls = entries
    .map((entry) => {
      const lastModifiedTag = entry.lastModified
        ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>`
        : '';

      return `<url><loc>${escapeXml(entry.url)}</loc>${lastModifiedTag}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const entries = getSimilarProductsSitemapEntries(url.origin);
  const body = buildSitemapXml(entries);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `max-age=${60 * 15}`,
    },
  });
}
