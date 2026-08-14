export const CUSTOMER_WISHLIST_OWNER_QUERY = `#graphql
  query WishlistCustomerOwner($language: LanguageCode)
  @inContext(language: $language) {
    customer {
      id
    }
  }
` as const;
