import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  action as pageAction,
  loader as pageLoader,
} from '~/routes/pages.$handle';
import {createTranslator} from '~/i18n';

vi.mock('~/lib/language-switcher', () => ({
  resolveResourceLanguageSwitchLinks: vi.fn(async () => []),
}));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('review resource isolation and existing page behavior', () => {
  it('registers the review endpoint alongside unlocalized resource routes', () => {
    const routes = readFileSync(
      new URL('../routes.ts', import.meta.url),
      'utf8',
    );
    expect(routes).toMatch(
      /RESOURCE_ROUTE_IDS = new Set\(\[[\s\S]*?'routes\/api.customer-review'/,
    );
    expect(routes).toContain("RESOURCE_ROUTE_IDS.has(routeEntry.id ?? '')");
    expect(routes).toContain(
      "route(':locale?', 'routes/locale.tsx', localizedRoutes)",
    );
  });
  it('keeps Erfahrungen metaobject display loading intact without submission work', async () => {
    const page = {
      id: 'gid://shopify/Page/1',
      handle: 'erfahrungen',
      title: 'Erfahrungen',
      body: '<p>Page body</p>',
      pageType: {value: 'erfahrungen'},
      erfahrungenHero: {
        reference: {
          fields: [
            {key: 'title', value: 'Our customers'},
            {key: 'description', value: 'Real rooms'},
            {key: 'button_text', value: 'Read stories'},
          ],
        },
      },
      customerReviews: {
        reference: {
          fields: [
            {key: 'section_title', value: 'Customer stories'},
            {key: 'customer_name', value: '["Anna"]'},
            {key: 'comment_title', value: '["Beautiful"]'},
            {key: 'customer_comment', value: '["Looks great in our room."]'},
            {key: 'stars', value: '[4.5]'},
            {
              key: 'image',
              references: {
                nodes: [
                  {
                    image: {
                      url: 'https://example.com/room.jpg',
                      width: 100,
                      height: 100,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      erfahrungenSteps: {
        reference: {
          fields: [
            {key: 'main_title', value: 'Share your experience'},
            {key: 'box_title', value: '["Choose"]'},
            {key: 'box_description', value: '["Choose your motif"]'},
          ],
        },
      },
    };
    const query = vi.fn().mockResolvedValue({page});
    const result = await pageLoader({
      request: new Request('https://www.wandini.shop/pages/erfahrungen'),
      params: {handle: 'erfahrungen'},
      context: {
        env: {
          PUBLIC_STORE_DOMAIN: 'store.myshopify.com',
          PUBLIC_CANONICAL_ORIGIN: 'https://www.wandini.shop',
        },
        storefront: {query},
      },
    } as unknown as Parameters<typeof pageLoader>[0]);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('query Page(');
    expect(result.customerReviewsHero).toMatchObject({
      title: 'Our customers',
      description: 'Real rooms',
      buttonText: 'Read stories',
    });
    expect(result.customerReviewsSectionTitle).toBe('Customer stories');
    expect(result.customerReviews).toEqual([
      {
        id: 'customer-review-1',
        customerName: 'Anna',
        commentTitle: 'Beautiful',
        customerComment: 'Looks great in our room.',
        stars: 4.5,
        image: {
          url: 'https://example.com/room.jpg',
          altText: 'Anna',
          width: 100,
          height: 100,
        },
      },
    ]);
    expect(result.customerReviewsSteps).toMatchObject({
      title: 'Share your experience',
      steps: [{title: 'Choose', description: 'Choose your motif'}],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ['DE', 'kontakt-contact', 'message', 'contact.success'],
    ['EN', 'kontakt-contact', 'message', 'contact.success'],
    ['DE', 'faq-contact', 'question', 'faq.success'],
    ['EN', 'faq-contact', 'question', 'faq.success'],
  ] as const)(
    'preserves %s %s success, validation and honeypot behavior',
    async (language, intent, bodyField, successKey) => {
      const t = createTranslator({language});
      const makeForm = () => {
        const data = new FormData();
        for (const [key, value] of Object.entries({
          intent,
          fullName: 'Anna Example',
          email: 'anna@example.com',
          phone: '+49 123',
          [bodyField]: 'An existing contact question.',
        }))
          data.set(key, value);
        return data;
      };
      const call = (body: FormData) =>
        pageAction({
          request: new Request(
            'https://www.wandini.shop/' +
              (language === 'EN' ? 'en/' : '') +
              'pages/kontakt',
            {method: 'POST', body},
          ),
          context: {env: {PUBLIC_STORE_DOMAIN: 'store.myshopify.com'}},
        } as Parameters<typeof pageAction>[0]);
      const response = await call(makeForm());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ok: true, message: t(successKey)});
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://store.myshopify.com/contact');
      expect(
        Object.fromEntries(options?.body as URLSearchParams),
      ).toMatchObject({
        form_type: 'contact',
        'contact[name]': 'Anna Example',
        'contact[email]': 'anna@example.com',
        'contact[phone]': '+49 123',
        'contact[body]': 'An existing contact question.',
      });
      fetchMock.mockClear();
      const invalid = makeForm();
      invalid.set('email', 'bad');
      const rejected = await call(invalid);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        ok: false,
        fieldErrors: {email: t('contact.invalidEmail')},
      });
      invalid.set('company', 'trap');
      expect(await (await call(invalid)).json()).toEqual({
        ok: true,
        message: t(successKey),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('does not accept review submissions in the generic page action', async () => {
    const body = new FormData();
    body.set('firstName', 'Anna');
    const response = await pageAction({
      request: new Request('https://example.com/pages/erfahrungen', {
        method: 'POST',
        body,
      }),
      context: {env: {}},
    } as Parameters<typeof pageAction>[0]);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
