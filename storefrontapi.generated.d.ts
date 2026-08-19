/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontAPI from '@shopify/hydrogen/storefront-api-types';

export type AccountFavoritesProductsQueryVariables = StorefrontAPI.Exact<{
  ids:
    | Array<StorefrontAPI.Scalars['ID']['input']>
    | StorefrontAPI.Scalars['ID']['input'];
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type AccountFavoritesProductsQuery = {
  nodes: Array<
    StorefrontAPI.Maybe<
      {__typename: 'Product'} & Pick<
        StorefrontAPI.Product,
        'id' | 'handle' | 'title'
      > & {
          priceRange: {
            minVariantPrice: Pick<
              StorefrontAPI.MoneyV2,
              'amount' | 'currencyCode'
            >;
          };
          images: {nodes: Array<Pick<StorefrontAPI.Image, 'url' | 'altText'>>};
        }
    >
  >;
};

export type MoneyFragment = Pick<
  StorefrontAPI.MoneyV2,
  'currencyCode' | 'amount'
>;

export type CartLineFragment = Pick<
  StorefrontAPI.CartLine,
  'id' | 'quantity'
> & {
  attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
  cost: {
    subtotalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    amountPerQuantity: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    compareAtAmountPerQuantity?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
  };
  merchandise: Pick<
    StorefrontAPI.ProductVariant,
    'id' | 'availableForSale' | 'requiresShipping' | 'title'
  > & {
    compareAtPrice?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
    price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    printQuality?: StorefrontAPI.Maybe<{
      reference?: StorefrontAPI.Maybe<{
        pricePerM2?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
      }>;
    }>;
    image?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>
    >;
    product: Pick<StorefrontAPI.Product, 'handle' | 'title' | 'id' | 'vendor'>;
    selectedOptions: Array<
      Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
    >;
  };
};

export type CartLineComponentFragment = Pick<
  StorefrontAPI.ComponentizableCartLine,
  'id' | 'quantity'
> & {
  attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
  cost: {
    subtotalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    amountPerQuantity: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    compareAtAmountPerQuantity?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
  };
  merchandise: Pick<
    StorefrontAPI.ProductVariant,
    'id' | 'availableForSale' | 'requiresShipping' | 'title'
  > & {
    compareAtPrice?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
    price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    printQuality?: StorefrontAPI.Maybe<{
      reference?: StorefrontAPI.Maybe<{
        pricePerM2?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
      }>;
    }>;
    image?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>
    >;
    product: Pick<StorefrontAPI.Product, 'handle' | 'title' | 'id' | 'vendor'>;
    selectedOptions: Array<
      Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
    >;
  };
};

export type CartApiQueryFragment = Pick<
  StorefrontAPI.Cart,
  'updatedAt' | 'id' | 'checkoutUrl' | 'totalQuantity' | 'note'
> & {
  appliedGiftCards: Array<
    Pick<StorefrontAPI.AppliedGiftCard, 'id' | 'lastCharacters'> & {
      amountUsed: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    }
  >;
  buyerIdentity: Pick<
    StorefrontAPI.CartBuyerIdentity,
    'countryCode' | 'email' | 'phone'
  > & {
    customer?: StorefrontAPI.Maybe<
      Pick<
        StorefrontAPI.Customer,
        'id' | 'email' | 'firstName' | 'lastName' | 'displayName'
      >
    >;
  };
  lines: {
    nodes: Array<
      | (Pick<StorefrontAPI.CartLine, 'id' | 'quantity'> & {
          attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
          cost: {
            subtotalAmount: Pick<
              StorefrontAPI.MoneyV2,
              'currencyCode' | 'amount'
            >;
            totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
            amountPerQuantity: Pick<
              StorefrontAPI.MoneyV2,
              'currencyCode' | 'amount'
            >;
            compareAtAmountPerQuantity?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
            >;
          };
          merchandise: Pick<
            StorefrontAPI.ProductVariant,
            'id' | 'availableForSale' | 'requiresShipping' | 'title'
          > & {
            compareAtPrice?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
            >;
            price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
            printQuality?: StorefrontAPI.Maybe<{
              reference?: StorefrontAPI.Maybe<{
                pricePerM2?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
              }>;
            }>;
            image?: StorefrontAPI.Maybe<
              Pick<
                StorefrontAPI.Image,
                'id' | 'url' | 'altText' | 'width' | 'height'
              >
            >;
            product: Pick<
              StorefrontAPI.Product,
              'handle' | 'title' | 'id' | 'vendor'
            >;
            selectedOptions: Array<
              Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
            >;
          };
        })
      | (Pick<StorefrontAPI.ComponentizableCartLine, 'id' | 'quantity'> & {
          attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
          cost: {
            subtotalAmount: Pick<
              StorefrontAPI.MoneyV2,
              'currencyCode' | 'amount'
            >;
            totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
            amountPerQuantity: Pick<
              StorefrontAPI.MoneyV2,
              'currencyCode' | 'amount'
            >;
            compareAtAmountPerQuantity?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
            >;
          };
          merchandise: Pick<
            StorefrontAPI.ProductVariant,
            'id' | 'availableForSale' | 'requiresShipping' | 'title'
          > & {
            compareAtPrice?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
            >;
            price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
            printQuality?: StorefrontAPI.Maybe<{
              reference?: StorefrontAPI.Maybe<{
                pricePerM2?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
              }>;
            }>;
            image?: StorefrontAPI.Maybe<
              Pick<
                StorefrontAPI.Image,
                'id' | 'url' | 'altText' | 'width' | 'height'
              >
            >;
            product: Pick<
              StorefrontAPI.Product,
              'handle' | 'title' | 'id' | 'vendor'
            >;
            selectedOptions: Array<
              Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
            >;
          };
        })
    >;
  };
  cost: {
    subtotalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalDutyAmount?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
    totalTaxAmount?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>
    >;
  };
  attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
  discountCodes: Array<
    Pick<StorefrontAPI.CartDiscountCode, 'code' | 'applicable'>
  >;
};

export type MenuItemFragment = Pick<
  StorefrontAPI.MenuItem,
  'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
>;

export type ChildMenuItemFragment = Pick<
  StorefrontAPI.MenuItem,
  'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
>;

export type ParentMenuItemFragment = Pick<
  StorefrontAPI.MenuItem,
  'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
> & {
  items: Array<
    Pick<
      StorefrontAPI.MenuItem,
      'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
    >
  >;
};

export type MenuFragment = Pick<StorefrontAPI.Menu, 'id'> & {
  items: Array<
    Pick<
      StorefrontAPI.MenuItem,
      'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
    > & {
      items: Array<
        Pick<
          StorefrontAPI.MenuItem,
          'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
        >
      >;
    }
  >;
};

export type ShopFragment = Pick<
  StorefrontAPI.Shop,
  'id' | 'name' | 'description'
> & {
  primaryDomain: Pick<StorefrontAPI.Domain, 'url'>;
  brand?: StorefrontAPI.Maybe<{
    logo?: StorefrontAPI.Maybe<{
      image?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
      >;
    }>;
  }>;
};

export type HeaderQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  headerMenuHandle: StorefrontAPI.Scalars['String']['input'];
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type HeaderQuery = {
  shop: Pick<StorefrontAPI.Shop, 'id' | 'name' | 'description'> & {
    primaryDomain: Pick<StorefrontAPI.Domain, 'url'>;
    brand?: StorefrontAPI.Maybe<{
      logo?: StorefrontAPI.Maybe<{
        image?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
        >;
      }>;
    }>;
  };
  menu?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Menu, 'id'> & {
      items: Array<
        Pick<
          StorefrontAPI.MenuItem,
          'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
        > & {
          items: Array<
            Pick<
              StorefrontAPI.MenuItem,
              'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
            >
          >;
        }
      >;
    }
  >;
  headerBanners: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
        fields: Array<Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'>>;
      }
    >;
  };
  megaMenus: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'type' | 'handle'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'> & {
            reference?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'>
            >;
            references?: StorefrontAPI.Maybe<{
              nodes: Array<
                Pick<StorefrontAPI.Metaobject, 'id' | 'type' | 'handle'> & {
                  fields: Array<
                    Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'> & {
                      references?: StorefrontAPI.Maybe<{
                        nodes: Array<
                          Pick<
                            StorefrontAPI.Metaobject,
                            'id' | 'type' | 'handle'
                          > & {
                            fields: Array<
                              Pick<
                                StorefrontAPI.MetaobjectField,
                                'key' | 'value'
                              > & {
                                reference?: StorefrontAPI.Maybe<
                                  | Pick<
                                      StorefrontAPI.Collection,
                                      'id' | 'handle' | 'title'
                                    >
                                  | (Pick<
                                      StorefrontAPI.Metaobject,
                                      'id' | 'type' | 'handle'
                                    > & {
                                      fields: Array<
                                        Pick<
                                          StorefrontAPI.MetaobjectField,
                                          'key' | 'value'
                                        >
                                      >;
                                    })
                                >;
                              }
                            >;
                          }
                        >;
                      }>;
                    }
                  >;
                }
              >;
            }>;
          }
        >;
      }
    >;
  };
};

export type FooterQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  footerMenuHandle: StorefrontAPI.Scalars['String']['input'];
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type FooterQuery = {
  menu?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Menu, 'id'> & {
      items: Array<
        Pick<
          StorefrontAPI.MenuItem,
          'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
        > & {
          items: Array<
            Pick<
              StorefrontAPI.MenuItem,
              'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
            >
          >;
        }
      >;
    }
  >;
};

export type SimilarMotifsPreviewProductFragment = Pick<
  StorefrontAPI.Product,
  'id' | 'handle' | 'title'
> & {
  priceRange: {
    minVariantPrice: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
  };
  images: {
    nodes: Array<
      Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
    >;
  };
};

export type SimilarMotifsPreviewQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  categoryHandle: StorefrontAPI.Scalars['String']['input'];
  mainMotif: StorefrontAPI.Scalars['String']['input'];
  mainTheme: StorefrontAPI.Scalars['String']['input'];
  candidateLimit: StorefrontAPI.Scalars['Int']['input'];
}>;

