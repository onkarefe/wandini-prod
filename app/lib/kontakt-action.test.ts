import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {action} from '~/routes/pages.$handle';
import {createTranslator} from '~/i18n';
import type {BrevoMessage} from '~/lib/brevo.server';

const fetchMock = vi.fn<typeof fetch>();
// Unit-test fixture only; never reads any configured secret or makes live requests.
const testEnv = {BREVO_API_KEY: 'unit-test-placeholder'};
type Payload = BrevoMessage & {sender: {name: string; email: string}};
const failure = (language: 'DE' | 'EN' = 'DE') => ({
  ok: false,
  message: createTranslator({language})('contact.error'),
});
const success = (language: 'DE' | 'EN' = 'DE') => ({
  ok: true,
  message: createTranslator({language})('contact.success'),
});

function form(overrides: Record<string, string | null> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    intent: 'kontakt-contact',
    fullName: ' Anna Example ',
    email: ' Anna@EXAMPLE.COM ',
    phone: ' +49 123 ',
    message: ' A question about my room. ',
    company: '',
    ...overrides,
  }))
    if (value !== null) body.set(key, value);
  return body;
}
function submit(
  body = form(),
  env: Partial<Env> = testEnv,
  language: 'DE' | 'EN' = 'DE',
) {
  return action({
    request: new Request(
      'https://www.wandini.shop/' +
        (language === 'EN' ? 'en/' : '') +
        'pages/kontakt',
      {
        method: 'POST',
        body,
        headers: {'Accept-Language': language === 'EN' ? 'de' : 'en'},
      },
    ),
    context: {env},
  } as Parameters<typeof action>[0]);
}
function payload(index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index][1]?.body)) as Payload;
}
async function expectResponse(
  response: Response,
  status: number,
  body: unknown,
) {
  expect(response.status).toBe(status);
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

describe('Kontakt action migration', () => {
  it.each(['DE', 'EN'] as const)(
    'delivers %s using the request locale, preserving normalized fields and the UI response',
    async (language) => {
      const body = form({locale: language === 'DE' ? 'EN' : 'DE'});
      await expectResponse(
        await submit(body, testEnv, language),
        200,
        success(language),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [url, options] of fetchMock.mock.calls) {
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(options?.method).toBe('POST');
        expect(String(url)).not.toContain('/contact');
        expect(options?.headers).toMatchObject({
          'api-key': testEnv.BREVO_API_KEY,
        });
      }
      const internal = payload(0);
      expect(internal.sender).toEqual({
        name: 'Wandini',
        email: 'info@wandini.shop',
      });
      expect(internal.to).toEqual([{email: 'info@wandini.shop'}]);
      expect(internal.replyTo).toEqual({
        name: 'Anna Example',
        email: 'Anna@EXAMPLE.COM',
      });
      expect(internal.subject).toBe(
        (language === 'DE' ? 'Neue Kontaktanfrage' : 'New contact request') +
          ' – Anna Example',
      );
      for (const value of [
        'Anna Example',
        'Anna@EXAMPLE.COM',
        '+49 123',
        'A question about my room.',
      ]) {
        expect(internal.textContent).toContain(value);
        expect(internal.htmlContent).toContain(value);
      }
      const acknowledgement = payload(1);
      expect(acknowledgement.to).toEqual([
        {name: 'Anna Example', email: 'Anna@EXAMPLE.COM'},
      ]);
      expect(acknowledgement.subject).toBe(
        language === 'DE'
          ? 'Wir haben deine Nachricht erhalten'
          : 'We received your message',
      );
      expect(acknowledgement).not.toHaveProperty('attachment');
      expect(acknowledgement).not.toHaveProperty('replyTo');
    },
  );

  it.each([
    ['fullName', null, false],
    ['fullName', ' ', false],
    ['fullName', 'a', false],
    ['fullName', 'ab', true],
    ['fullName', 'a'.repeat(120), true],
    ['fullName', 'a'.repeat(121), false],
    ['email', null, false],
    ['email', ' ', false],
    ['email', 'invalid', false],
    ['email', 'a@@b.com', false],
    ['email', 'a b@example.com', false],
    ['email', 'a'.repeat(242) + '@example.com', true],
    ['email', 'a'.repeat(243) + '@example.com', false],
    ['phone', null, false],
    ['phone', ' ', false],
    ['phone', '1', true],
    ['phone', '1'.repeat(40), true],
    ['phone', '1'.repeat(41), false],
    ['message', null, false],
    ['message', ' ', false],
    ['message', 'a'.repeat(9), false],
    ['message', 'a'.repeat(10), true],
    ['message', 'a'.repeat(3000), true],
    ['message', 'a'.repeat(3001), false],
  ] as const)(
    'preserves %s validation boundaries (case %#)',
    async (field, value, valid) => {
      const response = await submit(form({[field]: value}));
      const t = createTranslator();
      const error =
        field === 'email'
          ? t('contact.invalidEmail')
          : field === 'message'
            ? t('contact.invalidMessage')
            : t('contact.required');
      await expectResponse(
        response,
        valid ? 200 : 400,
        valid ? success() : {ok: false, fieldErrors: {[field]: error}},
      );
      expect(fetchMock).toHaveBeenCalledTimes(valid ? 2 : 0);
    },
  );

  it('keeps the existing email syntax rule instead of introducing review-specific validation', async () => {
    await expectResponse(
      await submit(form({email: '<customer>@example.com'})),
      200,
      success(),
    );
    expect(payload(0).replyTo?.email).toBe('<customer>@example.com');
    expect(payload(0).htmlContent).toContain('&lt;customer&gt;@example.com');
    expect(payload(0).htmlContent).not.toContain('<customer>');
  });

  it.each(['DE', 'EN'] as const)(
    'returns apparent %s honeypot success without a key or external requests',
    async (language) => {
      await expectResponse(
        await submit(
          form({company: ' bot ', email: 'invalid', message: null}),
          {},
          language,
        ),
        200,
        success(language),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['DE', 'EN'] as const)(
    'returns localized %s validation errors before requiring a key',
    async (language) => {
      await expectResponse(
        await submit(form({email: 'bad'}), {}, language),
        400,
        {
          ok: false,
          fieldErrors: {
            email: createTranslator({language})('contact.invalidEmail'),
          },
        },
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', ' \t\n '])(
    'returns 503 without delivery for missing/empty key %j',
    async (key) => {
      await expectResponse(
        await submit(form(), {BREVO_API_KEY: key}, 'EN'),
        503,
        failure('EN'),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('trims the configured key and does not require a Shopify domain for Kontakt', async () => {
    await expectResponse(
      await submit(form(), {BREVO_API_KEY: ' ' + testEnv.BREVO_API_KEY + ' '}),
      200,
      success(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'api-key': testEnv.BREVO_API_KEY,
    });
  });

  it('does not fall back to Shopify when the Brevo key is absent', async () => {
    await expectResponse(
      await submit(form(), {PUBLIC_STORE_DOMAIN: 'store.myshopify.com'}),
      503,
      failure(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('waits for internal acceptance before acknowledgement', async () => {
    let accept!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
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
    accept(new Response(null, {status: 201}));
    await expectResponse(await result, 200, success());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 429, 500, 503])(
    'returns 502 without acknowledgement for internal HTTP %s',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('private provider body', {status}),
      );
      await expectResponse(
        await submit(form(), testEnv, 'EN'),
        502,
        failure('EN'),
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('returns 502 without acknowledgement on internal network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private provider failure'));
    await expectResponse(await submit(), 502, failure());
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([400, 500])(
    'accepts acknowledgement HTTP %s failure without resending the internal email',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, {status: 201}))
        .mockResolvedValueOnce(
          new Response('private acknowledgement failure', {status}),
        );
      await expectResponse(await submit(), 200, success());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(payload(0).to).toEqual([{email: 'info@wandini.shop'}]);
      expect(payload(1).to[0].email).toBe('Anna@EXAMPLE.COM');
    },
  );

  it('accepts acknowledgement network failure without retrying', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, {status: 201}))
      .mockRejectedValueOnce(new Error('private acknowledgement failure'));
    await expectResponse(await submit(), 200, success());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['internal', 'acknowledgement'] as const)(
    'retains shared timeout behavior for %s delivery',
    async (stage) => {
      vi.useFakeTimers();
      if (stage === 'acknowledgement')
        fetchMock.mockResolvedValueOnce(new Response(null, {status: 201}));
      let signal: AbortSignal | null | undefined;
      fetchMock.mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
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
      await vi.advanceTimersByTimeAsync(10_000);
      await expectResponse(
        await result,
        stage === 'internal' ? 502 : 200,
        stage === 'internal' ? failure() : success(),
      );
      expect(signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('never logs submitted values, keys or provider payloads', async () => {
    const logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map(
      (name) => vi.spyOn(console, name).mockImplementation(() => {}),
    );
    await expectResponse(await submit(), 200, success());
    fetchMock.mockResolvedValueOnce(
      new Response(
        'Anna Example Anna@EXAMPLE.COM +49 123 ' + testEnv.BREVO_API_KEY,
        {status: 500},
      ),
    );
    await expectResponse(await submit(), 502, failure());
    fetchMock
      .mockResolvedValueOnce(new Response(null, {status: 201}))
      .mockRejectedValueOnce(new Error('private acknowledgement failure'));
    await expectResponse(await submit(), 200, success());
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

describe('FAQ remains on Shopify', () => {
  const faqForm = (overrides: Record<string, string | null> = {}) =>
    form({
      intent: 'faq-contact',
      question: ' A question about wallpaper. ',
      ...overrides,
    });
  it.each(['DE', 'EN'] as const)(
    'keeps the complete %s Shopify payload and localized success without a Brevo key',
    async (language) => {
      const env = {PUBLIC_STORE_DOMAIN: 'faq-store.myshopify.com'};
      await expectResponse(await submit(faqForm(), env, language), 200, {
        ok: true,
        message: createTranslator({language})('faq.success'),
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://faq-store.myshopify.com/contact');
      expect(options).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        redirect: 'follow',
      });
      expect(options?.body).toBeInstanceOf(URLSearchParams);
      expect(Object.fromEntries(options?.body as URLSearchParams)).toEqual({
        form_type: 'contact',
        utf8: '✓',
        'contact[name]': 'Anna Example',
        'contact[email]': 'Anna@EXAMPLE.COM',
        'contact[phone]': '+49 123',
        'contact[body]': 'A question about wallpaper.',
      });
    },
  );
  it.each([400, 500])(
    'retains FAQ HTTP %s provider failure semantics and never falls back to Brevo',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('private Shopify error', {status}),
      );
      await expectResponse(
        await submit(
          faqForm(),
          {...testEnv, PUBLIC_STORE_DOMAIN: 'faq.myshopify.com'},
          'EN',
        ),
        502,
        {ok: false, message: createTranslator({language: 'EN'})('faq.error')},
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://faq.myshopify.com/contact',
      );
    },
  );
  it('retains FAQ network failure behavior', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private Shopify failure'));
    await expectResponse(
      await submit(faqForm(), {PUBLIC_STORE_DOMAIN: 'faq.myshopify.com'}),
      502,
      {ok: false, message: createTranslator()('faq.error')},
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('still requires PUBLIC_STORE_DOMAIN even with a Brevo key', async () => {
    await expectResponse(await submit(faqForm(), testEnv), 503, {
      ok: false,
      message: createTranslator()('faq.error'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['DE', 'EN'] as const)(
    'retains %s FAQ honeypot behavior with no external requests',
    async (language) => {
      await expectResponse(
        await submit(faqForm({company: 'bot', email: 'bad'}), {}, language),
        200,
        {ok: true, message: createTranslator({language})('faq.success')},
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('retains FAQ required phone and question validation', async () => {
    await expectResponse(
      await submit(faqForm({phone: ' ', question: 'short'}), testEnv),
      400,
      {
        ok: false,
        fieldErrors: {
          phone: createTranslator()('contact.required'),
          question: createTranslator()('faq.invalidQuestion'),
        },
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
