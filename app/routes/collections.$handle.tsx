import {lazy, Suspense, type ChangeEvent} from 'react';
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
import {loadCustomerWishlistState} from '~/lib/customer-wishlist-state.server';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {resolveResourceLanguageSwitchLinks} from '~/lib/language-switcher';
import {redirectToLocalePath} from '~/lib/locale';
import {getRobotsDirective} from '~/lib/seo';
import {useTranslation} from '~/i18n/useTranslation';
import type {Route} from './+types/collections.$handle';
import '../styles/collections.css';
import '../styles/wishlistFeedback.css';

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
type CollectionSeoFields = {
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
};
type CollectionMetaInput = {
  title?: string | null;
  description?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  image?: {
    url?: string | null;
  } | null;
};
type CollectionWithSeo = CollectionData & CollectionSeoFields;
type CollectionItemListElement = {
  '@type': 'ListItem';
  position: number;
  url: string;
  name: string;
  image?: string;
};

const COLLECTION_META_BRAND = 'Wandini';
const COLLECTION_META_DESCRIPTION_MAX_LENGTH = 160;
const BESTSELLER_COLLECTION_PAGE_TYPE = 'bestseller';
const ZUBEHOR_COLLECTION_PAGE_TYPE = 'zubehor';

const BestsellerCollectionLayout = lazy(
  () => import('~/components/BestsellerCollectionLayout'),
);

const ZubehorCollectionLayout = lazy(
  () => import('~/components/ZubehorCollectionLayout'),
);

const NOISY_COLLECTION_PARAMS = ['sort', 'f', 'cursor', 'direction'] as const;

function hasNoisyCollectionParams(searchParams: URLSearchParams) {
  return NOISY_COLLECTION_PARAMS.some((param) => searchParams.has(param));
}

function isBestsellerCollection(collection: CollectionData) {
  return (
    collection.pageType?.value?.trim().toLowerCase() ===
    BESTSELLER_COLLECTION_PAGE_TYPE
  );
}

function isZubehorCollection(collection: CollectionData) {
  return (
    collection.pageType?.value?.trim().toLowerCase() ===
    ZUBEHOR_COLLECTION_PAGE_TYPE
  );
}

function normalizeMetaText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMetaDescription(value: string) {
  if (value.length <= COLLECTION_META_DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  const clipped = value.slice(0, COLLECTION_META_DESCRIPTION_MAX_LENGTH + 1);
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const truncated =
    lastSpaceIndex > 80
      ? clipped.slice(0, lastSpaceIndex)
      : clipped.slice(0, COLLECTION_META_DESCRIPTION_MAX_LENGTH);

  return `${truncated.trim()}...`;
}

function getCollectionMetaTitle(collection?: CollectionMetaInput | null) {
  const seoTitle = normalizeMetaText(collection?.seo?.title);

  if (seoTitle) {
    return seoTitle;
  }

  const collectionTitle = normalizeMetaText(collection?.title);

  if (!collectionTitle) {
    return COLLECTION_META_BRAND;
  }

  return collectionTitle
    .toLowerCase()
    .includes(COLLECTION_META_BRAND.toLowerCase())
    ? collectionTitle
    : `${collectionTitle} | ${COLLECTION_META_BRAND}`;
}

function getCollectionMetaDescription(collection?: CollectionMetaInput | null) {
  const description =
    normalizeMetaText(collection?.seo?.description) ||
    normalizeMetaText(collection?.description);

  return description ? truncateMetaDescription(description) : null;
}

function getCollectionMetaImage(collection?: CollectionMetaInput | null) {
  return collection?.image?.url ?? null;
}

function buildCollectionPageJsonLd(
  collection: CollectionMetaInput,
  canonicalUrl: string,
) {
  const name =
    normalizeMetaText(collection.title) || getCollectionMetaTitle(collection);
  const description = getCollectionMetaDescription(collection);

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    ...(description ? {description} : {}),
    url: canonicalUrl,
  };
}

