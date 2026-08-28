// Virtual entry point for the app
import {storefrontRedirect} from '@shopify/hydrogen';
import {createRequestHandler} from '@shopify/hydrogen/oxygen';
import {createHydrogenRouterContext} from '~/lib/context';
import {
  SEO_DISABLED_ROBOTS_DIRECTIVE,
  SEO_ENABLED,
} from '~/lib/seo';
import {isProductionSeoRequest} from '~/lib/canonical-origin';

function applySearchEnginePolicy(
  response: Response,
  request: Request,
  env: Env,
) {
  if (
    !isProductionSeoRequest({
      requestUrl: request.url,
      configuredOrigin: env.PUBLIC_CANONICAL_ORIGIN,
      seoEnabled: SEO_ENABLED,
    })
  ) {
    response.headers.set('X-Robots-Tag', SEO_DISABLED_ROBOTS_DIRECTIVE);
  }

  return response;
}

/**
 * Export a fetch handler in module format.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    try {
      const hydrogenContext = await createHydrogenRouterContext(
        request,
        env,
        executionContext,
      );

      /**
       * Create a Remix request handler and pass
       * Hydrogen's Storefront client to the loader context.
       */
      const handleRequest = createRequestHandler({
        // eslint-disable-next-line import/no-unresolved
        build: await import('virtual:react-router/server-build'),
        mode: process.env.NODE_ENV,
        getLoadContext: () => hydrogenContext,
      });

      const response = await handleRequest(request);

      if (hydrogenContext.session.isPending) {
        response.headers.set(
          'Set-Cookie',
          await hydrogenContext.session.commit(),
        );
      }

      if (response.status === 404) {
        /**
         * Check for redirects only when there's a 404 from the app.
         * If the redirect doesn't exist, then `storefrontRedirect`
         * will pass through the 404 response.
         */
        const redirectResponse = await storefrontRedirect({
          request,
          response,
          storefront: hydrogenContext.storefront,
        });

        return applySearchEnginePolicy(redirectResponse, request, env);
      }

      return applySearchEnginePolicy(response, request, env);
    } catch (error) {
      console.error(error);
      return applySearchEnginePolicy(
        new Response('An unexpected error occurred', {status: 500}),
        request,
        env,
      );
    }
  },
};
