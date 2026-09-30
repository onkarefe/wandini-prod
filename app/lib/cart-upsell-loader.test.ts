import {describe, expect, it, vi} from 'vitest';
import {parse, print} from 'graphql';
import {loader} from '~/routes/cart';

describe('cart upsell loader', () => {
  it('keeps metafield products and all returned variants in Shopify order regardless of availability', async () => {
    const variants = [false, true, true].map((availableForSale, index) => ({
      id: `gid://shopify/ProductVariant/${index + 1}`,
      title: ['2.5 Kg', '5 Kg', '10 Kg'][index],
      availableForSale,
      price: {amount: String((index + 1) * 10), currencyCode: 'EUR'},
      selectedOptions: [
        {name: 'Size', value: ['2.5 Kg', '5 Kg', '10 Kg'][index]},
      ],
    }));
    const reference = {
      __typename: 'Product',
      id: 'product-1',
      handle: 'accessory',
      title: 'Accessory',
      featuredImage: null,
      variants: {nodes: variants},
    };
    const query = vi.fn().mockResolvedValue({
      collection: {
        cartUpsellProducts: {
          references: {
            nodes: [
              reference,
              {...reference, id: 'product-2', variants: {nodes: [variants[0]]}},
              {...reference, id: 'product-3', variants: {nodes: []}},
              {__typename: 'Collection', id: 'ignored'},
            ],
          },
        },
      },
    });
    const result = await loader({
      context: {
        cart: {get: vi.fn().mockResolvedValue(null)},
        storefront: {
          query,
          CacheLong: () => ({mode: 'public'}),
          i18n: {language: 'DE', country: 'DE'},
        },
      },
    } as never);
    const products = await result.cartUpsellProducts;
    expect(products).toHaveLength(3);
    expect(products.map(({variants: nodes}) => nodes)).toEqual([
      variants,
      [variants[0]],
      [],
    ]);
    expect(products[0]).toMatchObject({
      id: reference.id,
      handle: reference.handle,
      title: reference.title,
      image: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1].variables).toEqual({
      collectionHandle: 'zubehor',
    });
    const document = print(parse(query.mock.calls[0][0]));
    expect(document).toContain(
      'namespace: "custom", key: "cart_upsell_products"',
    );
    expect(document).toContain('references(first: 3)');
    expect(document).toContain('variants(first: 50)');
    expect(document).toContain('selectedOptions');
    expect(document).toContain('availableForSale');
    expect(document).not.toContain('selectedOrFirstAvailableVariant');
  });
});