export type SimilarMotifsPreviewQuery = {
  collection?: StorefrontAPI.Maybe<{
    sameMotif: {
      nodes: Array<
        Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
          priceRange: {
            minVariantPrice: Pick<
              StorefrontAPI.MoneyV2,
              'amount' | 'currencyCode'
            >;
          };
          images: {
            nodes: Array<
              Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
            >;
          };
        }
      >;
    };
    sameTheme: {
      nodes: Array<
        Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
          priceRange: {
            minVariantPrice: Pick<
              StorefrontAPI.MoneyV2,
              'amount' | 'currencyCode'
            >;
          };
          images: {
            nodes: Array<
              Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
            >;
          };
        }
      >;
    };
    fallback: {
      nodes: Array<
        Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
          priceRange: {
            minVariantPrice: Pick<
              StorefrontAPI.MoneyV2,
              'amount' | 'currencyCode'
            >;
          };
          images: {
            nodes: Array<
              Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
            >;
          };
        }
      >;
    };
  }>;
};

export type SimilarProductsBaseQueryVariables = StorefrontAPI.Exact<{
  handle: StorefrontAPI.Scalars['String']['input'];
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  first: StorefrontAPI.Scalars['Int']['input'];
  after?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['String']['input']>;
}>;

export type SimilarProductsBaseQuery = {
  collection?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'> & {
      products: {
        nodes: Array<
          Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
            mainMotif?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metafield, 'value'>
            >;
            mainTheme?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metafield, 'value'>
            >;
            priceRange: {
              minVariantPrice: Pick<
                StorefrontAPI.MoneyV2,
                'amount' | 'currencyCode'
              >;
            };
            images: {
              nodes: Array<Pick<StorefrontAPI.Image, 'url' | 'altText'>>;
            };
            collections: {
              nodes: Array<Pick<StorefrontAPI.Collection, 'handle' | 'title'>>;
            };
            options: Array<
              Pick<StorefrontAPI.ProductOption, 'name'> & {
                optionValues: Array<
                  Pick<StorefrontAPI.ProductOptionValue, 'name'> & {
                    swatch?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.ProductOptionValueSwatch, 'color'>
                    >;
                  }
                >;
              }
            >;
          }
        >;
        pageInfo: Pick<StorefrontAPI.PageInfo, 'hasNextPage' | 'endCursor'>;
      };
    }
  >;
};

export type SimilarProductsCollectionHandlesQueryVariables =
  StorefrontAPI.Exact<{
    country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
    language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
    first: StorefrontAPI.Scalars['Int']['input'];
    after?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['String']['input']>;
  }>;

export type SimilarProductsCollectionHandlesQuery = {
  collections: {
    nodes: Array<Pick<StorefrontAPI.Collection, 'handle'>>;
    pageInfo: Pick<StorefrontAPI.PageInfo, 'hasNextPage' | 'endCursor'>;
  };
};

export type StoreRobotsQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type StoreRobotsQuery = {shop: Pick<StorefrontAPI.Shop, 'id'>};

export type HeroSectionsQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type HeroSectionsQuery = {
  metaobjects: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'> & {
            reference?: StorefrontAPI.Maybe<
              | Pick<StorefrontAPI.Collection, 'handle'>
              | Pick<StorefrontAPI.GenericFile, 'url'>
              | {
                  image?: StorefrontAPI.Maybe<
                    Pick<
                      StorefrontAPI.Image,
                      'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                }
            >;
          }
        >;
      }
    >;
  };
};

export type UspBarMetaobjectsQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type UspBarMetaobjectsQuery = {
  metaobjects: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'> & {
            reference?: StorefrontAPI.Maybe<
              | Pick<StorefrontAPI.GenericFile, 'url'>
              | {
                  image?: StorefrontAPI.Maybe<
                    Pick<
                      StorefrontAPI.Image,
                      'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                }
            >;
          }
        >;
      }
    >;
  };
};

export type UspBarIconsQueryVariables = StorefrontAPI.Exact<{
  ids:
    | Array<StorefrontAPI.Scalars['ID']['input']>
    | StorefrontAPI.Scalars['ID']['input'];
}>;

export type UspBarIconsQuery = {
  nodes: Array<
    StorefrontAPI.Maybe<
      Pick<StorefrontAPI.MediaImage, 'id'> & {
        image?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
        >;
      }
    >
  >;
};

export type BestsellerProductsHomepageQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type BestsellerProductsHomepageQuery = {
  collection?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Collection, 'id' | 'title'> & {
      products: {
        nodes: Array<
          Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
            images: {
              nodes: Array<
                Pick<
                  StorefrontAPI.Image,
                  'id' | 'url' | 'altText' | 'width' | 'height'
                >
              >;
            };
            priceRange: {
              minVariantPrice: Pick<
                StorefrontAPI.MoneyV2,
                'amount' | 'currencyCode'
              >;
            };
          }
        >;
      };
    }
  >;
};

export type CustomGridMetaobjectsQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type CustomGridMetaobjectsQuery = {
  metaobjects: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value' | 'type'> & {
            reference?: StorefrontAPI.Maybe<
              | Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'>
              | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
              | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                  image?: StorefrontAPI.Maybe<
                    Pick<
                      StorefrontAPI.Image,
                      'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                })
            >;
            references?: StorefrontAPI.Maybe<{
              nodes: Array<
                | Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'>
                | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                    image?: StorefrontAPI.Maybe<
                      Pick<
                        StorefrontAPI.Image,
                        'url' | 'altText' | 'width' | 'height'
                      >
                    >;
                  })
              >;
            }>;
          }
        >;
      }
    >;
  };
};

export type StepByStepMetaobjectQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type StepByStepMetaobjectQuery = {
  metaobjects: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value' | 'type'> & {
            reference?: StorefrontAPI.Maybe<
              | Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'>
              | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
              | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                  image?: StorefrontAPI.Maybe<
                    Pick<
                      StorefrontAPI.Image,
                      'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                })
            >;
            references?: StorefrontAPI.Maybe<{
              nodes: Array<
                | Pick<StorefrontAPI.Collection, 'id' | 'handle' | 'title'>
                | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                    image?: StorefrontAPI.Maybe<
                      Pick<
                        StorefrontAPI.Image,
                        'url' | 'altText' | 'width' | 'height'
                      >
                    >;
                  })
              >;
            }>;
          }
        >;
      }
    >;
  };
};

export type CustomerReviewsMetaobjectQueryVariables = StorefrontAPI.Exact<{
  [key: string]: never;
}>;

export type CustomerReviewsMetaobjectQuery = {
  metaobjects: {
    nodes: Array<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
        fields: Array<
          Pick<StorefrontAPI.MetaobjectField, 'key' | 'value' | 'type'> & {
            reference?: StorefrontAPI.Maybe<
              | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
              | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                  image?: StorefrontAPI.Maybe<
                    Pick<
                      StorefrontAPI.Image,
                      'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                })
            >;
            references?: StorefrontAPI.Maybe<{
              nodes: Array<
                | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                    image?: StorefrontAPI.Maybe<
                      Pick<
                        StorefrontAPI.Image,
                        'url' | 'altText' | 'width' | 'height'
                      >
                    >;
                  })
              >;
            }>;
          }
        >;
      }
    >;
  };
};

export type FeaturedCollectionFragment = Pick<
  StorefrontAPI.Collection,
  'id' | 'title' | 'handle'
> & {
  image?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>
  >;
};

export type FeaturedCollectionQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type FeaturedCollectionQuery = {
  collections: {
    nodes: Array<
      Pick<StorefrontAPI.Collection, 'id' | 'title' | 'handle'> & {
        image?: StorefrontAPI.Maybe<
          Pick<
            StorefrontAPI.Image,
            'id' | 'url' | 'altText' | 'width' | 'height'
          >
        >;
      }
    >;
  };
};

export type RecommendedProductFragment = Pick<
  StorefrontAPI.Product,
  'id' | 'title' | 'handle'
> & {
  priceRange: {
    minVariantPrice: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
  };
  featuredImage?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>
  >;
};

export type RecommendedProductsQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type RecommendedProductsQuery = {
  products: {
    nodes: Array<
      Pick<StorefrontAPI.Product, 'id' | 'title' | 'handle'> & {
        priceRange: {
          minVariantPrice: Pick<
            StorefrontAPI.MoneyV2,
            'amount' | 'currencyCode'
          >;
        };
        featuredImage?: StorefrontAPI.Maybe<
          Pick<
            StorefrontAPI.Image,
            'id' | 'url' | 'altText' | 'width' | 'height'
          >
        >;
      }
    >;
  };
};

export type ArticleQueryVariables = StorefrontAPI.Exact<{
  articleHandle: StorefrontAPI.Scalars['String']['input'];
  blogHandle: StorefrontAPI.Scalars['String']['input'];
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type ArticleQuery = {
  blog?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Blog, 'title' | 'handle'> & {
      articleByHandle?: StorefrontAPI.Maybe<
        Pick<
          StorefrontAPI.Article,
          'handle' | 'title' | 'contentHtml' | 'publishedAt'
        > & {
          author?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.ArticleAuthor, 'name'>
          >;
          image?: StorefrontAPI.Maybe<
            Pick<
              StorefrontAPI.Image,
              'id' | 'altText' | 'url' | 'width' | 'height'
            >
          >;
          seo?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Seo, 'description' | 'title'>
          >;
        }
      >;
      articles: {
        nodes: Array<
          Pick<
            StorefrontAPI.Article,
            'id' | 'handle' | 'title' | 'excerpt' | 'publishedAt'
          > & {
            image?: StorefrontAPI.Maybe<
              Pick<
                StorefrontAPI.Image,
                'id' | 'altText' | 'url' | 'width' | 'height'
              >
            >;
          }
        >;
      };
    }
  >;
};

export type BlogQueryVariables = StorefrontAPI.Exact<{
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  blogHandle: StorefrontAPI.Scalars['String']['input'];
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  last?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  startCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  endCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
}>;

export type BlogQuery = {
  blog?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Blog, 'title' | 'handle'> & {
      seo?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Seo, 'title' | 'description'>
      >;
      articles: {
        nodes: Array<
          Pick<
            StorefrontAPI.Article,
            | 'contentHtml'
            | 'excerpt'
            | 'handle'
            | 'id'
            | 'publishedAt'
            | 'title'
          > & {
            author?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.ArticleAuthor, 'name'>
            >;
            image?: StorefrontAPI.Maybe<
              Pick<
                StorefrontAPI.Image,
                'id' | 'altText' | 'url' | 'width' | 'height'
              >
            >;
            blog: Pick<StorefrontAPI.Blog, 'handle'>;
          }
        >;
        pageInfo: Pick<
          StorefrontAPI.PageInfo,
          'hasPreviousPage' | 'hasNextPage' | 'endCursor' | 'startCursor'
        >;
      };
    }
  >;
};

export type ArticleItemFragment = Pick<
  StorefrontAPI.Article,
  'contentHtml' | 'excerpt' | 'handle' | 'id' | 'publishedAt' | 'title'
> & {
  author?: StorefrontAPI.Maybe<Pick<StorefrontAPI.ArticleAuthor, 'name'>>;
  image?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Image, 'id' | 'altText' | 'url' | 'width' | 'height'>
  >;
  blog: Pick<StorefrontAPI.Blog, 'handle'>;
};

export type BlogsQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  endCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  last?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  startCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
}>;

