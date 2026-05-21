import type {ChangeEvent} from 'react';
import {
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
} from 'react-router';
import {Analytics, getPaginationVariables} from '@shopify/hydrogen';
import type {
  CustomCollectionQuery,
  CustomCollectionQueryVariables,
} from 'storefrontapi.generated';
import wandiniLogo from '~/assets/logos/wandini_Logo.webp';
import {CustomProductCard} from '~/components/CustomProductCard';
import {FilterBar} from '~/components/filterBar';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {
  COLLECTION_SORT_OPTIONS,
  clearCollectionPaginationParams,
  getCollectionSortVariables,
  getSelectedCollectionSort,
  normalizeCollectionSortParam,
} from '~/lib/collectionParams';
import {buildSimilarProductsPath} from '~/lib/similar-products';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {redirectToLocalePath} from '~/lib/locale';
import type {Route} from './+types/collections.$handle';
import '../styles/collections.css';

type CollectionData = NonNullable<CustomCollectionQuery['collection']>;
type CollectionProduct = CollectionData['products']['nodes'][number];
type CollectionProductWithSimilarFields = CollectionProduct & {
  mainMotif?: {
    value?: string | null;
  } | null;
  mainTheme?: {
    value?: string | null;
  } | null;
};
type CollectionFilterInput = NonNullable<
  CustomCollectionQueryVariables['filters']
>;

const CUSTOMER_WISHLIST_OWNER_QUERY = `#graphql
  query WishlistCustomerOwner($language: LanguageCode)
  @inContext(language: $language) {
    customer {
      id
    }
  }
` as const;

const NOISY_COLLECTION_PARAMS = ['sort', 'f', 'cursor', 'direction'] as const;

function hasNoisyCollectionParams(searchParams: URLSearchParams) {
  return NOISY_COLLECTION_PARAMS.some((param) => searchParams.has(param));
}

export const meta: Route.MetaFunction = ({data, params}) => {
  return [
    {title: `Hydrogen | ${data?.collection.title ?? ''} Collection`},
    {
      name: 'robots',
      content: data?.isNoisyCollectionUrl ? 'noindex,follow' : 'index,follow',
    },
    {
      tagName: 'link',
      rel: 'canonical',
      href: data?.canonicalUrl ?? `/collections/${params.handle ?? ''}`,
    },
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData();
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

async function loadCriticalData({
  context,
  params,
  request,
}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront, customerAccount} = context;

  if (!handle) {
    throw redirectToLocalePath(request, '/collections');
  }

  const paginationVariables = getPaginationVariables(request, {pageBy: 9});
  const url = new URL(request.url);
  const canonicalUrl = `${url.origin}${url.pathname}`;
  const isNoisyCollectionUrl = hasNoisyCollectionParams(url.searchParams);
  const selectedSort = getSelectedCollectionSort(url.searchParams.get('sort'));
  const {reverse, sortKey} = getCollectionSortVariables(selectedSort);
  const filters = parseCollectionFilters(url.searchParams);
  const isLoggedIn = await customerAccount.isLoggedIn();

  const [data, wishlistProductIds] = await Promise.all([
    storefront.query(CUSTOM_COLLECTION_QUERY, {
      variables: {
        handle,
        ...paginationVariables,
        filters,
        sortKey,
        reverse,
      },
    }) as Promise<CustomCollectionQuery>,
    loadWishlistProductIds({
      customerAccount,
      env: context.env as {
        SHOPIFY_SHOP?: string;
        SHOPIFY_CLIENT_ID?: string;
        SHOPIFY_CLIENT_SECRET?: string;
      },
      isLoggedIn,
    }),
  ]);

  const collection = data.collection;

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle, data: collection});

  return {
    collection,
    canonicalUrl,
    isNoisyCollectionUrl,
    isLoggedIn,
    wishlistProductIds,
  };
}

function loadDeferredData() {
  return {};
}

