import type {Route} from './+types/[sitemap-similar-products.xml]';

export async function loader(_: Route.LoaderArgs) {
  return new Response('Similar products sitemap is gone.', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}
