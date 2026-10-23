import {beforeEach, describe, expect, it, vi} from 'vitest';
import server from '../../server';
import {SEO_DISABLED_ROBOTS_DIRECTIVE} from './seo';

const mocks = vi.hoisted(() => ({
  handleRequest: vi.fn(),
  createContext: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@shopify/hydrogen/oxygen', () => ({
  createRequestHandler: () => mocks.handleRequest,
}));
vi.mock('@shopify/hydrogen', () => ({storefrontRedirect: mocks.redirect}));
vi.mock('~/lib/context', () => ({
  createHydrogenRouterContext: mocks.createContext,
}));
vi.mock('virtual:react-router/server-build', () => ({}));

const origin = 'https://production.example';
const html =
  '<!doctype html><html><head><meta name="robots" content="index,follow"></head><body>Storefront</body></html>';

beforeEach(() => {
  mocks.createContext
    .mockReset()
    .mockResolvedValue({session: {isPending: false}, storefront: {}});
  mocks.handleRequest.mockReset().mockImplementation(
    async () =>
      new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': "default-src 'self'",
          'Set-Cookie': 'existing=1; HttpOnly',
        },
      }),
  );
  mocks.redirect.mockReset().mockImplementation(async ({response}) => response);
});

function fetchPage(
  requestOrigin: string,
  configuredOrigin: string | undefined = origin,
) {
  return server.fetch(
    new Request(`${requestOrigin}/en/products/example`),
    {
      PUBLIC_CANONICAL_ORIGIN: configuredOrigin,
    } as Env,
    {} as ExecutionContext,
  );
}

describe('server response indexing protection', () => {
  it.each([
    'http://localhost:3000',
    'https://preview.oxygen.example',
    'https://staging.example',
    'https://alternate.example',
    'http://production.example',
  ])(
    'protects indexable route HTML on %s without changing the stream or headers',
    async (requestOrigin) => {
      const response = await fetchPage(requestOrigin);
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Robots-Tag')).toBe(
        SEO_DISABLED_ROBOTS_DIRECTIVE,
      );
      expect(response.headers.get('Content-Security-Policy')).toBe(
        "default-src 'self'",
      );
      expect(response.headers.get('Set-Cookie')).toBe('existing=1; HttpOnly');
      expect(await response.text()).toBe(html);
    },
  );

  it.each([
    '',
    'not-an-origin',
    'http://production.example',
    `${origin}/path`,
    `${origin}?query=1`,
    `${origin}#fragment`,
    'https://user:password@production.example',
  ])(
    'fails closed with canonical configuration %s',
    async (configuredOrigin) => {
      expect(
        (await fetchPage(origin, configuredOrigin)).headers.get('X-Robots-Tag'),
      ).toBe(SEO_DISABLED_ROBOTS_DIRECTIVE);
    },
  );

  it('fails closed when canonical configuration is absent', async () => {
    const response = await server.fetch(
      new Request(origin),
      {} as Env,
      {} as ExecutionContext,
    );
    expect(response.headers.get('X-Robots-Tag')).toBe(
      SEO_DISABLED_ROBOTS_DIRECTIVE,
    );
  });

  it('does not add a noindex header to eligible production HTML', async () => {
    const response = await fetchPage(origin);
    expect(response.status).toBe(200);
    expect(response.headers.has('X-Robots-Tag')).toBe(false);
    expect(await response.text()).toBe(html);
  });

  it('preserves private response policies on production', async () => {
    mocks.handleRequest.mockResolvedValue(
      new Response('Private', {headers: {'X-Robots-Tag': 'noindex,nofollow'}}),
    );
    expect((await fetchPage(origin)).headers.get('X-Robots-Tag')).toBe(
      'noindex,nofollow',
    );
  });

  it('preserves pending session cookies and redirect status', async () => {
    mocks.createContext.mockResolvedValue({
      session: {isPending: true, commit: async () => 'session=1; HttpOnly'},
    });
    mocks.handleRequest.mockResolvedValue(
      new Response(null, {status: 302, headers: {Location: '/account/login'}}),
    );
    const response = await fetchPage('https://preview.oxygen.example');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/account/login');
    expect(response.headers.get('Set-Cookie')).toBe('session=1; HttpOnly');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('protects the response returned by Shopify 404 redirect resolution', async () => {
    mocks.handleRequest.mockResolvedValue(
      new Response('Missing', {status: 404}),
    );
    mocks.redirect.mockResolvedValue(
      new Response(null, {status: 301, headers: {Location: '/replacement'}}),
    );
    const response = await fetchPage('https://preview.oxygen.example');
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/replacement');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('protects unexpected error responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.createContext.mockRejectedValue(new Error('Unavailable'));
    const response = await fetchPage('https://preview.oxygen.example');
    expect(response.status).toBe(500);
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
  });
});
