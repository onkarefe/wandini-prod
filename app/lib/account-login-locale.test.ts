import {describe, expect, it, vi} from 'vitest';
import {loader} from '~/routes/account_.login';

function createLoaderArgs(url: string) {
  const login = vi.fn().mockResolvedValue(new Response(null, {status: 204}));

  return {
    args: {
      request: new Request(url),
      context: {
        customerAccount: {login},
        storefront: {i18n: {country: 'DE'}},
      },
    } as never,
    login,
  };
}

describe('account login locale return flow', () => {
  it.each([
    [
      'German',
      'https://www.wandini.shop/account/login',
      '/account/login?return_to=%2Faccount',
    ],
    [
      'English',
      'https://www.wandini.shop/en/account/login',
      '/en/account/login?return_to=%2Fen%2Faccount',
    ],
  ])(
    'normalizes a no-return_to %s login to its locale default',
    async (_language, url, expectedLocation) => {
      const {args, login} = createLoaderArgs(url);
      const response = await loader(args);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).headers.get('Location')).toBe(
        expectedLocation,
      );
      expect(login).not.toHaveBeenCalled();
    },
  );

  it('preserves a safe localized return_to and locale OAuth options', async () => {
    const {args, login} = createLoaderArgs(
      'https://www.wandini.shop/en/account/login?return_to=%2Fen%2Faccount%2Forders',
    );

    await loader(args);

    expect(login).toHaveBeenCalledWith({
      countryCode: 'DE',
      uiLocales: 'EN',
    });
  });

  it('replaces an unsafe external return_to before OAuth starts', async () => {
    const {args, login} = createLoaderArgs(
      'https://www.wandini.shop/en/account/login?return_to=https%3A%2F%2Fevil.example%2Fsteal',
    );
    const response = await loader(args);

    expect((response as Response).headers.get('Location')).toBe(
      '/en/account/login?return_to=%2Fen%2Faccount',
    );
    expect(login).not.toHaveBeenCalled();
  });
});
