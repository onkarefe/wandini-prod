import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  action,
  loader,
  type NewsletterActionData,
} from '~/routes/api.newsletter';

const fetchMock = vi.fn<typeof fetch>();

function submit(
  email: string | null = 'reader@example.com',
  domain: string | undefined = 'newsletter-test.myshopify.com',
) {
  const body = new FormData();
  if (email !== null) body.set('email', email);
  return action({
    request: new Request('https://www.wandini.shop/api/newsletter', {
      method: 'POST',
      body,
    }),
    context: {env: {PUBLIC_STORE_DOMAIN: domain}},
  } as Parameters<typeof action>[0]);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, {status: 200}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('newsletter resource route', () => {
  it('returns only the typed success contract and forwards the native customer form', async () => {
    const response = await submit();
    const data = (await response.json()) as NewsletterActionData;
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(data).toEqual({ok: true});
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://newsletter-test.myshopify.com/contact');
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    });
    expect(options?.body).toBeInstanceOf(URLSearchParams);
    expect(Array.from((options?.body as URLSearchParams).entries())).toEqual([
      ['form_type', 'customer'],
      ['utf8', '✓'],
      ['contact[email]', 'reader@example.com'],
      ['contact[tags]', 'newsletter'],
    ]);
  });

  it('trims whitespace before forwarding and preserves email case and plus signs', async () => {
    await submit(' \tReader+news@example.com\n ');
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('contact[email]')).toBe('Reader+news@example.com');
    expect(body.toString()).toContain('Reader%2Bnews%40example.com');
  });

  it.each([null, '', ' \t\n '])(
    'rejects missing/empty email %j without fetching',
    async (email) => {
      const response = await submit(email);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        fieldErrors: {email: 'required'},
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'invalid',
    'reader@example',
    '@example.com',
    'reader@@example.com',
    'reader name@example.com',
    'reader@exa mple.com',
    `${'a'.repeat(243)}@example.com`,
  ])('rejects invalid/overlong email %j without fetching', async (email) => {
    const response = await submit(email);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      fieldErrors: {email: 'invalid'},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the 254-character boundary', async () => {
    const email = `${'a'.repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect((await submit(email)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'rejects %s with 405 and Allow: POST without reading a body or fetching',
    async (method) => {
      const response = await action({
        request: new Request('https://www.wandini.shop/api/newsletter', {
          method,
        }),
      } as Parameters<typeof action>[0]);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
      expect(await response.json()).toEqual({
        ok: false,
        error: 'method_not_allowed',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('returns 405 from the GET/HEAD resource loader', async () => {
    const response = loader();
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'method_not_allowed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles an unreadable form body as a generic invalid email', async () => {
    const response = await action({
      request: new Request('https://www.wandini.shop/api/newsletter', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: '{}',
      }),
    } as Parameters<typeof action>[0]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      fieldErrors: {email: 'invalid'},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'newsletter-test.myshopify.com',
    'https://newsletter-test.myshopify.com/old/path?x=1#form',
    'http://newsletter-test.myshopify.com/old/path?x=1#form',
    'https://user:password@newsletter-test.myshopify.com/old/path',
  ])('safely constructs HTTPS /contact from %s', async (domain) => {
    await submit('reader@example.com', domain);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://newsletter-test.myshopify.com/contact',
    );
  });

  it.each(['', 'not a valid domain', 'https://'])(
    'rejects bad store configuration %j',
    async (domain) => {
      const response = await submit('reader@example.com', domain);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'upstream_failure',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([400, 422, 429, 500, 503])(
    'hides upstream %s errors and bodies',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('Private Shopify response', {status}),
      );
      const response = await submit();
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'upstream_failure',
      });
    },
  );

  it('hides network exceptions', async () => {
    fetchMock.mockRejectedValue(new Error('Private upstream details'));
    const response = await submit();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'upstream_failure',
    });
  });

  it.each(['challenge', 'password', 'en/challenge'])(
    'rejects a 200 redirect to /%s',
    async (path) => {
      const upstream = new Response(null, {status: 200});
      Object.defineProperty(upstream, 'url', {
        value: `https://newsletter-test.myshopify.com/${path}`,
      });
      fetchMock.mockResolvedValue(upstream);
      const response = await submit();
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'upstream_failure',
      });
    },
  );

  it('keeps accepted existing and new addresses indistinguishable', async () => {
    for (const body of ['Accepted', 'Already subscribed']) {
      fetchMock.mockResolvedValue(new Response(body, {status: 200}));
      const response = await submit();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ok: true});
    }
  });

  it('aborts a stalled Shopify request after ten seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          );
        }),
    );
    const result = submit();
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await result;
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'upstream_failure',
    });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
