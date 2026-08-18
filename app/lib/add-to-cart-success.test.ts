import {describe, expect, it} from 'vitest';
import {isSuccessfulCartMutation} from '~/components/AddToCartButton';

describe('add-to-cart completion', () => {
  it('only treats a mutation with a cart and no errors as successful', () => {
    expect(isSuccessfulCartMutation({cart: {id: 'cart-1'}, errors: []})).toBe(
      true,
    );
    expect(
      isSuccessfulCartMutation({
        cart: {id: 'cart-1'},
        errors: [{message: 'Rejected'}],
      }),
    ).toBe(false);
    expect(isSuccessfulCartMutation({cart: null, errors: []})).toBe(false);
    expect(isSuccessfulCartMutation(undefined)).toBe(false);
  });
});