function getBreadcrumbHomeUrl(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  const [firstSegment] = url.pathname.split('/').filter(Boolean);

  return firstSegment?.toLowerCase() === 'de-de'
    ? `${url.origin}/de-de`
    : `${url.origin}/`;
}

function buildCollectionBreadcrumbJsonLd(
  collection: CollectionMetaInput,
  canonicalUrl: string,
) {
  const name =
    normalizeMetaText(collection.title) || getCollectionMetaTitle(collection);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: getBreadcrumbHomeUrl(canonicalUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: canonicalUrl,
      },
    ],
  };
}

function getCollectionLocalePrefix(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  const [firstSegment] = url.pathname.split('/').filter(Boolean);

  return firstSegment && /^[a-z]{2}-[a-z]{2}$/i.test(firstSegment)
    ? `/${firstSegment.toLowerCase()}`
    : '';
}

function getCollectionProductUrl(
  canonicalUrl: string,
  productHandle?: string | null,
) {
  const handle = normalizeMetaText(productHandle);

  if (!handle) {
    return null;
  }

  const url = new URL(canonicalUrl);
  const localePrefix = getCollectionLocalePrefix(canonicalUrl);

  return `${url.origin}${localePrefix}/products/${handle}`;
}

function buildCollectionItemListJsonLd(
  products: CollectionProduct[],
  canonicalUrl: string,
) {
  const itemListElement: CollectionItemListElement[] = [];

  products.forEach((product, index) => {
    const url = getCollectionProductUrl(canonicalUrl, product.handle);
    const name = normalizeMetaText(product.title);

    if (!url || !name) {
      return;
    }

    const image = product.images.nodes.find((imageNode) => imageNode.url)?.url;

    itemListElement.push({
      '@type': 'ListItem',
      position: index + 1,
      url,
      name,
      ...(image ? {image} : {}),
    });
  });

  if (itemListElement.length === 0) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement,
  };
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const collection = data?.collection;
  const title = getCollectionMetaTitle(collection);
  const description = getCollectionMetaDescription(collection);
  const imageUrl = getCollectionMetaImage(collection);
  const canonicalUrl =
    data?.canonicalUrl ?? `/collections/${params.handle ?? ''}`;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {
      name: 'robots',
      content: getRobotsDirective(
        data?.isNoisyCollectionUrl ? 'noindex,follow' : 'index,follow',
      ),
    },
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    ...(description
      ? [{property: 'og:description', content: description}]
      : []),
    {property: 'og:url', content: canonicalUrl},
    ...(imageUrl ? [{property: 'og:image', content: imageUrl}] : []),
    {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary',
    },
    {name: 'twitter:title', content: title},
    ...(description
      ? [{name: 'twitter:description', content: description}]
      : []),
    ...(imageUrl ? [{name: 'twitter:image', content: imageUrl}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData();
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
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
  const [data, wishlistState] = await Promise.all([
    storefront.query(CUSTOM_COLLECTION_QUERY, {
      variables: {
        handle,
        ...paginationVariables,
        filters,
        sortKey,
        reverse,
      },
    }) as Promise<CustomCollectionQuery>,
    loadCustomerWishlistState({
      customerAccount,
      env: context.env,
      request,
    }),
  ]);
  const {isLoggedIn, wishlistProductIds, wishlistStatus} = wishlistState;

  let collection = data.collection as CollectionWithSeo | null | undefined;

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {status: 404});
  }

  if (isBestsellerCollection(collection)) {
    const bestsellerData = (await storefront.query(CUSTOM_COLLECTION_QUERY, {
      variables: {
        handle,
        first: 250,
        filters: [],
        sortKey: 'BEST_SELLING',
        reverse: false,
      },
    })) as CustomCollectionQuery;

    collection =
      (bestsellerData.collection as CollectionWithSeo | null | undefined) ??
      collection;
  }

  redirectIfHandleIsLocalized(request, {handle, data: collection});
  const languageSwitchLinks = await resolveResourceLanguageSwitchLinks({
    storefront,
    request,
    resourceId: collection.id,
    resourceType: 'Collection',
  });

  return {
    collection,
    canonicalUrl,
    languageSwitchLinks,
    isNoisyCollectionUrl,
    isLoggedIn,
    wishlistProductIds,
    wishlistStatus,
  };
}

