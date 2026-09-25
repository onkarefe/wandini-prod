import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  action,
  loader,
  type NewsletterActionData,
} from '~/routes/api.newsletter';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';
import {de} from '~/i18n/de';
import {en} from '~/i18n/en';

const CUSTOMER_ID = 'gid://shopify/Customer/123';
const TOKEN = 'fake-admin-token';
const fetchMock = vi.fn<typeof fetch>();
type Stage = 'oauth' | 'lookup' | 'upsert' | 'consent';
let sequence = 0;
let env: Env;
let existing: ReturnType<typeof customer> | null;
let upserted: ReturnType<typeof customer>;
let responses: Partial<Record<Stage, () => Response | Promise<Response>>>;

function customer(state = 'NOT_SUBSCRIBED', optInLevel = 'SINGLE_OPT_IN') {
  return {
    id: CUSTOMER_ID,
    defaultEmailAddress: {
      marketingState: state,
      marketingOptInLevel: optInLevel,
    },
  };
}

function submit(email: string | null = 'reader@example.com', config = env) {
  const body = new FormData();
  if (email !== null) body.set('email', email);
  return action({
    request: new Request('https://www.wandini.shop/api/newsletter', {
      method: 'POST',
      body,
    }),
    context: {env: config},
  } as Parameters<typeof action>[0]);
}

function graphqlCalls() {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/graphql.json'))
    .map(([url, init]) => ({
      url: String(url),
      init,
      ...(JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      }),
    }));
}

async function expectFailure(response: Response, status = 502) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ok: false, error: 'upstream_failure'});
}

