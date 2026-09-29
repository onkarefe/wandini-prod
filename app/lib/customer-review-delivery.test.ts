import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {action} from '~/routes/api.customer-review';
import {escapeReviewEmailHtml} from '~/lib/customer-review-email.server';
import type {BrevoMessage} from '~/lib/brevo.server';

const TEST_KEY = 'fake-review-key-for-mocked-fetch-only';
const fetchMock = vi.fn<typeof fetch>();
const deliveryError = {ok: false, fieldErrors: {_form: 'delivery'}};
type Payload = BrevoMessage & {sender: {name: string; email: string}};

function form(overrides: Record<string, string | null> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    firstName: ' Anna ',
    lastName: ' Example ',
    email: ' ANNA+Review@EXAMPLE.COM ',
    phone: ' +49 123 ',
    rating: ' 4 ',
    comment: ' A lovely room.\nThank you! ',
    locale: 'DE',
    company: '',
    ...overrides,
  })) {
    if (value !== null) body.set(key, value);
  }
  return body;
}

async function submit(
  body = form(),
  env: Partial<Env> = {BREVO_API_KEY: TEST_KEY},
  headers?: HeadersInit,
) {
  return action({
    request: new Request('https://example.com/api/customer-review', {
      method: 'POST',
      body,
      headers,
    }),
    context: {env},
  } as Parameters<typeof action>[0]);
}

function payload(index: number): Payload {
  return JSON.parse(String(fetchMock.mock.calls[index][1]?.body)) as Payload;
}