function loadDeferredData() {
  return {};
}

export default function Collection() {
  const {t} = useTranslation();
  const data = useLoaderData<typeof loader>();
  const {
    collection,
    canonicalUrl,
    isNoisyCollectionUrl,
    isLoggedIn,
    wishlistProductIds,
    wishlistStatus,
  } = data;
  const collectionPageJsonLd = isNoisyCollectionUrl
    ? null
    : buildCollectionPageJsonLd(collection, canonicalUrl);
  const breadcrumbJsonLd = isNoisyCollectionUrl
    ? null
    : buildCollectionBreadcrumbJsonLd(collection, canonicalUrl);
  const itemListJsonLd = isNoisyCollectionUrl
    ? null
    : buildCollectionItemListJsonLd(collection.products.nodes, canonicalUrl);

  return (
    <div className="collection">
      {isLoggedIn && wishlistStatus === 'unavailable' ? (
        <p className="wishlist-page-feedback" role="status">
          {t('wishlist.loadUnavailable')}
        </p>
      ) : null}
      {collectionPageJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: stringifyJsonLd(collectionPageJsonLd),
          }}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: stringifyJsonLd(breadcrumbJsonLd)}}
        />
      ) : null}
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: stringifyJsonLd(itemListJsonLd)}}
        />
      ) : null}

      {isBestsellerCollection(collection) ? (
        <Suspense
          fallback={
            <div className="collectionMainHeroDiv" aria-busy="true">
              <h1>{collection.title}</h1>
            </div>
          }
        >
          <BestsellerCollectionLayout collection={collection} />
        </Suspense>
      ) : isZubehorCollection(collection) ? (
        <Suspense
          fallback={
            <div className="collectionMainHeroDiv" aria-busy="true">
              <h1>{collection.title}</h1>
            </div>
          }
        >
          <ZubehorCollectionLayout
            collection={collection}
            isLoggedIn={isLoggedIn}
            wishlistProductIds={wishlistProductIds}
          />
        </Suspense>
      ) : (
        <DefaultCollectionLayout
          collection={collection}
          isLoggedIn={isLoggedIn}
          wishlistProductIds={wishlistProductIds}
        />
      )}

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

function DefaultCollectionLayout({
  collection,
  isLoggedIn,
  wishlistProductIds,
}: {
  collection: CollectionData;
  isLoggedIn: boolean;
  wishlistProductIds: string[];
}) {
  const {t} = useTranslation();
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
    <>
      <div className="collectionMainHeroDiv">
        <h1>{collection.title}</h1>
        {collection.description ? <p>{collection.description}</p> : null}
      </div>

      <div className="collection-controls container mx-auto">
        {hasFilters ? (
          <FilterBar
            filters={collection.products.filters}
            isUpdating={isFilterUpdating}
          />
        ) : null}

        <div className="sort-Main">
          <label htmlFor="sort-select">{t('collection.sortLabel')}</label>
          <select
            id="sort-select"
            value={selectedSort}
            onChange={handleSortChange}
          >
            {COLLECTION_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
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
            previousLabel={t('collection.previousProducts')}
            nextLabel={t('collection.nextProducts')}
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
                      mainMotif:
                        productWithSimilarFields.mainMotif?.value ?? '',
                      mainTheme:
                        productWithSimilarFields.mainTheme?.value ?? '',
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
            <div
              className="collection-loader"
              aria-live="polite"
              aria-busy="true"
            >
              <img
                src={wandiniLogo}
                alt="Wandini loading"
                className="collection-loader__logo"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
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
    if (
      key === 'f' ||
      key === 'sort' ||
      key === 'cursor' ||
      key === 'direction'
    ) {
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
      pageType: metafield(namespace: "custom", key: "page_type") {
        value
      }
      seo {
        description
        title
      }
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
