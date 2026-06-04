type WishlistDisabledResult = {
  wishlist: string[];
  wishlisted: boolean;
};

export async function getCustomerWishlistProductIds(_args: {
  env?: unknown;
  customerId?: string;
}): Promise<string[]> {
  return [];
}

export async function addProductToCustomerWishlist(_args: {
  env?: unknown;
  customerId?: string;
  productId?: string;
}): Promise<WishlistDisabledResult> {
  return {
    wishlist: [],
    wishlisted: false,
  };
}

export async function toggleProductInCustomerWishlist(_args: {
  env?: unknown;
  customerId?: string;
  productId?: string;
}): Promise<WishlistDisabledResult> {
  return {
    wishlist: [],
    wishlisted: false,
  };
}