beforeEach(() => {
  sequence += 1;
  env = {
    SHOPIFY_SHOP: 'newsletter-tests.myshopify.com',
    PUBLIC_STORE_DOMAIN: 'fallback-tests.myshopify.com',
    SHOPIFY_CLIENT_ID: `fake-client-${sequence}`,
    SHOPIFY_CLIENT_SECRET: 'fake-client-secret',
    SHOPIFY_PRICING_CLIENT_ID: 'wrong-pricing-client',
    SHOPIFY_PRICING_CLIENT_SECRET: 'wrong-pricing-secret',
  } as Env;
  existing = null;
  upserted = customer();
  responses = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/admin/oauth/access_token')) {
      return (
        responses.oauth?.() ??
        Response.json({access_token: TOKEN, expires_in: 3600})
      );
    }
    const {query} = JSON.parse(String(init?.body)) as {query: string};
    if (query.includes('query NewsletterCustomer(')) {
      return (
        responses.lookup?.() ??
        Response.json({data: {customerByIdentifier: existing}})
      );
    }
    if (query.includes('mutation NewsletterCustomerSet(')) {
      return (
        responses.upsert?.() ??
        Response.json({
          data: {customerSet: {customer: upserted, userErrors: []}},
        })
      );
    }
    if (query.includes('mutation NewsletterConsent(')) {
      return (
        responses.consent?.() ??
        Response.json({
          data: {
            customerEmailMarketingConsentUpdate: {
              customer: customer('SUBSCRIBED'),
              userErrors: [],
            },
          },
        })
      );
    }
    if (query.includes('query CustomerWishlist(')) {
      return Response.json({data: {customer: {metafield: null}}});
    }
    throw new Error('Unexpected mocked Shopify operation');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('newsletter Admin GraphQL route', () => {
  it('resolves, minimally upserts, then subscribes a new email with the existing app', async () => {
    const response = await submit();
    const data = (await response.json()) as NewsletterActionData;
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(data).toEqual({ok: true});
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toBe(
      'https://newsletter-tests.myshopify.com/admin/oauth/access_token',
    );
    expect(tokenInit?.method).toBe('POST');
    expect(Object.fromEntries(tokenInit?.body as URLSearchParams)).toEqual({
      grant_type: 'client_credentials',
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
    });

    const calls = graphqlCalls();
    for (const call of calls) {
      expect(call.url).toBe(
        'https://newsletter-tests.myshopify.com/admin/api/2026-07/graphql.json',
      );
      expect(call.init).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN,
        },
        signal: expect.any(AbortSignal),
      });
      expect(call.init?.redirect).toBeUndefined();
      expect(String(call.init?.body)).not.toMatch(
        /form_type|contact\[|wrong-pricing/,
      );
    }
    expect(calls[0].variables).toEqual({
      identifier: {emailAddress: 'reader@example.com'},
    });
    expect(calls[1].variables).toEqual({
      identifier: {email: 'reader@example.com'},
      input: {email: 'reader@example.com'},
    });
    expect(calls[2].variables).toEqual({
      input: {
        customerId: CUSTOMER_ID,
        emailMarketingConsent: {
          marketingState: 'SUBSCRIBED',
          marketingOptInLevel: 'SINGLE_OPT_IN',
        },
      },
    });
    expect(calls[2].query).toContain('customerEmailMarketingConsentUpdate');
    expect(calls.map(({query}) => query).join('\n')).not.toMatch(
      /\b(firstName|lastName|phone|addresses|tags|metafields|taxExempt|customerUpdate)\b/,
    );
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).includes('/contact')),
    ).toBe(true);
  });

  it('trims whitespace while retaining email case and plus signs in lookup and upsert', async () => {
    expect((await submit(' \tReader+news@example.com\n ')).status).toBe(200);
    expect(graphqlCalls()[0].variables).toEqual({
      identifier: {emailAddress: 'Reader+news@example.com'},
    });
    expect(graphqlCalls()[1].variables).toEqual({
      identifier: {email: 'Reader+news@example.com'},
      input: {email: 'Reader+news@example.com'},
    });
  });

  it.each([null, '', ' \n\t '])(
    'rejects empty email %j without any Shopify call',
    async (email) => {
      const response = await submit(email);
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({
        ok: false,
        fieldErrors: {email: 'required'},
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'invalid',
    '@example.com',
    'reader@example',
    'reader@@example.com',
    'reader name@example.com',
    'reader@exa mple.com',
    `${'a'.repeat(243)}@example.com`,
  ])(
    'rejects invalid/overlong email %j without any Shopify call',
    async (email) => {
      const response = await submit(email);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        fieldErrors: {email: 'invalid'},
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('accepts exactly 254 characters', async () => {
    const email = `${'a'.repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect((await submit(email)).status).toBe(200);
    expect(graphqlCalls()[0].variables).toEqual({
      identifier: {emailAddress: email},
    });
  });

  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'rejects %s without Shopify calls',
    async (method) => {
      const response = await action({
        request: new Request('https://www.wandini.shop/api/newsletter', {
          method,
        }),
      } as Parameters<typeof action>[0]);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({
        ok: false,
        error: 'method_not_allowed',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects GET/HEAD at the resource loader', async () => {
    const response = loader();
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'method_not_allowed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unreadable FormData before authentication', async () => {
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
    {SHOPIFY_CLIENT_ID: undefined},
    {SHOPIFY_CLIENT_SECRET: undefined},
    {SHOPIFY_SHOP: undefined, PUBLIC_STORE_DOMAIN: undefined},
    {SHOPIFY_SHOP: 'example.com'},
    {SHOPIFY_SHOP: 'not a domain'},
  ])('rejects missing/invalid Admin configuration %j', async (overrides) => {
    await expectFailure(
      await submit('reader@example.com', {...env, ...overrides} as Env),
      503,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to PUBLIC_STORE_DOMAIN when SHOPIFY_SHOP is absent', async () => {
    env.SHOPIFY_SHOP = undefined;
    expect((await submit()).status).toBe(200);
    expect(graphqlCalls()[0].url).toBe(
      'https://fallback-tests.myshopify.com/admin/api/2026-07/graphql.json',
    );
  });

  it('normalizes shop URLs before sending credentials', async () => {
    env.SHOPIFY_SHOP =
      'http://ignored:ignored@newsletter-tests.myshopify.com/path?x=1#fragment';
    expect((await submit()).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://newsletter-tests.myshopify.com/admin/oauth/access_token',
    );
    expect(graphqlCalls()[0].url).toBe(
      'https://newsletter-tests.myshopify.com/admin/api/2026-07/graphql.json',
    );
  });

  it.each(['oauth', 'lookup', 'upsert', 'consent'] as const)(
    'sanitizes %s network failures',
    async (stage) => {
      responses[stage] = () =>
        Promise.reject(
          new Error(
            'Private email reader@example.com and token fake-admin-token',
          ),
        );
      await expectFailure(await submit());
    },
  );

  it.each([
    ['oauth', 401],
    ['lookup', 401],
    ['lookup', 403],
    ['lookup', 429],
    ['lookup', 500],
    ['upsert', 422],
    ['consent', 503],
  ] as const)('sanitizes %s HTTP %s failures', async (stage, status) => {
    responses[stage] = () => new Response('Private Shopify response', {status});
    await expectFailure(await submit());
  });

  it.each(['oauth', 'lookup', 'upsert', 'consent'] as const)(
    'sanitizes malformed %s JSON',
    async (stage) => {
      responses[stage] = () => new Response('not JSON');
      await expectFailure(await submit());
    },
  );

  it('rejects an OAuth response without a token', async () => {
    responses.oauth = () => Response.json({expires_in: 3600});
    await expectFailure(await submit());
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['lookup', 'upsert', 'consent'] as const)(
    'sanitizes top-level GraphQL errors during %s',
    async (stage) => {
      responses[stage] = () =>
        Response.json({errors: [{message: 'Private upstream information'}]});
      await expectFailure(await submit());
    },
  );

  it.each(['lookup', 'upsert', 'consent'] as const)(
    'rejects missing GraphQL data during %s',
    async (stage) => {
      responses[stage] = () => Response.json({data: null});
      await expectFailure(await submit());
    },
  );

  it.each(['NOT_SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING'])(
    'subscribes an existing %s customer without upsert',
    async (state) => {
      existing = customer(state);
      expect((await submit()).status).toBe(200);
      expect(graphqlCalls()).toHaveLength(2);
      expect(graphqlCalls()[1].variables).toEqual({
        input: {
          customerId: CUSTOMER_ID,
          emailMarketingConsent: {
            marketingState: 'SUBSCRIBED',
            marketingOptInLevel: 'SINGLE_OPT_IN',
          },
        },
      });
    },
  );

  it.each(['SINGLE_OPT_IN', 'CONFIRMED_OPT_IN', 'UNKNOWN'])(
    'leaves an existing subscriber with opt-in level %s unchanged',
    async (level) => {
      existing = customer('SUBSCRIBED', level);
      expect(await (await submit()).json()).toEqual({ok: true});
      expect(graphqlCalls()).toHaveLength(1);
      expect(graphqlCalls()[0].query).not.toContain('mutation');
    },
  );

  it('preserves a subscription established between lookup and upsert', async () => {
    upserted = customer('SUBSCRIBED', 'CONFIRMED_OPT_IN');
    expect(await (await submit()).json()).toEqual({ok: true});
    expect(graphqlCalls()).toHaveLength(2);
    expect(graphqlCalls()[1].variables).toEqual({
      identifier: {email: 'reader@example.com'},
      input: {email: 'reader@example.com'},
    });
  });

  it.each(['upsert', 'consent'] as const)(
    'sanitizes %s userErrors and does not report success',
    async (stage) => {
      const field =
        stage === 'upsert'
          ? 'customerSet'
          : 'customerEmailMarketingConsentUpdate';
      responses[stage] = () =>
        Response.json({
          data: {
            [field]: {
              customer: customer('SUBSCRIBED'),
              userErrors: [{field: ['email'], message: 'Private data'}],
            },
          },
        });
      await expectFailure(await submit());
      if (stage === 'upsert') expect(graphqlCalls()).toHaveLength(2);
    },
  );

  it.each(['lookup', 'upsert', 'consent'] as const)(
    'rejects a missing customer ID during %s',
    async (stage) => {
      const invalid = {defaultEmailAddress: {marketingState: 'SUBSCRIBED'}};
      responses[stage] = () =>
        Response.json({
          data:
            stage === 'lookup'
              ? {customerByIdentifier: invalid}
              : {
                  [stage === 'upsert'
                    ? 'customerSet'
                    : 'customerEmailMarketingConsentUpdate']: {
                    customer: invalid,
                    userErrors: [],
                  },
                },
        });
      await expectFailure(await submit());
    },
  );

  it('does not create a customer when the lookup field is missing rather than null', async () => {
    responses.lookup = () => Response.json({data: {}});
    await expectFailure(await submit());
    expect(graphqlCalls()).toHaveLength(1);
  });

  it.each([
    null,
    {id: CUSTOMER_ID, defaultEmailAddress: null},
    customer('UNSUBSCRIBED'),
    customer('SUBSCRIBED', 'UNKNOWN'),
    {...customer('SUBSCRIBED'), id: 'gid://shopify/Customer/999'},
  ])('rejects unconfirmed/mismatched consent results %j', async (result) => {
    responses.consent = () =>
      Response.json({
        data: {
          customerEmailMarketingConsentUpdate: {
            customer: result,
            userErrors: [],
          },
        },
      });
    await expectFailure(await submit());
  });

  it('returns identical private responses for new, existing and already subscribed customers', async () => {
    const bodies: string[] = [];
    for (const record of [
      null,
      customer('UNSUBSCRIBED'),
      customer('SUBSCRIBED'),
    ]) {
      existing = record;
      const response = await submit();
      expect(response.status).toBe(200);
      bodies.push(await response.text());
    }
    expect(bodies).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}']);
  });

  it('does not log or serialize credentials, customer IDs, email, or Shopify errors', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    responses.consent = () =>
      Response.json({
        errors: [
          {
            message: `${TOKEN} ${env.SHOPIFY_CLIENT_SECRET} ${CUSTOMER_ID} reader@example.com`,
          },
        ],
      });
    await expectFailure(await submit());
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
  });

  it('reuses the same OAuth token for wishlist and newsletter', async () => {
    await getCustomerWishlistProductIds({env, customerId: CUSTOMER_ID});
    expect((await submit()).status).toBe(200);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/admin/oauth/access_token'),
      ),
    ).toHaveLength(1);
    expect(
      graphqlCalls().every(
        ({init}) =>
          new Headers(init?.headers).get('X-Shopify-Access-Token') === TOKEN,
      ),
    ).toBe(true);
  });

  it('aborts a stalled Admin request after ten seconds', async () => {
    vi.useFakeTimers();
    existing = customer('SUBSCRIBED');
    responses.lookup = () =>
      new Promise((_resolve, reject) => {
        const init = fetchMock.mock.calls.at(-1)?.[1];
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('Aborted')),
        );
      });
    const result = submit();
    await vi.advanceTimersByTimeAsync(10_000);
    await expectFailure(await result);
    expect(graphqlCalls()[0].init?.signal?.aborted).toBe(true);
  });

  it('uses subscription success copy in both languages', () => {
    expect(de['footer.newsletterSuccess']).toBe(
      'Vielen Dank! Deine Newsletter-Anmeldung war erfolgreich.',
    );
    expect(en['footer.newsletterSuccess']).toBe(
      "Thank you! You've successfully subscribed to our newsletter.",
    );
  });
});