export type BlogsQuery = {
  blogs: {
    pageInfo: Pick<
      StorefrontAPI.PageInfo,
      'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'
    >;
    nodes: Array<
      Pick<StorefrontAPI.Blog, 'title' | 'handle'> & {
        seo?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Seo, 'title' | 'description'>
        >;
        blogCategoryDescription?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Metafield, 'value'>
        >;
        blogCategoryImage?: StorefrontAPI.Maybe<{
          reference?: StorefrontAPI.Maybe<{
            image?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
            >;
          }>;
        }>;
      }
    >;
  };
  blogListingContent: {
    nodes: Array<{
      fields: Array<Pick<StorefrontAPI.MetaobjectField, 'key' | 'value'>>;
    }>;
  };
};

export type CartUpsellProductsQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  collectionHandle: StorefrontAPI.Scalars['String']['input'];
}>;

export type CartUpsellProductsQuery = {
  collection?: StorefrontAPI.Maybe<{
    cartUpsellProducts?: StorefrontAPI.Maybe<{
      references?: StorefrontAPI.Maybe<{
        nodes: Array<
          | {
              __typename:
                | 'Collection'
                | 'GenericFile'
                | 'MediaImage'
                | 'Metaobject'
                | 'Model3d'
                | 'Page'
                | 'ProductVariant'
                | 'Video';
            }
          | ({__typename: 'Product'} & Pick<
              StorefrontAPI.Product,
              'id' | 'handle' | 'title'
            > & {
                featuredImage?: StorefrontAPI.Maybe<
                  Pick<
                    StorefrontAPI.Image,
                    'url' | 'altText' | 'width' | 'height'
                  >
                >;
                selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
                  Pick<
                    StorefrontAPI.ProductVariant,
                    'id' | 'availableForSale'
                  > & {
                    price: Pick<
                      StorefrontAPI.MoneyV2,
                      'amount' | 'currencyCode'
                    >;
                  }
                >;
              })
        >;
      }>;
    }>;
  }>;
};

export type CustomProductCardFieldsFragment = Pick<
  StorefrontAPI.Product,
  'id' | 'handle' | 'title'
> & {
  mainMotif?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
  mainTheme?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
  priceRange: {
    minVariantPrice: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
  };
  images: {nodes: Array<Pick<StorefrontAPI.Image, 'url' | 'altText'>>};
};

export type CustomCollectionQueryVariables = StorefrontAPI.Exact<{
  handle: StorefrontAPI.Scalars['String']['input'];
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  last?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  startCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  endCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  filters?: StorefrontAPI.InputMaybe<
    Array<StorefrontAPI.ProductFilter> | StorefrontAPI.ProductFilter
  >;
  sortKey?: StorefrontAPI.InputMaybe<StorefrontAPI.ProductCollectionSortKeys>;
  reverse?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Boolean']['input']>;
}>;

export type CustomCollectionQuery = {
  collection?: StorefrontAPI.Maybe<
    Pick<
      StorefrontAPI.Collection,
      'id' | 'handle' | 'title' | 'description'
    > & {
      pageType?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
      seo: Pick<StorefrontAPI.Seo, 'description' | 'title'>;
      image?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
      >;
      products: {
        filters: Array<
          Pick<StorefrontAPI.Filter, 'id' | 'label' | 'type'> & {
            values: Array<
              Pick<
                StorefrontAPI.FilterValue,
                'id' | 'label' | 'count' | 'input'
              >
            >;
          }
        >;
        nodes: Array<
          Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
            mainMotif?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metafield, 'value'>
            >;
            mainTheme?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metafield, 'value'>
            >;
            priceRange: {
              minVariantPrice: Pick<
                StorefrontAPI.MoneyV2,
                'amount' | 'currencyCode'
              >;
            };
            images: {
              nodes: Array<Pick<StorefrontAPI.Image, 'url' | 'altText'>>;
            };
          }
        >;
        pageInfo: Pick<
          StorefrontAPI.PageInfo,
          'hasPreviousPage' | 'hasNextPage' | 'endCursor' | 'startCursor'
        >;
      };
    }
  >;
};

export type CollectionFragment = Pick<
  StorefrontAPI.Collection,
  'id' | 'title' | 'handle'
> & {
  showListing?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
  image?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>
  >;
};

export type StoreCollectionsQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type StoreCollectionsQuery = {
  collections: {
    nodes: Array<
      Pick<StorefrontAPI.Collection, 'id' | 'title' | 'handle'> & {
        showListing?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Metafield, 'value'>
        >;
        image?: StorefrontAPI.Maybe<
          Pick<
            StorefrontAPI.Image,
            'id' | 'url' | 'altText' | 'width' | 'height'
          >
        >;
      }
    >;
  };
};

export type MoneyCollectionItemFragment = Pick<
  StorefrontAPI.MoneyV2,
  'amount' | 'currencyCode'
>;

export type CollectionItemFragment = Pick<
  StorefrontAPI.Product,
  'id' | 'handle' | 'title'
> & {
  featuredImage?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Image, 'id' | 'altText' | 'url' | 'width' | 'height'>
  >;
  priceRange: {
    minVariantPrice: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
    maxVariantPrice: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
  };
};

export type CatalogQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  last?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  startCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  endCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
}>;

export type CatalogQuery = {
  products: {
    nodes: Array<
      Pick<StorefrontAPI.Product, 'id' | 'handle' | 'title'> & {
        featuredImage?: StorefrontAPI.Maybe<
          Pick<
            StorefrontAPI.Image,
            'id' | 'altText' | 'url' | 'width' | 'height'
          >
        >;
        priceRange: {
          minVariantPrice: Pick<
            StorefrontAPI.MoneyV2,
            'amount' | 'currencyCode'
          >;
          maxVariantPrice: Pick<
            StorefrontAPI.MoneyV2,
            'amount' | 'currencyCode'
          >;
        };
      }
    >;
    pageInfo: Pick<
      StorefrontAPI.PageInfo,
      'hasPreviousPage' | 'hasNextPage' | 'startCursor' | 'endCursor'
    >;
  };
};

export type CustomerReviewsPageMetaobjectFragment = Pick<
  StorefrontAPI.Metaobject,
  'id' | 'handle' | 'type'
> & {
  fields: Array<
    Pick<StorefrontAPI.MetaobjectField, 'key' | 'value' | 'type'> & {
      reference?: StorefrontAPI.Maybe<
        | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
        | (Pick<StorefrontAPI.MediaImage, 'id'> & {
            image?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
            >;
          })
      >;
      references?: StorefrontAPI.Maybe<{
        nodes: Array<
          | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
          | (Pick<StorefrontAPI.MediaImage, 'id'> & {
              image?: StorefrontAPI.Maybe<
                Pick<
                  StorefrontAPI.Image,
                  'url' | 'altText' | 'width' | 'height'
                >
              >;
            })
        >;
      }>;
    }
  >;
};

export type PageQueryVariables = StorefrontAPI.Exact<{
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  handle: StorefrontAPI.Scalars['String']['input'];
}>;

