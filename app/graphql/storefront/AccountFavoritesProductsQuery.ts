export const ACCOUNT_FAVORITES_PRODUCTS_QUERY = `#graphql
  query AccountFavoritesProducts(
    $ids: [ID!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on Product {
        __typename
        id
        handle
        title
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 3) {
          nodes {
            url
            altText
          }
        }
      }
    }
  }
` as const;
