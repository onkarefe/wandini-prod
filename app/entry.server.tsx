import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {
  createContentSecurityPolicy,
  type HydrogenRouterContextProvider,
} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  // Development ortamında localhost'a izin vermek için ekstra kaynaklar
  const localDevSources =
    process.env.NODE_ENV === 'development' ? ['http://localhost:*'] : [];

  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },

    // Google Fonts için style-src whitelist
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://cdn.shopify.com',
      'https://fonts.googleapis.com',
      ...localDevSources,
    ],

    // Google Fonts font dosyaları için
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com',
      'https://cdn.shopify.com',
      'data:',
    ],

    // IMG için (Configurator crop preview base64 data URL'leri)
    imgSrc: [
      "'self'",
      'data:', // canvas'tan gelen data:image/... URL'leri
      'blob:',
      'https://cdn.shopify.com',
      'https://shopify.com',
      ...localDevSources,
    ],

    // YouTube iframe embed için
    frameSrc: [
      "'self'",
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
    ],
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
        nonce={nonce}
      />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