export type PageQuery = {
  page?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Page, 'handle' | 'id' | 'title' | 'body'> & {
      pageType?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
      erfahrungenHero?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'type'> & {
          reference?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
              fields: Array<
                Pick<
                  StorefrontAPI.MetaobjectField,
                  'key' | 'value' | 'type'
                > & {
                  reference?: StorefrontAPI.Maybe<
                    | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                    | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                        image?: StorefrontAPI.Maybe<
                          Pick<
                            StorefrontAPI.Image,
                            'url' | 'altText' | 'width' | 'height'
                          >
                        >;
                      })
                  >;
                  references?: StorefrontAPI.Maybe<{
                    nodes: Array<
                      | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                      | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                          image?: StorefrontAPI.Maybe<
                            Pick<
                              StorefrontAPI.Image,
                              'url' | 'altText' | 'width' | 'height'
                            >
                          >;
                        })
                    >;
                  }>;
                }
              >;
            }
          >;
        }
      >;
      customerReviews?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'type'> & {
          reference?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
              fields: Array<
                Pick<
                  StorefrontAPI.MetaobjectField,
                  'key' | 'value' | 'type'
                > & {
                  reference?: StorefrontAPI.Maybe<
                    | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                    | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                        image?: StorefrontAPI.Maybe<
                          Pick<
                            StorefrontAPI.Image,
                            'url' | 'altText' | 'width' | 'height'
                          >
                        >;
                      })
                  >;
                  references?: StorefrontAPI.Maybe<{
                    nodes: Array<
                      | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                      | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                          image?: StorefrontAPI.Maybe<
                            Pick<
                              StorefrontAPI.Image,
                              'url' | 'altText' | 'width' | 'height'
                            >
                          >;
                        })
                    >;
                  }>;
                }
              >;
            }
          >;
          references?: StorefrontAPI.Maybe<{
            nodes: Array<
              Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
                fields: Array<
                  Pick<
                    StorefrontAPI.MetaobjectField,
                    'key' | 'value' | 'type'
                  > & {
                    reference?: StorefrontAPI.Maybe<
                      | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                      | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                          image?: StorefrontAPI.Maybe<
                            Pick<
                              StorefrontAPI.Image,
                              'url' | 'altText' | 'width' | 'height'
                            >
                          >;
                        })
                    >;
                    references?: StorefrontAPI.Maybe<{
                      nodes: Array<
                        | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                        | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                            image?: StorefrontAPI.Maybe<
                              Pick<
                                StorefrontAPI.Image,
                                'url' | 'altText' | 'width' | 'height'
                              >
                            >;
                          })
                      >;
                    }>;
                  }
                >;
              }
            >;
          }>;
        }
      >;
      erfahrungenSteps?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'type'> & {
          reference?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Metaobject, 'id' | 'handle' | 'type'> & {
              fields: Array<
                Pick<
                  StorefrontAPI.MetaobjectField,
                  'key' | 'value' | 'type'
                > & {
                  reference?: StorefrontAPI.Maybe<
                    | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                    | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                        image?: StorefrontAPI.Maybe<
                          Pick<
                            StorefrontAPI.Image,
                            'url' | 'altText' | 'width' | 'height'
                          >
                        >;
                      })
                  >;
                  references?: StorefrontAPI.Maybe<{
                    nodes: Array<
                      | Pick<StorefrontAPI.GenericFile, 'id' | 'url'>
                      | (Pick<StorefrontAPI.MediaImage, 'id'> & {
                          image?: StorefrontAPI.Maybe<
                            Pick<
                              StorefrontAPI.Image,
                              'url' | 'altText' | 'width' | 'height'
                            >
                          >;
                        })
                    >;
                  }>;
                }
              >;
            }
          >;
        }
      >;
      seo?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Seo, 'description' | 'title'>
      >;
    }
  >;
};

export type PolicyFragment = Pick<
  StorefrontAPI.ShopPolicy,
  'body' | 'handle' | 'id' | 'title' | 'url'
>;

export type PolicyQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  privacyPolicy: StorefrontAPI.Scalars['Boolean']['input'];
  refundPolicy: StorefrontAPI.Scalars['Boolean']['input'];
  shippingPolicy: StorefrontAPI.Scalars['Boolean']['input'];
  termsOfService: StorefrontAPI.Scalars['Boolean']['input'];
}>;

export type PolicyQuery = {
  shop: {
    privacyPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'body' | 'handle' | 'id' | 'title' | 'url'>
    >;
    shippingPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'body' | 'handle' | 'id' | 'title' | 'url'>
    >;
    termsOfService?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'body' | 'handle' | 'id' | 'title' | 'url'>
    >;
    refundPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'body' | 'handle' | 'id' | 'title' | 'url'>
    >;
  };
};

export type PolicyItemFragment = Pick<
  StorefrontAPI.ShopPolicy,
  'id' | 'title' | 'handle'
>;

export type PoliciesQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type PoliciesQuery = {
  shop: {
    privacyPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'id' | 'title' | 'handle'>
    >;
    shippingPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'id' | 'title' | 'handle'>
    >;
    termsOfService?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'id' | 'title' | 'handle'>
    >;
    refundPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicy, 'id' | 'title' | 'handle'>
    >;
    subscriptionPolicy?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ShopPolicyWithDefault, 'id' | 'title' | 'handle'>
    >;
  };
};

export type ProductVariantFragment = Pick<
  StorefrontAPI.ProductVariant,
  'availableForSale' | 'id' | 'sku' | 'title'
> & {
  compareAtPrice?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
  >;
  image?: StorefrontAPI.Maybe<
    {__typename: 'Image'} & Pick<
      StorefrontAPI.Image,
      'id' | 'url' | 'altText' | 'width' | 'height'
    >
  >;
  price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
  product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
  selectedOptions: Array<Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>>;
  unitPrice?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
  >;
  printQuality?: StorefrontAPI.Maybe<{
    reference?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
        title?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        badge?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        pricePerM2?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        priceWithoutDiscount?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        minWidthCm?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        maxWidthCm?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        minHeightCm?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        maxHeightCm?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        properties?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MetaobjectField, 'value'>
        >;
        image?: StorefrontAPI.Maybe<{
          reference?: StorefrontAPI.Maybe<{
            image?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Image, 'url' | 'altText'>
            >;
          }>;
        }>;
      }
    >;
  }>;
};

export type ProductFragment = Pick<
  StorefrontAPI.Product,
  | 'id'
  | 'title'
  | 'vendor'
  | 'handle'
  | 'descriptionHtml'
  | 'description'
  | 'encodedVariantExistence'
  | 'encodedVariantAvailability'
> & {
  images: {
    edges: Array<{
      node: Pick<
        StorefrontAPI.Image,
        'id' | 'url' | 'altText' | 'width' | 'height'
      >;
    }>;
  };
  options: Array<
    Pick<StorefrontAPI.ProductOption, 'name'> & {
      optionValues: Array<
        Pick<StorefrontAPI.ProductOptionValue, 'name'> & {
          firstSelectableVariant?: StorefrontAPI.Maybe<
            Pick<
              StorefrontAPI.ProductVariant,
              'availableForSale' | 'id' | 'sku' | 'title'
            > & {
              compareAtPrice?: StorefrontAPI.Maybe<
                Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
              >;
              image?: StorefrontAPI.Maybe<
                {__typename: 'Image'} & Pick<
                  StorefrontAPI.Image,
                  'id' | 'url' | 'altText' | 'width' | 'height'
                >
              >;
              price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
              product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
              selectedOptions: Array<
                Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
              >;
              unitPrice?: StorefrontAPI.Maybe<
                Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
              >;
              printQuality?: StorefrontAPI.Maybe<{
                reference?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
                    title?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    badge?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    pricePerM2?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    priceWithoutDiscount?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    minWidthCm?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    maxWidthCm?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    minHeightCm?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    maxHeightCm?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    properties?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.MetaobjectField, 'value'>
                    >;
                    image?: StorefrontAPI.Maybe<{
                      reference?: StorefrontAPI.Maybe<{
                        image?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.Image, 'url' | 'altText'>
                        >;
                      }>;
                    }>;
                  }
                >;
              }>;
            }
          >;
          swatch?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.ProductOptionValueSwatch, 'color'> & {
              image?: StorefrontAPI.Maybe<{
                previewImage?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.Image, 'url'>
                >;
              }>;
            }
          >;
        }
      >;
    }
  >;
  selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
    Pick<
      StorefrontAPI.ProductVariant,
      'availableForSale' | 'id' | 'sku' | 'title'
    > & {
      compareAtPrice?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
      >;
      image?: StorefrontAPI.Maybe<
        {__typename: 'Image'} & Pick<
          StorefrontAPI.Image,
          'id' | 'url' | 'altText' | 'width' | 'height'
        >
      >;
      price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
      product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
      selectedOptions: Array<
        Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
      >;
      unitPrice?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
      >;
      printQuality?: StorefrontAPI.Maybe<{
        reference?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
            title?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            badge?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            pricePerM2?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            priceWithoutDiscount?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            minWidthCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            maxWidthCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            minHeightCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            maxHeightCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            properties?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            image?: StorefrontAPI.Maybe<{
              reference?: StorefrontAPI.Maybe<{
                image?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.Image, 'url' | 'altText'>
                >;
              }>;
            }>;
          }
        >;
      }>;
    }
  >;
  adjacentVariants: Array<
    Pick<
      StorefrontAPI.ProductVariant,
      'availableForSale' | 'id' | 'sku' | 'title'
    > & {
      compareAtPrice?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
      >;
      image?: StorefrontAPI.Maybe<
        {__typename: 'Image'} & Pick<
          StorefrontAPI.Image,
          'id' | 'url' | 'altText' | 'width' | 'height'
        >
      >;
      price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
      product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
      selectedOptions: Array<
        Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
      >;
      unitPrice?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
      >;
      printQuality?: StorefrontAPI.Maybe<{
        reference?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
            title?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            badge?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            pricePerM2?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            priceWithoutDiscount?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            minWidthCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            maxWidthCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            minHeightCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            maxHeightCm?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            properties?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.MetaobjectField, 'value'>
            >;
            image?: StorefrontAPI.Maybe<{
              reference?: StorefrontAPI.Maybe<{
                image?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.Image, 'url' | 'altText'>
                >;
              }>;
            }>;
          }
        >;
      }>;
    }
  >;
  seo: Pick<StorefrontAPI.Seo, 'description' | 'title'>;
  productInfo?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Metafield, 'value' | 'type'>
  >;
  deliveryAndShipping?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Metafield, 'value' | 'type'>
  >;
  masterAssetId?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Metafield, 'value' | 'type'>
  >;
  productLayout?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
  mainMotif?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
  mainTheme?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
};

export type ProductQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  handle: StorefrontAPI.Scalars['String']['input'];
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  selectedOptions:
    | Array<StorefrontAPI.SelectedOptionInput>
    | StorefrontAPI.SelectedOptionInput;
}>;