export default function Collection() {
  const {collection, isLoggedIn, wishlistProductIds} = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  const wishlistProductIdSet = new Set(wishlistProductIds);
  const currentSearchParams = new URLSearchParams(location.search);
  const currentBaseSearch = normalizeCollectionSortParam(
    clearCollectionPaginationParams(new URLSearchParams(currentSearchParams)),
  ).toString();
  const nextSearchParams = navigation.location
    ? new URLSearchParams(navigation.location.search)
    : null;
  const nextBaseSearch = nextSearchParams
    ? normalizeCollectionSortParam(
        clearCollectionPaginationParams(new URLSearchParams(nextSearchParams)),
      ).toString()
    : '';

  const hasFilters =
    Array.isArray(collection.products.filters) &&
    collection.products.filters.length > 0;
  const selectedSort = getSelectedCollectionSort(
    currentSearchParams.get('sort'),
  );
  const isCollectionUpdating =
    navigation.state !== 'idle' &&
    navigation.location?.pathname === location.pathname &&
    navigation.location.search !== location.search;
  const isFilterUpdating =
    isCollectionUpdating && nextBaseSearch !== currentBaseSearch;

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSort = getSelectedCollectionSort(event.target.value);
    const params = normalizeCollectionSortParam(
      clearCollectionPaginationParams(new URLSearchParams(location.search)),
    );

    params.set('sort', nextSort);

    void navigate({
      pathname: location.pathname,
      search: params.toString(),
    });
  };

  return (
    <div className="collection">
      <div
        className="collectionMainHeroDiv"
        style={
          collection.image?.url
            ? {
                backgroundImage: `url('${collection.image.url}')`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
              }
            : {}
        }
      >
        <h1>{collection.title}</h1>
        <p>{collection.description}</p>
      </div>

      <div className="container mx-auto">
        {hasFilters ? (
          <FilterBar
            filters={collection.products.filters}
            isUpdating={isFilterUpdating}
          />
        ) : null}

        <div className="sort-Main">
          <label htmlFor="sort-select">Sort:</label>
          <select
            id="sort-select"
            value={selectedSort}
            onChange={handleSortChange}
          >
            {COLLECTION_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {collection.products ? (
        <div
          className={`collection-products-shell ${
            isCollectionUpdating ? 'is-updating' : ''
          }`}
        >
          <PaginatedResourceSection<CollectionProduct>
            connection={collection.products}
            resourcesClassName="custom-products-grid container mx-auto"
          >
            {({node: product}) => {
              const productWithSimilarFields =
                product as CollectionProductWithSimilarFields;
              const hasMainMotif = Boolean(
                productWithSimilarFields.mainMotif?.value?.trim(),
              );
              const hasMainTheme = Boolean(
                productWithSimilarFields.mainTheme?.value?.trim(),
              );
              const similarProductsUrl =
                hasMainMotif && hasMainTheme
                  ? buildSimilarProductsPath({
                      mainMotif: productWithSimilarFields.mainMotif?.value ?? '',
                      mainTheme: productWithSimilarFields.mainTheme?.value ?? '',
                      productCategory: collection.handle,
                    })
                  : null;

              return (
                <CustomProductCard
                  key={product.id}
                  productId={product.id}
                  title={product.title}
                  images={product.images.nodes.map((image) => ({
                    url: image.url,
                    altText: image.altText ?? undefined,
                  }))}
                  productUrl={`/products/${product.handle}`}
                  showSimilarMotifsButton={hasMainMotif && hasMainTheme}
                  similarProductsUrl={similarProductsUrl ?? undefined}
                  similarProductsSourceTitle={product.title}
                  similarProductsSourceImageUrl={
                    product.images.nodes[0]?.url ?? undefined
                  }
                  minPrice={
                    product.priceRange?.minVariantPrice
                      ? {
                          amount: product.priceRange.minVariantPrice.amount,
                          currencyCode:
                            product.priceRange.minVariantPrice.currencyCode,
                        }
                      : undefined
                  }
                  isLoggedIn={isLoggedIn}
                  isWishlisted={wishlistProductIdSet.has(product.id)}
                />
              );
            }}
          </PaginatedResourceSection>

          {isCollectionUpdating ? (
            <div className="collection-loader" aria-live="polite" aria-busy="true">
              <img
                src={wandiniLogo}
                alt="Wandini loading"
                className="collection-loader__logo"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <Analytics.CollectionView
        data={{
          collection: {
            id: collection.id,
            handle: collection.handle,
          },
        }}
      />
    </div>
  );
}

async function loadWishlistProductIds({
  customerAccount,
  env,
  isLoggedIn,
}: {
  customerAccount: Route.LoaderArgs['context']['customerAccount'];
  env: {
    SHOPIFY_SHOP?: string;
    SHOPIFY_CLIENT_ID?: string;
    SHOPIFY_CLIENT_SECRET?: string;
  };
  isLoggedIn: boolean;
}) {
  if (!isLoggedIn) {
    return [];
  }

  const {data, errors} = await customerAccount.query(CUSTOMER_WISHLIST_OWNER_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer?.id) {
    return [];
  }

  try {
    return await getCustomerWishlistProductIds({
      env,
      customerId: data.customer.id,
    });
  } catch {
    return [];
  }
}

function parseCollectionFilters(
  searchParams: URLSearchParams,
): CollectionFilterInput | undefined {
  const parsedFilters: Array<Record<string, unknown>> = [];

  for (const value of searchParams.getAll('f')) {
    try {
      const parsedValue = JSON.parse(value);

      if (parsedValue && typeof parsedValue === 'object') {
        parsedFilters.push(parsedValue as Record<string, unknown>);
      }
    } catch {
      // Ignore malformed filter params and continue with the valid ones.
    }
  }

  if (parsedFilters.length > 0) {
    return parsedFilters as CollectionFilterInput;
  }

  const legacyFilters: Array<Record<string, unknown>> = [];

  searchParams.forEach((value, key) => {
    if (key === 'f' || key === 'sort' || key === 'cursor' || key === 'direction') {
      return;
    }

    if (key === 'productVendor') {
      legacyFilters.push({productVendor: value});
      return;
    }

    if (key === 'productType') {
      legacyFilters.push({productType: value});
      return;
    }

    if (key.startsWith('variantOption-')) {
      legacyFilters.push({
        variantOption: {
          name: key.replace('variantOption-', ''),
          value,
        },
      });
      return;
    }

    if (key === 'price') {
      const [minValue, maxValue] = value.split('-');
      const min = Number(minValue);
      const max = Number(maxValue);

      legacyFilters.push({
        price: {
          min: Number.isFinite(min) ? min : undefined,
          max: Number.isFinite(max) ? max : undefined,
        },
      });
    }
  });

  return legacyFilters.length > 0
    ? (legacyFilters as CollectionFilterInput)
    : undefined;
}

const CUSTOM_PRODUCT_CARD_FRAGMENT = `#graphql
  fragment CustomProductCardFields on Product {
    id
    handle
    title
    mainMotif: metafield(namespace: "custom", key: "main_motif") {
      value
    }
    mainTheme: metafield(namespace: "custom", key: "main_theme") {
      value
    }
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
` as const;

const CUSTOM_COLLECTION_QUERY = `#graphql
  ${CUSTOM_PRODUCT_CARD_FRAGMENT}
  query CustomCollection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
        altText
        width
        height
      }
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        filters: $filters,
        sortKey: $sortKey,
        reverse: $reverse
      ) {
        filters {
          id
          label
          type
          values {
            id
            label
            count
            input
          }
        }
        nodes {
          ...CustomProductCardFields
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }
      }
    }
  }
` as const;