async function expectResponse(
  response: Response,
  status: number,
  body: unknown,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual(body);
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, {status: 201}));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Brevo customer review delivery', () => {
  it.each([
    [
      'DE',
      'Neue Kundenbewertung – 4/5 – Anna Example',
      'Vielen Dank für deine Bewertung',
      'Vielen Dank für deine Bewertung. Wir haben sie erhalten und werden sie prüfen.',
      'Foto beigefügt: Nein',
    ],
    [
      'EN',
      'New customer review – 4/5 – Anna Example',
      'Thank you for your review',
      'Thank you for your review. We received it and will review it.',
      'Photo supplied: No',
    ],
  ] as const)(
    'sends the exact %s internal email followed by its acknowledgement',
    async (locale, subject, ackSubject, ackText, photoText) => {
      await expectResponse(
        await submit(form({locale}), undefined, {
          'Accept-Language': locale === 'DE' ? 'en' : 'de',
        }),
        200,
        {ok: true},
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [url, options] of fetchMock.mock.calls) {
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(options).toMatchObject({
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': TEST_KEY,
          },
          signal: expect.any(AbortSignal),
          redirect: 'error',
        });
        expect(options?.signal?.aborted).toBe(false);
      }
      const internal = payload(0);
      expect(internal.sender).toEqual({
        name: 'Wandini',
        email: 'info@wandini.shop',
      });
      expect(internal.to).toEqual([{email: 'info@wandini.shop'}]);
      expect(internal.replyTo).toEqual({
        email: 'anna+review@example.com',
        name: 'Anna Example',
      });
      expect(internal.subject).toBe(subject);
      expect(internal).not.toHaveProperty('attachment');
      expect(internal.textContent).toContain(photoText);
      for (const value of [
        'Anna',
        'Example',
        'anna+review@example.com',
        '+49 123',
        '4/5',
        'A lovely room.',
      ]) {
        expect(internal.textContent).toContain(value);
        expect(internal.htmlContent).toContain(value);
      }
      expect(internal.textContent).toContain('A lovely room.\r\nThank you!');
      expect(internal.htmlContent).toContain('A lovely room.<br>Thank you!');
      const acknowledgement = payload(1);
      expect(acknowledgement.sender).toEqual(internal.sender);
      expect(acknowledgement.to).toEqual([
        {email: 'anna+review@example.com', name: 'Anna Example'},
      ]);
      expect(acknowledgement.subject).toBe(ackSubject);
      expect(acknowledgement.textContent).toBe('Wandini\n\n' + ackText);
      expect(acknowledgement.htmlContent).toContain(ackText);
      expect(acknowledgement.htmlContent).toContain(
        'lang="' + locale.toLowerCase() + '"',
      );
      expect(acknowledgement).not.toHaveProperty('replyTo');
      expect(acknowledgement).not.toHaveProperty('attachment');
      expect(acknowledgement.htmlContent).not.toContain('<img');
      expect(acknowledgement.htmlContent).not.toContain('A lovely room.');
    },
  );

  it('waits for internal success before even starting the acknowledgement', async () => {
    let acceptInternal!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acceptInternal = resolve;
        }),
    );
    let finished = false;
    const result = submit().then((response) => {
      finished = true;
      return response;
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(payload(0).to).toEqual([{email: 'info@wandini.shop'}]);
    expect(finished).toBe(false);
    acceptInternal(new Response(null, {status: 201}));
    await expectResponse(await result, 200, {ok: true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payload(1).to).toEqual([
      {email: 'anna+review@example.com', name: 'Anna Example'},
    ]);
  });

  it('uses first name alone and omits unsupplied optional details', async () => {
    await expectResponse(
      await submit(form({lastName: null, phone: null, locale: 'EN'})),
      200,
      {ok: true},
    );
    expect(payload(0).subject).toBe('New customer review – 4/5 – Anna');
    expect(payload(0).replyTo?.name).toBe('Anna');
    expect(payload(1).to[0].name).toBe('Anna');
    expect(payload(0).textContent).not.toContain('Last name:');
    expect(payload(0).textContent).not.toContain('Phone number:');
  });

  it('escapes every submitted HTML value while keeping textContent plain', async () => {
    const firstName = 'Anna<&>"\'';
    const lastName = 'Example<&>"\'';
    const email = 'anna&tag@example.com';
    const phone = '+49<&>"\'';
    const comment =
      '<img src=x onerror="alert(1)"><script>alert(1)</script>&\'\nSecond line.';
    await expectResponse(
      await submit(form({firstName, lastName, email, phone, comment})),
      200,
      {ok: true},
    );
    const internal = payload(0);
    for (const value of [firstName, lastName, email, phone, comment])
      expect(internal.textContent).toContain(value.replace(/\r?\n/g, '\r\n'));
    expect(internal.htmlContent).toContain('Anna&lt;&amp;&gt;&quot;&#39;');
    expect(internal.htmlContent).toContain('Example&lt;&amp;&gt;&quot;&#39;');
    expect(internal.htmlContent).toContain('anna&amp;tag@example.com');
    expect(internal.htmlContent).toContain('+49&lt;&amp;&gt;&quot;&#39;');
    expect(internal.htmlContent).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;<br>Second line.',
    );
    expect(internal.htmlContent).not.toContain('<img');
    expect(internal.htmlContent).not.toContain('<script>');
    expect(escapeReviewEmailHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it.each([200, 201, 202, 204, 299])(
    'accepts Brevo HTTP %s without requiring or parsing a response body',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, {status}));
      await expectResponse(await submit(), 200, {ok: true});
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([302, 400, 401, 429, 500, 503])(
    'returns a private 502 and sends no acknowledgement after internal HTTP %s',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('private provider body ' + TEST_KEY, {status}),
      );
      await expectResponse(await submit(), 502, deliveryError);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('returns a private 502 after an internal network failure without retrying', async () => {
    fetchMock.mockRejectedValueOnce(
      new Error('private provider exception ' + TEST_KEY),
    );
    await expectResponse(await submit(), 502, deliveryError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([undefined, '', ' \t\n '])(
    'returns 503 with no request when the API key is %j',
    async (key) => {
      await expectResponse(
        await submit(form(), {BREVO_API_KEY: key}),
        503,
        deliveryError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([400, 429, 500, 503])(
    'keeps success after acknowledgement HTTP %s',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, {status: 201}))
        .mockResolvedValueOnce(
          new Response('private acknowledgement failure', {status}),
        );
      await expectResponse(await submit(), 200, {ok: true});
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(payload(0).to).toEqual([{email: 'info@wandini.shop'}]);
      expect(payload(1).to[0].email).toBe('anna+review@example.com');
    },
  );

  it('keeps success after an acknowledgement network failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, {status: 201}))
      .mockRejectedValueOnce(
        new Error('private acknowledgement network failure'),
      );
    await expectResponse(await submit(), 200, {ok: true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['internal', 'acknowledgement'] as const)(
    'aborts a stalled %s request at ten seconds without retrying',
    async (stage) => {
      vi.useFakeTimers();
      let startedAt = 0;
      let signal: AbortSignal | null | undefined;
      if (stage === 'acknowledgement')
        fetchMock.mockResolvedValueOnce(new Response(null, {status: 201}));
      fetchMock.mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            startedAt = Date.now();
            signal = options?.signal;
            signal?.addEventListener('abort', () =>
              reject(new Error('Aborted')),
            );
          }),
      );
      const result = submit();
      const count = stage === 'internal' ? 1 : 2;
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(count), {
        interval: 1,
      });
      await vi.advanceTimersByTimeAsync(9999 - (Date.now() - startedAt));
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expectResponse(
        await result,
        stage === 'internal' ? 502 : 200,
        stage === 'internal' ? deliveryError : {ok: true},
      );
      expect(signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('clears successful request timers rather than aborting completed requests later', async () => {
    vi.useFakeTimers();
    await expectResponse(await submit(), 200, {ok: true});
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    for (const [, options] of fetchMock.mock.calls)
      expect(options?.signal?.aborted).toBe(false);
  });

  it.each(['trap', ' '])(
    'preserves honeypot %j apparent success without a key or either email',
    async (company) => {
      const body = form({company, locale: null, email: 'invalid'});
      body.set('photo', new Blob(['not an image']), 'fake.jpg');
      await expectResponse(await submit(body, {}), 200, {ok: true});
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([null, '', 'de', 'en', 'FR', ' DE', 'DE ', 'EN\n', 'DE\r\n'])(
    'strictly rejects locale %j without sending mail',
    async (locale) => {
      await expectResponse(await submit(form({locale})), 400, {
        ok: false,
        fieldErrors: {_form: 'locale'},
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate and file-valued locales', async () => {
    const duplicate = form();
    duplicate.append('locale', 'DE');
    const file = form();
    file.set('locale', new Blob(['DE']), 'locale.txt');
    for (const body of [duplicate, file]) {
      await expectResponse(await submit(body), 400, {
        ok: false,
        fieldErrors: {_form: 'locale'},
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates fields and photos before looking for a key', async () => {
    await expectResponse(await submit(form({firstName: 'a'}), {}), 400, {
      ok: false,
      fieldErrors: {firstName: 'firstName'},
    });
    const body = form();
    body.set('photo', new Blob(['fake image']), 'photo.jpg');
    await expectResponse(await submit(body, {}), 400, {
      ok: false,
      fieldErrors: {photo: 'photoType'},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never logs private fields, payloads, provider errors or credentials', async () => {
    const logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map(
      (name) => vi.spyOn(console, name).mockImplementation(() => {}),
    );
    await expectResponse(await submit(), 200, {ok: true});
    fetchMock.mockRejectedValueOnce(
      new Error(TEST_KEY + ' private@example.com <script>private</script>'),
    );
    await expectResponse(await submit(), 502, deliveryError);
    fetchMock
      .mockResolvedValueOnce(new Response(null, {status: 201}))
      .mockRejectedValueOnce(new Error('private acknowledgement data'));
    await expectResponse(await submit(), 200, {ok: true});
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
