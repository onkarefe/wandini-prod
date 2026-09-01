import {afterEach, describe, expect, it, vi} from 'vitest';
import {action as checkoutApiAction} from '~/routes/api.$version.[graphql.json]';

function request(query: string) {
  return new Request('https://example.com/api/2026-07/graphql.json', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query}),
  });
}

function context() {
  return {env: {PUBLIC_CHECKOUT_DOMAIN: 'checkout.example.com'}};
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('checkout-domain GraphQL proxy', () => {
  it.each([
    'query Cart($id: ID!) { cart(id: $id) { checkoutUrl } }',
    'query Cart($id: ID!) { cart(id: $id) { native: checkoutUrl } }',
    'mutation Complete($id: ID!) { cartSubmitForCompletion(cartId: $id) { result { __typename } } }',
    'mutation Legacy { checkoutCreate(input: {}) { userErrors { message } } }',
  ])('blocks repository-controlled checkout access: %s', async (query) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await checkoutApiAction({
      request: request(query),
      params: {version: '2026-07'},
      context: context(),
    } as never);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('continues to proxy non-checkout GraphQL operations', async () => {
    const upstreamBody = JSON.stringify({data: {shop: {name: 'Wandini'}}});
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(upstreamBody, {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await checkoutApiAction({
      request: request('query Shop { shop { name } }'),
      params: {version: '2026-07'},
      context: context(),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(upstreamBody);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('rejects persisted or malformed operations that cannot be inspected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const persistedRequest = new Request(
      'https://example.com/api/2026-07/graphql.json',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({extensions: {persistedQuery: {sha256Hash: 'x'}}}),
      },
    );

    const response = await checkoutApiAction({
      request: persistedRequest,
      params: {version: '2026-07'},
      context: context(),
    } as never);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