export type ProductQuery = {
  product?: StorefrontAPI.Maybe<
    Pick<
      StorefrontAPI.Product,
      | 'id'
      | 'title'
      | 'vendor'
      | 'handle'
      | 'descriptionHtml'
      | 'description'
      | 'encodedVariantExistence'
      | 'encodedVariantAvailability'
    > & {
      images: {
        edges: Array<{
          node: Pick<
            StorefrontAPI.Image,
            'id' | 'url' | 'altText' | 'width' | 'height'
          >;
        }>;
      };
      options: Array<
        Pick<StorefrontAPI.ProductOption, 'name'> & {
          optionValues: Array<
            Pick<StorefrontAPI.ProductOptionValue, 'name'> & {
              firstSelectableVariant?: StorefrontAPI.Maybe<
                Pick<
                  StorefrontAPI.ProductVariant,
                  'availableForSale' | 'id' | 'sku' | 'title'
                > & {
                  compareAtPrice?: StorefrontAPI.Maybe<
                    Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
                  >;
                  image?: StorefrontAPI.Maybe<
                    {__typename: 'Image'} & Pick<
                      StorefrontAPI.Image,
                      'id' | 'url' | 'altText' | 'width' | 'height'
                    >
                  >;
                  price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
                  product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
                  selectedOptions: Array<
                    Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
                  >;
                  unitPrice?: StorefrontAPI.Maybe<
                    Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
                  >;
                  printQuality?: StorefrontAPI.Maybe<{
                    reference?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
                        title?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        badge?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        pricePerM2?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        priceWithoutDiscount?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        minWidthCm?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        maxWidthCm?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        minHeightCm?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        maxHeightCm?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        properties?: StorefrontAPI.Maybe<
                          Pick<StorefrontAPI.MetaobjectField, 'value'>
                        >;
                        image?: StorefrontAPI.Maybe<{
                          reference?: StorefrontAPI.Maybe<{
                            image?: StorefrontAPI.Maybe<
                              Pick<StorefrontAPI.Image, 'url' | 'altText'>
                            >;
                          }>;
                        }>;
                      }
                    >;
                  }>;
                }
              >;
              swatch?: StorefrontAPI.Maybe<
                Pick<StorefrontAPI.ProductOptionValueSwatch, 'color'> & {
                  image?: StorefrontAPI.Maybe<{
                    previewImage?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.Image, 'url'>
                    >;
                  }>;
                }
              >;
            }
          >;
        }
      >;
      selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
        Pick<
          StorefrontAPI.ProductVariant,
          'availableForSale' | 'id' | 'sku' | 'title'
        > & {
          compareAtPrice?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
          >;
          image?: StorefrontAPI.Maybe<
            {__typename: 'Image'} & Pick<
              StorefrontAPI.Image,
              'id' | 'url' | 'altText' | 'width' | 'height'
            >
          >;
          price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
          product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
          selectedOptions: Array<
            Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
          >;
          unitPrice?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
          >;
          printQuality?: StorefrontAPI.Maybe<{
            reference?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
                title?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                badge?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                pricePerM2?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                priceWithoutDiscount?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                minWidthCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                maxWidthCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                minHeightCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                maxHeightCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                properties?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                image?: StorefrontAPI.Maybe<{
                  reference?: StorefrontAPI.Maybe<{
                    image?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.Image, 'url' | 'altText'>
                    >;
                  }>;
                }>;
              }
            >;
          }>;
        }
      >;
      adjacentVariants: Array<
        Pick<
          StorefrontAPI.ProductVariant,
          'availableForSale' | 'id' | 'sku' | 'title'
        > & {
          compareAtPrice?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
          >;
          image?: StorefrontAPI.Maybe<
            {__typename: 'Image'} & Pick<
              StorefrontAPI.Image,
              'id' | 'url' | 'altText' | 'width' | 'height'
            >
          >;
          price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
          product: Pick<StorefrontAPI.Product, 'title' | 'handle'>;
          selectedOptions: Array<
            Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>
          >;
          unitPrice?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
          >;
          printQuality?: StorefrontAPI.Maybe<{
            reference?: StorefrontAPI.Maybe<
              Pick<StorefrontAPI.Metaobject, 'id' | 'handle'> & {
                title?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                badge?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                pricePerM2?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                priceWithoutDiscount?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                minWidthCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                maxWidthCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                minHeightCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                maxHeightCm?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                properties?: StorefrontAPI.Maybe<
                  Pick<StorefrontAPI.MetaobjectField, 'value'>
                >;
                image?: StorefrontAPI.Maybe<{
                  reference?: StorefrontAPI.Maybe<{
                    image?: StorefrontAPI.Maybe<
                      Pick<StorefrontAPI.Image, 'url' | 'altText'>
                    >;
                  }>;
                }>;
              }
            >;
          }>;
        }
      >;
      seo: Pick<StorefrontAPI.Seo, 'description' | 'title'>;
      productInfo?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'value' | 'type'>
      >;
      deliveryAndShipping?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'value' | 'type'>
      >;
      masterAssetId?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'value' | 'type'>
      >;
      productLayout?: StorefrontAPI.Maybe<
        Pick<StorefrontAPI.Metafield, 'value'>
      >;
      mainMotif?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
      mainTheme?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Metafield, 'value'>>;
    }
  >;
};

export type SearchProductFragment = {__typename: 'Product'} & Pick<
  StorefrontAPI.Product,
  'handle' | 'id' | 'title' | 'trackingParameters'
> & {
    selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.ProductVariant, 'id'> & {
        image?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
        >;
        price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
        compareAtPrice?: StorefrontAPI.Maybe<
          Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
        >;
      }
    >;
  };

export type SearchPageFragment = {__typename: 'Page'} & Pick<
  StorefrontAPI.Page,
  'handle' | 'id' | 'title' | 'trackingParameters'
>;

export type SearchArticleFragment = {__typename: 'Article'} & Pick<
  StorefrontAPI.Article,
  'handle' | 'id' | 'title' | 'trackingParameters'
> & {blog: Pick<StorefrontAPI.Blog, 'handle'>};

export type PageInfoFragmentFragment = Pick<
  StorefrontAPI.PageInfo,
  'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'
>;

export type RegularSearchQueryVariables = StorefrontAPI.Exact<{
  contentFirst: StorefrontAPI.Scalars['Int']['input'];
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  endCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
  first?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  last?: StorefrontAPI.InputMaybe<StorefrontAPI.Scalars['Int']['input']>;
  term: StorefrontAPI.Scalars['String']['input'];
  startCursor?: StorefrontAPI.InputMaybe<
    StorefrontAPI.Scalars['String']['input']
  >;
}>;

export type RegularSearchQuery = {
  articles: {
    nodes: Array<
      {__typename: 'Article'} & Pick<
        StorefrontAPI.Article,
        'handle' | 'id' | 'title' | 'trackingParameters'
      > & {blog: Pick<StorefrontAPI.Blog, 'handle'>}
    >;
  };
  pages: {
    nodes: Array<
      {__typename: 'Page'} & Pick<
        StorefrontAPI.Page,
        'handle' | 'id' | 'title' | 'trackingParameters'
      >
    >;
  };
  products: {
    nodes: Array<
      {__typename: 'Product'} & Pick<
        StorefrontAPI.Product,
        'handle' | 'id' | 'title' | 'trackingParameters'
      > & {
          selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.ProductVariant, 'id'> & {
              image?: StorefrontAPI.Maybe<
                Pick<
                  StorefrontAPI.Image,
                  'url' | 'altText' | 'width' | 'height'
                >
              >;
              price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
              compareAtPrice?: StorefrontAPI.Maybe<
                Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>
              >;
            }
          >;
        }
    >;
    pageInfo: Pick<
      StorefrontAPI.PageInfo,
      'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'
    >;
  };
};

export type PredictiveSearchQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  limit: StorefrontAPI.Scalars['Int']['input'];
  limitScope: StorefrontAPI.PredictiveSearchLimitScope;
  term: StorefrontAPI.Scalars['String']['input'];
}>;

export type PredictiveSearchQuery = {
  predictiveSearch?: StorefrontAPI.Maybe<{
    articles: Array<
      {__typename: 'Article'} & Pick<
        StorefrontAPI.Article,
        'id' | 'title' | 'handle' | 'trackingParameters'
      > & {
          blog: Pick<StorefrontAPI.Blog, 'handle'>;
          image?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
          >;
        }
    >;
    collections: Array<
      {__typename: 'Collection'} & Pick<
        StorefrontAPI.Collection,
        'id' | 'title' | 'handle' | 'trackingParameters'
      > & {
          image?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.Image, 'url' | 'altText' | 'width' | 'height'>
          >;
        }
    >;
    pages: Array<
      {__typename: 'Page'} & Pick<
        StorefrontAPI.Page,
        'id' | 'title' | 'handle' | 'trackingParameters'
      >
    >;
    products: Array<
      {__typename: 'Product'} & Pick<
        StorefrontAPI.Product,
        'id' | 'title' | 'handle' | 'trackingParameters'
      > & {
          selectedOrFirstAvailableVariant?: StorefrontAPI.Maybe<
            Pick<StorefrontAPI.ProductVariant, 'id'> & {
              image?: StorefrontAPI.Maybe<
                Pick<
                  StorefrontAPI.Image,
                  'url' | 'altText' | 'width' | 'height'
                >
              >;
              price: Pick<StorefrontAPI.MoneyV2, 'amount' | 'currencyCode'>;
            }
          >;
        }
    >;
    queries: Array<
      {__typename: 'SearchQuerySuggestion'} & Pick<
        StorefrontAPI.SearchQuerySuggestion,
        'text' | 'styledText' | 'trackingParameters'
      >
    >;
  }>;
};

export type ArticleSitemapQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
  blogsFirst: StorefrontAPI.Scalars['Int']['input'];
  articlesFirst: StorefrontAPI.Scalars['Int']['input'];
}>;

export type ArticleSitemapQuery = {
  blogs: {
    nodes: Array<
      Pick<StorefrontAPI.Blog, 'handle'> & {
        articles: {
          nodes: Array<Pick<StorefrontAPI.Article, 'handle' | 'publishedAt'>>;
        };
      }
    >;
  };
};

interface GeneratedQueryTypes {
  '#graphql\n  query AccountFavoritesProducts(\n    $ids: [ID!]!\n    $country: CountryCode\n    $language: LanguageCode\n  ) @inContext(country: $country, language: $language) {\n    nodes(ids: $ids) {\n      ... on Product {\n        __typename\n        id\n        handle\n        title\n        priceRange {\n          minVariantPrice {\n            amount\n            currencyCode\n          }\n        }\n        images(first: 3) {\n          nodes {\n            url\n            altText\n          }\n        }\n      }\n    }\n  }\n': {
    return: AccountFavoritesProductsQuery;
    variables: AccountFavoritesProductsQueryVariables;
  };
  '#graphql\n  fragment Shop on Shop {\n    id\n    name\n    description\n    primaryDomain { url }\n    brand {\n      logo {\n        image { url altText width height }\n      }\n    }\n  }\n\n  query Header(\n    $country: CountryCode\n    $headerMenuHandle: String!\n    $language: LanguageCode\n  ) @inContext(language: $language, country: $country) {\n    shop { ...Shop }\n\n    menu(handle: $headerMenuHandle) {\n      ...Menu\n    }\n\n    headerBanners: metaobjects(type: "header_banner", first: 1) {\n      nodes {\n        id\n        handle\n        fields {\n          key\n          value\n        }\n      }\n    }\n\n    megaMenus: metaobjects(type: "mega_menu", first: 50) {\n      nodes {\n        id\n        type\n        handle\n\n        # ROOT fields:\n        # - trigger_handle (value)\n        # - base_collection (reference)\n        # - columns (references)\n        fields {\n          key\n          value\n\n          reference {\n            ... on Collection {\n              id\n              handle\n              title\n            }\n          }\n\n          references(first: 50) {\n            nodes {\n              ... on Metaobject {\n                id\n                type\n                handle\n\n                # COLUMN fields:\n                # - title (value)\n                # - items (references)\n                fields {\n                  key\n                  value\n\n                  references(first: 50) {\n                    nodes {\n                      ... on Metaobject {\n                        id\n                        type\n                        handle\n\n                        # ITEM fields:\n                        # - label (value)\n                        # - action_type (value)\n                        # - collection (reference)\n                        # - filter_preset (reference -> metaobject)\n                        # - sort_preset (reference -> metaobject)\n                        fields {\n                          key\n                          value\n\n                          # collection OR filter_preset OR sort_preset resolve via reference\n                          reference {\n                            ... on Collection {\n                              id\n                              handle\n                              title\n                            }\n\n                            # Filter Preset metaobject (label + taxonomy_value_gid)\n                            ... on Metaobject {\n                              id\n                              type\n                              handle\n                              fields {\n                                key\n                                value\n                              }\n                            }\n                          }\n                        }\n                      }\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n\n  #graphql\n  fragment MenuItem on MenuItem {\n    id\n    resourceId\n    tags\n    title\n    type\n    url\n  }\n  fragment ChildMenuItem on MenuItem {\n    ...MenuItem\n  }\n  fragment ParentMenuItem on MenuItem {\n    ...MenuItem\n    items {\n      ...ChildMenuItem\n    }\n  }\n  fragment Menu on Menu {\n    id\n    items {\n      ...ParentMenuItem\n    }\n  }\n\n': {
    return: HeaderQuery;
    variables: HeaderQueryVariables;
  };
  '#graphql\n  query Footer(\n    $country: CountryCode\n    $footerMenuHandle: String!\n    $language: LanguageCode\n  ) @inContext(language: $language, country: $country) {\n    menu(handle: $footerMenuHandle) {\n      ...Menu\n    }\n  }\n  #graphql\n  fragment MenuItem on MenuItem {\n    id\n    resourceId\n    tags\n    title\n    type\n    url\n  }\n  fragment ChildMenuItem on MenuItem {\n    ...MenuItem\n  }\n  fragment ParentMenuItem on MenuItem {\n    ...MenuItem\n    items {\n      ...ChildMenuItem\n    }\n  }\n  fragment Menu on Menu {\n    id\n    items {\n      ...ParentMenuItem\n    }\n  }\n\n': {
    return: FooterQuery;
    variables: FooterQueryVariables;
  };
  '#graphql\n  #graphql\n  fragment SimilarMotifsPreviewProduct on Product {\n    id\n    handle\n    title\n    priceRange {\n      minVariantPrice {\n        amount\n        currencyCode\n      }\n    }\n    images(first: 1) {\n      nodes {\n        url\n        altText\n        width\n        height\n      }\n    }\n  }\n\n  query SimilarMotifsPreview(\n    $country: CountryCode\n    $language: LanguageCode\n    $categoryHandle: String!\n    $mainMotif: String!\n    $mainTheme: String!\n    $candidateLimit: Int!\n  ) @inContext(country: $country, language: $language) {\n    collection(handle: $categoryHandle) {\n      sameMotif: products(\n        first: $candidateLimit\n        filters: [\n          {\n            productMetafield: {\n              namespace: "custom"\n              key: "main_motif"\n              value: $mainMotif\n            }\n          }\n        ]\n      ) {\n        nodes {\n          ...SimilarMotifsPreviewProduct\n        }\n      }\n      sameTheme: products(\n        first: $candidateLimit\n        filters: [\n          {\n            productMetafield: {\n              namespace: "custom"\n              key: "main_theme"\n              value: $mainTheme\n            }\n          }\n        ]\n      ) {\n        nodes {\n          ...SimilarMotifsPreviewProduct\n        }\n      }\n      fallback: products(first: $candidateLimit) {\n        nodes {\n          ...SimilarMotifsPreviewProduct\n        }\n      }\n    }\n  }\n': {
    return: SimilarMotifsPreviewQuery;
    variables: SimilarMotifsPreviewQueryVariables;
  };
  '#graphql\n  query SimilarProductsBase(\n    $handle: String!\n    $country: CountryCode\n    $language: LanguageCode\n    $first: Int!\n    $after: String\n  ) @inContext(country: $country, language: $language) {\n    collection(handle: $handle) {\n      id\n      handle\n      title\n      products(first: $first, after: $after) {\n        nodes {\n          id\n          handle\n          title\n          mainMotif: metafield(namespace: "custom", key: "main_motif") {\n            value\n          }\n          mainTheme: metafield(namespace: "custom", key: "main_theme") {\n            value\n          }\n          priceRange {\n            minVariantPrice {\n              amount\n              currencyCode\n            }\n          }\n          images(first: 3) {\n            nodes {\n              url\n              altText\n            }\n          }\n          collections(first: 20) {\n            nodes {\n              handle\n              title\n            }\n          }\n          options {\n            name\n            optionValues {\n              name\n              swatch {\n                color\n              }\n            }\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n': {
    return: SimilarProductsBaseQuery;
    variables: SimilarProductsBaseQueryVariables;
  };
  '#graphql\n  query SimilarProductsCollectionHandles(\n    $country: CountryCode\n    $language: LanguageCode\n    $first: Int!\n    $after: String\n  ) @inContext(country: $country, language: $language) {\n    collections(first: $first, after: $after) {\n      nodes {\n        handle\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n': {
    return: SimilarProductsCollectionHandlesQuery;
    variables: SimilarProductsCollectionHandlesQueryVariables;
  };
  '#graphql\n  query StoreRobots($country: CountryCode, $language: LanguageCode)\n   @inContext(country: $country, language: $language) {\n    shop {\n      id\n    }\n  }\n': {
    return: StoreRobotsQuery;
    variables: StoreRobotsQueryVariables;
  };
  '#graphql\n  query HeroSections {\n    metaobjects(type: "hero_div", first: 10) {\n      nodes {\n        id\n        handle\n        fields {\n          key\n          value\n          reference {\n            ... on MediaImage {\n              image { url altText width height }\n            }\n            ... on GenericFile {\n              url\n            }\n            ... on Collection {\n              handle\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: HeroSectionsQuery;
    variables: HeroSectionsQueryVariables;
  };
  '#graphql\n  query UspBarMetaobjects {\n    metaobjects(type: "uspbar", first: 5) {\n      nodes {\n        id\n        handle\n        fields {\n          key\n          value\n          reference {\n            ... on MediaImage {\n              image { url altText width height }\n            }\n            ... on GenericFile {\n              url\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: UspBarMetaobjectsQuery;
    variables: UspBarMetaobjectsQueryVariables;
  };
  '#graphql\n  query UspBarIcons($ids: [ID!]!) {\n    nodes(ids: $ids) {\n      ... on MediaImage {\n        id\n        image { url altText width height }\n      }\n    }\n  }\n': {
    return: UspBarIconsQuery;
    variables: UspBarIconsQueryVariables;
  };
  '#graphql\n  query BestsellerProductsHomepage {\n    collection(handle: "bestseller") {\n      id\n      title\n      products(first: 6) {\n        nodes {\n          id\n          handle\n          title\n          images(first: 2) {\n            nodes {\n              id\n              url\n              altText\n              width\n              height\n            }\n          }\n          priceRange {\n            minVariantPrice {\n              amount\n              currencyCode\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: BestsellerProductsHomepageQuery;
    variables: BestsellerProductsHomepageQueryVariables;
  };
  '#graphql\n  query CustomGridMetaobjects {\n    metaobjects(type: "custom_grid", first: 1) {\n      nodes {\n        id\n        handle\n        fields {\n          key\n          value\n          type\n          reference {\n            ... on MediaImage {\n              id\n              image {\n                url\n                altText\n                width\n                height\n              }\n            }\n            ... on GenericFile {\n              id\n              url\n            }\n            ... on Collection {\n              id\n              handle\n              title\n            }\n          }\n          references(first: 6) {\n            nodes {\n              ... on MediaImage {\n                id\n                image {\n                  url\n                  altText\n                  width\n                  height\n                }\n              }\n              ... on GenericFile {\n                id\n                url\n              }\n              ... on Collection {\n                id\n                handle\n                title\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: CustomGridMetaobjectsQuery;
    variables: CustomGridMetaobjectsQueryVariables;
  };
  '#graphql\n  query StepByStepMetaobject {\n    metaobjects(type: "step_by_step", first: 1) {\n      nodes {\n        id\n        handle\n        type\n        fields {\n          key\n          value\n          type\n          reference {\n            ... on MediaImage {\n              id\n              image {\n                url\n                altText\n                width\n                height\n              }\n            }\n            ... on GenericFile {\n              id\n              url\n            }\n            ... on Collection {\n              id\n              handle\n              title\n            }\n          }\n          references(first: 10) {\n            nodes {\n              ... on MediaImage {\n                id\n                image {\n                  url\n                  altText\n                  width\n                  height\n                }\n              }\n              ... on GenericFile {\n                id\n                url\n              }\n              ... on Collection {\n                id\n                handle\n                title\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: StepByStepMetaobjectQuery;
    variables: StepByStepMetaobjectQueryVariables;
  };
  '#graphql\n  query CustomerReviewsMetaobject {\n    metaobjects(type: "customer_reviews", first: 1) {\n      nodes {\n        id\n        handle\n        type\n        fields {\n          key\n          value\n          type\n          reference {\n            ... on MediaImage {\n              id\n              image {\n                url\n                altText\n                width\n                height\n              }\n            }\n            ... on GenericFile {\n              id\n              url\n            }\n          }\n          references(first: 10) {\n            nodes {\n              ... on MediaImage {\n                id\n                image {\n                  url\n                  altText\n                  width\n                  height\n                }\n              }\n              ... on GenericFile {\n                id\n                url\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: CustomerReviewsMetaobjectQuery;
    variables: CustomerReviewsMetaobjectQueryVariables;
  };
  '#graphql\n  fragment FeaturedCollection on Collection {\n    id\n    title\n    image {\n      id\n      url\n      altText\n      width\n      height\n    }\n    handle\n  }\n  query FeaturedCollection($country: CountryCode, $language: LanguageCode)\n    @inContext(country: $country, language: $language) {\n    collections(first: 1, sortKey: UPDATED_AT, reverse: true) {\n      nodes {\n        ...FeaturedCollection\n      }\n    }\n  }\n': {
    return: FeaturedCollectionQuery;
    variables: FeaturedCollectionQueryVariables;
  };
  '#graphql\n  fragment RecommendedProduct on Product {\n    id\n    title\n    handle\n    priceRange {\n      minVariantPrice {\n        amount\n        currencyCode\n      }\n    }\n    featuredImage {\n      id\n      url\n      altText\n      width\n      height\n    }\n  }\n  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)\n    @inContext(country: $country, language: $language) {\n    products(first: 4, sortKey: UPDATED_AT, reverse: true) {\n      nodes {\n        ...RecommendedProduct\n      }\n    }\n  }\n': {
    return: RecommendedProductsQuery;
    variables: RecommendedProductsQueryVariables;
  };
  '#graphql\n  query Article(\n    $articleHandle: String!\n    $blogHandle: String!\n    $country: CountryCode\n    $language: LanguageCode\n  ) @inContext(language: $language, country: $country) {\n    blog(handle: $blogHandle) {\n      title\n      handle\n      articleByHandle(handle: $articleHandle) {\n        handle\n        title\n        contentHtml\n        publishedAt\n        author: authorV2 {\n          name\n        }\n        image {\n          id\n          altText\n          url\n          width\n          height\n        }\n        seo {\n          description\n          title\n        }\n      }\n      articles(first: 12) {\n        nodes {\n          id\n          handle\n          title\n          excerpt\n          publishedAt\n          image {\n            id\n            altText\n            url\n            width\n            height\n          }\n        }\n      }\n    }\n  }\n': {
    return: ArticleQuery;
    variables: ArticleQueryVariables;
  };
  '#graphql\n  query Blog(\n    $language: LanguageCode\n    $blogHandle: String!\n    $first: Int\n    $last: Int\n    $startCursor: String\n    $endCursor: String\n  ) @inContext(language: $language) {\n    blog(handle: $blogHandle) {\n      title\n      handle\n      seo {\n        title\n        description\n      }\n      articles(\n        first: $first,\n        last: $last,\n        before: $startCursor,\n        after: $endCursor\n      ) {\n        nodes {\n          ...ArticleItem\n        }\n        pageInfo {\n          hasPreviousPage\n          hasNextPage\n          hasNextPage\n          endCursor\n          startCursor\n        }\n\n      }\n    }\n  }\n  fragment ArticleItem on Article {\n    author: authorV2 {\n      name\n    }\n    contentHtml\n    excerpt\n    handle\n    id\n    image {\n      id\n      altText\n      url\n      width\n      height\n    }\n    publishedAt\n    title\n    blog {\n      handle\n    }\n  }\n': {
    return: BlogQuery;
    variables: BlogQueryVariables;
  };
  '#graphql\n  query Blogs(\n    $country: CountryCode\n    $endCursor: String\n    $first: Int\n    $language: LanguageCode\n    $last: Int\n    $startCursor: String\n  ) @inContext(country: $country, language: $language) {\n    blogs(\n      first: $first,\n      last: $last,\n      before: $startCursor,\n      after: $endCursor\n    ) {\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      nodes {\n        title\n        handle\n        seo {\n          title\n          description\n        }\n        blogCategoryDescription: metafield(namespace: "custom", key: "blog_category_description") {\n          value\n        }\n        blogCategoryImage: metafield(namespace: "custom", key: "blog_category_image") {\n          reference {\n            ... on MediaImage {\n              image {\n                url\n                altText\n                width\n                height\n              }\n            }\n          }\n        }\n      }\n    }\n    blogListingContent: metaobjects(first: 1, type: "blog_listing_data") {\n      nodes {\n        ... on Metaobject {\n          fields {\n            key\n            value\n          }\n        }\n      }\n    }\n  }\n': {
    return: BlogsQuery;
    variables: BlogsQueryVariables;
  };
  '#graphql\n  query CartUpsellProducts(\n    $country: CountryCode\n    $language: LanguageCode\n    $collectionHandle: String!\n  ) @inContext(country: $country, language: $language) {\n    collection(handle: $collectionHandle) {\n      cartUpsellProducts: metafield(\n        namespace: "custom"\n        key: "cart_upsell_products"\n      ) {\n        references(first: 3) {\n          nodes {\n            __typename\n            ... on Product {\n              id\n              handle\n              title\n              featuredImage {\n                url\n                altText\n                width\n                height\n              }\n              selectedOrFirstAvailableVariant(\n                ignoreUnknownOptions: true\n                caseInsensitiveMatch: true\n              ) {\n                id\n                availableForSale\n                price {\n                  amount\n                  currencyCode\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n': {
    return: CartUpsellProductsQuery;
    variables: CartUpsellProductsQueryVariables;
  };
  '#graphql\n  #graphql\n  fragment CustomProductCardFields on Product {\n    id\n    handle\n    title\n    mainMotif: metafield(namespace: "custom", key: "main_motif") {\n      value\n    }\n    mainTheme: metafield(namespace: "custom", key: "main_theme") {\n      value\n    }\n    priceRange {\n      minVariantPrice {\n        amount\n        currencyCode\n      }\n    }\n    images(first: 3) {\n      nodes {\n        url\n        altText\n      }\n    }\n  }\n\n  query CustomCollection(\n    $handle: String!\n    $country: CountryCode\n    $language: LanguageCode\n    $first: Int\n    $last: Int\n    $startCursor: String\n    $endCursor: String\n    $filters: [ProductFilter!]\n    $sortKey: ProductCollectionSortKeys\n    $reverse: Boolean\n  ) @inContext(country: $country, language: $language) {\n    collection(handle: $handle) {\n      id\n      handle\n      title\n      description\n      pageType: metafield(namespace: "custom", key: "page_type") {\n        value\n      }\n      seo {\n        description\n        title\n      }\n      image {\n        url\n        altText\n        width\n        height\n      }\n      products(\n        first: $first,\n        last: $last,\n        before: $startCursor,\n        after: $endCursor,\n        filters: $filters,\n        sortKey: $sortKey,\n        reverse: $reverse\n      ) {\n        filters {\n          id\n          label\n          type\n          values {\n            id\n            label\n            count\n            input\n          }\n        }\n        nodes {\n          ...CustomProductCardFields\n        }\n        pageInfo {\n          hasPreviousPage\n          hasNextPage\n          endCursor\n          startCursor\n        }\n      }\n    }\n  }\n': {
    return: CustomCollectionQuery;
    variables: CustomCollectionQueryVariables;
  };
  '#graphql\n  fragment Collection on Collection {\n    id\n    title\n    handle\n    showListing: metafield(namespace: "custom", key: "show_listing") {\n      value\n    }\n    image {\n      id\n      url\n      altText\n      width\n      height\n    }\n  }\n  query StoreCollections(\n    $country: CountryCode\n    $first: Int\n    $language: LanguageCode\n  ) @inContext(country: $country, language: $language) {\n    collections(first: $first) {\n      nodes {\n        ...Collection\n      }\n    }\n  }\n': {
    return: StoreCollectionsQuery;
    variables: StoreCollectionsQueryVariables;
  };
  '#graphql\n  query Catalog(\n    $country: CountryCode\n    $language: LanguageCode\n    $first: Int\n    $last: Int\n    $startCursor: String\n    $endCursor: String\n  ) @inContext(country: $country, language: $language) {\n    products(first: $first, last: $last, before: $startCursor, after: $endCursor) {\n      nodes {\n        ...CollectionItem\n      }\n      pageInfo {\n        hasPreviousPage\n        hasNextPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n  #graphql\n  fragment MoneyCollectionItem on MoneyV2 {\n    amount\n    currencyCode\n  }\n  fragment CollectionItem on Product {\n    id\n    handle\n    title\n    featuredImage {\n      id\n      altText\n      url\n      width\n      height\n    }\n    priceRange {\n      minVariantPrice {\n        ...MoneyCollectionItem\n      }\n      maxVariantPrice {\n        ...MoneyCollectionItem\n      }\n    }\n  }\n\n': {
    return: CatalogQuery;
    variables: CatalogQueryVariables;
  };
  '#graphql\n  fragment CustomerReviewsPageMetaobject on Metaobject {\n    id\n    handle\n    type\n      fields {\n        key\n        value\n        type\n        reference {\n          ... on MediaImage {\n            id\n            image {\n              url\n              altText\n              width\n              height\n            }\n          }\n          ... on GenericFile {\n            id\n            url\n          }\n        }\n        references(first: 50) {\n        nodes {\n          ... on MediaImage {\n            id\n            image {\n              url\n              altText\n              width\n              height\n            }\n          }\n          ... on GenericFile {\n            id\n            url\n          }\n        }\n      }\n    }\n  }\n\n  query Page(\n    $language: LanguageCode,\n    $country: CountryCode,\n    $handle: String!\n  )\n  @inContext(language: $language, country: $country) {\n    page(handle: $handle) {\n      handle\n      id\n      title\n      body\n      pageType: metafield(namespace: "custom", key: "page_type") {\n        value\n      }\n      erfahrungenHero: metafield(\n        namespace: "custom"\n        key: "erfahrungen_hero"\n      ) {\n        type\n        reference {\n          ...CustomerReviewsPageMetaobject\n        }\n      }\n      customerReviews: metafield(\n        namespace: "custom"\n        key: "reviews_page_comments"\n      ) {\n        type\n        reference {\n          ...CustomerReviewsPageMetaobject\n        }\n        references(first: 5) {\n          nodes {\n            ...CustomerReviewsPageMetaobject\n          }\n        }\n      }\n      erfahrungenSteps: metafield(\n        namespace: "custom"\n        key: "erfahrungen_steps"\n      ) {\n        type\n        reference {\n          ...CustomerReviewsPageMetaobject\n        }\n      }\n      seo {\n        description\n        title\n      }\n    }\n  }\n': {
    return: PageQuery;
    variables: PageQueryVariables;
  };
  '#graphql\n  fragment Policy on ShopPolicy {\n    body\n    handle\n    id\n    title\n    url\n  }\n  query Policy(\n    $country: CountryCode\n    $language: LanguageCode\n    $privacyPolicy: Boolean!\n    $refundPolicy: Boolean!\n    $shippingPolicy: Boolean!\n    $termsOfService: Boolean!\n  ) @inContext(language: $language, country: $country) {\n    shop {\n      privacyPolicy @include(if: $privacyPolicy) {\n        ...Policy\n      }\n      shippingPolicy @include(if: $shippingPolicy) {\n        ...Policy\n      }\n      termsOfService @include(if: $termsOfService) {\n        ...Policy\n      }\n      refundPolicy @include(if: $refundPolicy) {\n        ...Policy\n      }\n    }\n  }\n': {
    return: PolicyQuery;
    variables: PolicyQueryVariables;
  };
  '#graphql\n  fragment PolicyItem on ShopPolicy {\n    id\n    title\n    handle\n  }\n  query Policies ($country: CountryCode, $language: LanguageCode)\n    @inContext(country: $country, language: $language) {\n    shop {\n      privacyPolicy {\n        ...PolicyItem\n      }\n      shippingPolicy {\n        ...PolicyItem\n      }\n      termsOfService {\n        ...PolicyItem\n      }\n      refundPolicy {\n        ...PolicyItem\n      }\n      subscriptionPolicy {\n        id\n        title\n        handle\n      }\n    }\n  }\n': {
    return: PoliciesQuery;
    variables: PoliciesQueryVariables;
  };
  '#graphql\n  query Product(\n    $country: CountryCode\n    $handle: String!\n    $language: LanguageCode\n    $selectedOptions: [SelectedOptionInput!]!\n  ) @inContext(country: $country, language: $language) {\n    product(handle: $handle) {\n      ...Product\n    }\n  }\n  #graphql\n  fragment Product on Product {\n    id\n    title\n    vendor\n    handle\n    descriptionHtml\n    description\n    encodedVariantExistence\n    encodedVariantAvailability\n    images(first: 20) {\n      edges {\n        node {\n          id\n          url\n          altText\n          width\n          height\n        }\n      }\n    }\n    options {\n      name\n      optionValues {\n        name\n        firstSelectableVariant {\n          ...ProductVariant\n        }\n        swatch {\n          color\n          image {\n            previewImage {\n              url\n            }\n          }\n        }\n      }\n    }\n    selectedOrFirstAvailableVariant(\n      selectedOptions: $selectedOptions\n      ignoreUnknownOptions: true\n      caseInsensitiveMatch: true\n    ) {\n      ...ProductVariant\n    }\n    adjacentVariants(selectedOptions: $selectedOptions) {\n      ...ProductVariant\n    }\n    seo {\n      description\n      title\n    }\n    productInfo: metafield(namespace: "custom", key: "product_info") {\n      value\n      type\n    }\n    deliveryAndShipping: metafield(namespace: "custom", key: "delivery_and_shipping") {\n      value\n      type\n    }\n    masterAssetId: metafield(namespace: "custom", key: "master_asset_id") {\n      value\n      type\n    }\n    productLayout: metafield(namespace: "custom", key: "product_layout") {\n      value\n    }\n    mainMotif: metafield(namespace: "custom", key: "main_motif") {\n      value\n    }\n    mainTheme: metafield(namespace: "custom", key: "main_theme") {\n      value\n    }\n  }\n  #graphql\n  fragment ProductVariant on ProductVariant {\n    availableForSale\n    compareAtPrice {\n      amount\n      currencyCode\n    }\n    id\n    image {\n      __typename\n      id\n      url\n      altText\n      width\n      height\n    }\n    price {\n      amount\n      currencyCode\n    }\n    product {\n      title\n      handle\n    }\n    selectedOptions {\n      name\n      value\n    }\n    sku\n    title\n    unitPrice {\n      amount\n      currencyCode\n    }\n    printQuality: metafield(namespace: "custom", key: "print_quality") {\n      reference {\n        ... on Metaobject {\n          id\n          handle\n          title: field(key: "title") {\n            value\n          }\n          badge: field(key: "badge") {\n            value\n          }\n          pricePerM2: field(key: "price_per_m2") {\n            value\n          }\n          priceWithoutDiscount: field(key: "price_wo_disc") {\n            value\n          }\n          minWidthCm: field(key: "min_width_cm") {\n            value\n          }\n          maxWidthCm: field(key: "max_width_cm") {\n            value\n          }\n          minHeightCm: field(key: "min_height_cm") {\n            value\n          }\n          maxHeightCm: field(key: "max_height_cm") {\n            value\n          }\n          properties: field(key: "properties") {\n            value\n          }\n          image: field(key: "image") {\n            reference {\n              ... on MediaImage {\n                image {\n                  url\n                  altText\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n\n\n': {
    return: ProductQuery;
    variables: ProductQueryVariables;
  };
  '#graphql\n  query RegularSearch(\n    $contentFirst: Int!\n    $country: CountryCode\n    $endCursor: String\n    $first: Int\n    $language: LanguageCode\n    $last: Int\n    $term: String!\n    $startCursor: String\n  ) @inContext(country: $country, language: $language) {\n    articles: search(query: $term, types: [ARTICLE], first: $contentFirst) {\n      nodes {\n        ... on Article {\n          ...SearchArticle\n        }\n      }\n    }\n    pages: search(query: $term, types: [PAGE], first: $contentFirst) {\n      nodes {\n        ... on Page {\n          ...SearchPage\n        }\n      }\n    }\n    products: search(\n      after: $endCursor\n      before: $startCursor\n      first: $first\n      last: $last\n      query: $term\n      sortKey: RELEVANCE\n      types: [PRODUCT]\n      unavailableProducts: HIDE\n    ) {\n      nodes {\n        ... on Product {\n          ...SearchProduct\n        }\n      }\n      pageInfo {\n        ...PageInfoFragment\n      }\n    }\n  }\n  #graphql\n  fragment SearchProduct on Product {\n    __typename\n    handle\n    id\n    title\n    trackingParameters\n    selectedOrFirstAvailableVariant(\n      selectedOptions: []\n      ignoreUnknownOptions: true\n      caseInsensitiveMatch: true\n    ) {\n      id\n      image {\n        url\n        altText\n        width\n        height\n      }\n      price {\n        amount\n        currencyCode\n      }\n      compareAtPrice {\n        amount\n        currencyCode\n      }\n    }\n  }\n\n  #graphql\n  fragment SearchPage on Page {\n    __typename\n    handle\n    id\n    title\n    trackingParameters\n  }\n\n  #graphql\n  fragment SearchArticle on Article {\n    __typename\n    handle\n    id\n    title\n    blog {\n      handle\n    }\n    trackingParameters\n  }\n\n  #graphql\n  fragment PageInfoFragment on PageInfo {\n    hasNextPage\n    hasPreviousPage\n    startCursor\n    endCursor\n  }\n\n': {
    return: RegularSearchQuery;
    variables: RegularSearchQueryVariables;
  };
  '#graphql\n  query PredictiveSearch(\n    $country: CountryCode\n    $language: LanguageCode\n    $limit: Int!\n    $limitScope: PredictiveSearchLimitScope!\n    $term: String!\n  ) @inContext(country: $country, language: $language) {\n    predictiveSearch(\n      limit: $limit\n      limitScope: $limitScope\n      query: $term\n      types: [PRODUCT, COLLECTION, PAGE, ARTICLE, QUERY]\n    ) {\n      articles {\n        __typename\n        id\n        title\n        handle\n        blog {\n          handle\n        }\n        image {\n          url\n          altText\n          width\n          height\n        }\n        trackingParameters\n      }\n      collections {\n        __typename\n        id\n        title\n        handle\n        image {\n          url\n          altText\n          width\n          height\n        }\n        trackingParameters\n      }\n      pages {\n        __typename\n        id\n        title\n        handle\n        trackingParameters\n      }\n      products {\n        __typename\n        id\n        title\n        handle\n        trackingParameters\n        selectedOrFirstAvailableVariant(\n          selectedOptions: []\n          ignoreUnknownOptions: true\n          caseInsensitiveMatch: true\n        ) {\n          id\n          image {\n            url\n            altText\n            width\n            height\n          }\n          price {\n            amount\n            currencyCode\n          }\n        }\n      }\n      queries {\n        __typename\n        text\n        styledText\n        trackingParameters\n      }\n    }\n  }\n': {
    return: PredictiveSearchQuery;
    variables: PredictiveSearchQueryVariables;
  };
  '#graphql\n  query ArticleSitemap(\n    $country: CountryCode\n    $language: LanguageCode\n    $blogsFirst: Int!\n    $articlesFirst: Int!\n  ) @inContext(country: $country, language: $language) {\n    blogs(first: $blogsFirst) {\n      nodes {\n        handle\n        articles(first: $articlesFirst) {\n          nodes {\n            handle\n            publishedAt\n          }\n        }\n      }\n    }\n  }\n': {
    return: ArticleSitemapQuery;
    variables: ArticleSitemapQueryVariables;
  };
}

interface GeneratedMutationTypes {}

declare module '@shopify/hydrogen' {
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
