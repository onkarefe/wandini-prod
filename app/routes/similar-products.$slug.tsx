import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {useEffect, useState} from 'react';
import type {Route} from './+types/similar-products.$slug';
import {CustomProductCard} from '~/components/CustomProductCard';
import {
  getSimilarProductsPageData,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import '../styles/collections.css';

const PAGE_SIZE = 9;

function buildSimilarCategoryLabel(
  collectionTitle: string | null,
  categoryHandle: string,
) {
  if (typeof collectionTitle === 'string' && collectionTitle.trim().length > 0) {
    return collectionTitle.trim();
  }

  return categoryHandle
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSeoIdentity(target: {
  mainTheme: string;
  mainMotif: string;
  collectionTitle: string | null;
  categoryHandle: string;
}) {
  const categoryLabel = buildSimilarCategoryLabel(
    target.collectionTitle,
    target.categoryHandle,
  );
  const heading = `${target.mainTheme} ${target.mainMotif} ${categoryLabel}`;
  const description = `Explore ${target.mainTheme} ${target.mainMotif} ${categoryLabel.toLowerCase()} and related designs selected by motif, theme, and category.`;
  const subtitle = `Explore ${target.mainTheme} ${target.mainMotif}-inspired ${categoryLabel.toLowerCase()} selected by motif, theme, and visual style.`;

  return {
    categoryLabel,
    heading,
    title: `${heading} | Wandini`,
    description,
    subtitle,
  };
}

function getLocalePrefixFromPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();

  if (firstSegment === 'de-de') {
    return '/de-de';
  }

  return '';
}

function buildStructuredDataContext(
  canonicalUrl: string,
  target: {
    categoryHandle: string;
    collectionTitle: string | null;
    mainTheme: string;
    mainMotif: string;
  },
) {
  const url = new URL(canonicalUrl);
  const localePrefix = getLocalePrefixFromPathname(url.pathname);
  const categoryLabel = buildSimilarCategoryLabel(
    target.collectionTitle,
    target.categoryHandle,
  );
  const seoIdentity = buildSeoIdentity(target);
  const homeUrl = localePrefix ? `${url.origin}${localePrefix}` : `${url.origin}/`;
  const categoryUrl = `${url.origin}${localePrefix}/collections/${target.categoryHandle}`;

  return {
    homeUrl,
    categoryUrl,
    categoryLabel,
    currentUrl: canonicalUrl,
    seoIdentity,
  };
}

function buildBreadcrumbListJsonLd({
  homeUrl,
  categoryUrl,
  categoryLabel,
  currentUrl,
  seoTitle,
}: {
  homeUrl: string;
  categoryUrl: string;
  categoryLabel: string;
  currentUrl: string;
  seoTitle: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: homeUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoryLabel,
        item: categoryUrl,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: seoTitle,
        item: currentUrl,
      },
    ],
  };
}

function buildCollectionPageJsonLd({
  currentUrl,
  title,
  description,
}: {
  currentUrl: string;
  title: string;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: currentUrl,
    description,
  };
}

function buildItemListJsonLd({
  currentUrl,
  localePrefix,
  origin,
  products,
}: {
  currentUrl: string;
  localePrefix: string;
  origin: string;
  products: SimilarProductsBaseProduct[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: currentUrl,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${origin}${localePrefix}/products/${product.handle}`,
      item: {
        '@type': 'Thing',
        name: product.title,
        url: `${origin}${localePrefix}/products/${product.handle}`,
        ...(product.images?.nodes?.[0]?.url
          ? {
              image: product.images.nodes[0].url,
            }
          : {}),
      },
    })),
  };
}

type LoadMoreResponse = {
  ok: boolean;
  target: Awaited<ReturnType<typeof loader>>['target'];
  items: SimilarProductsBaseProduct[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

export const meta: Route.MetaFunction = ({data, params}) => {
  const canonicalUrl = data?.canonicalUrl ?? `/similar-products/${params.slug ?? ''}`;
  const seoIdentity = data ? buildSeoIdentity(data.target) : null;
  const title = seoIdentity?.title ?? `Similar Products | ${params.slug ?? ''} | Wandini`;
  const description =
    seoIdentity?.description ??
    'Explore related designs selected by motif, theme, and category.';

  return [
    {title},
    {name: 'description', content: description},
    {name: 'robots', content: 'noindex,follow'},
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
  ];
};

export async function loader({context, params, request}: Route.LoaderArgs) {
  const slug = params.slug;

  if (!slug) {
    throw new Response('Similar products slug not found.', {status: 404});
  }

  const pageData = await getSimilarProductsPageData({
    storefront: context.storefront,
    slug,
    offset: 0,
    pageSize: PAGE_SIZE,
  });

  const url = new URL(request.url);

  return {
    ...pageData,
    canonicalUrl: `${url.origin}${url.pathname}`,
  };
}

export async function action({context, params, request}: Route.ActionArgs) {
  const slug = params.slug;

  if (!slug) {
    return Response.json(
      {ok: false, message: 'Similar products slug not found.'},
      {status: 404},
    );
  }

  const formData = await request.formData();
  const offsetValue = formData.get('offset');
  const offset =
    typeof offsetValue === 'string' ? Number.parseInt(offsetValue, 10) : 0;

  if (!Number.isFinite(offset) || offset < 0) {
    return Response.json(
      {ok: false, message: 'Invalid offset value.'},
      {status: 400},
    );
  }

  const page = await getSimilarProductsPageData({
    storefront: context.storefront,
    slug,
    offset,
    pageSize: PAGE_SIZE,
  });

  return Response.json({
    ok: true,
    ...page,
  });
}

export default function SimilarProductsSlugPage() {
  const initialData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<LoadMoreResponse>();
  const location = useLocation();
  const [items, setItems] = useState(initialData.items);
  const [nextOffset, setNextOffset] = useState(initialData.nextOffset);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const heroState = location.state as
    | {
        sourceProductTitle?: string;
        sourceProductImageUrl?: string | null;
      }
    | undefined;
  const seoIdentity = buildSeoIdentity(initialData.target);
  const structuredDataContext = buildStructuredDataContext(
    initialData.canonicalUrl,
    initialData.target,
  );
  const relatedCollectionHref = `${getLocalePrefixFromPathname(
    new URL(initialData.canonicalUrl).pathname,
  )}/collections/${initialData.target.categoryHandle}`;
  const relatedCollectionLabel = buildSimilarCategoryLabel(
    initialData.target.collectionTitle,
    initialData.target.categoryHandle,
  );
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd({
    homeUrl: structuredDataContext.homeUrl,
    categoryUrl: structuredDataContext.categoryUrl,
    categoryLabel: structuredDataContext.categoryLabel,
    currentUrl: structuredDataContext.currentUrl,
    seoTitle: structuredDataContext.seoIdentity.heading,
  });
  const collectionPageJsonLd = initialData.seoSignals.seoEligible
    ? buildCollectionPageJsonLd({
        currentUrl: structuredDataContext.currentUrl,
        title: structuredDataContext.seoIdentity.heading,
        description: initialData.introContent ?? structuredDataContext.seoIdentity.description,
      })
    : null;
  const itemListJsonLd = initialData.seoSignals.seoEligible
    ? buildItemListJsonLd({
        currentUrl: structuredDataContext.currentUrl,
        localePrefix: getLocalePrefixFromPathname(
          new URL(initialData.canonicalUrl).pathname,
        ),
        origin: new URL(initialData.canonicalUrl).origin,
        products: initialData.items,
      })
    : null;

  useEffect(() => {
    setItems(initialData.items);
    setNextOffset(initialData.nextOffset);
    setHasMore(initialData.hasMore);
  }, [initialData.target.slug]);

  useEffect(() => {
    const response = fetcher.data;

    if (!response || !('ok' in response) || !response.ok) {
      return;
    }

    setItems((currentItems) => {
      const mergedItems = [
        ...currentItems,
        ...response.items.filter(
          (incomingItem: SimilarProductsBaseProduct) =>
            !currentItems.some((currentItem) => currentItem.id === incomingItem.id),
        ),
      ];

      return mergedItems;
    });
    setNextOffset(response.nextOffset);
    setHasMore(response.hasMore);
  }, [fetcher.data]);

  return (
    <div className="collection">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(breadcrumbJsonLd)}}
      />
      {collectionPageJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify(collectionPageJsonLd)}}
        />
      ) : null}
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify(itemListJsonLd)}}
        />
      ) : null}

      <div
        className="collectionMainHeroDiv"
        style={
          heroState?.sourceProductImageUrl
            ? {
                backgroundImage: `url('${heroState.sourceProductImageUrl}')`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
              }
            : {}
        }
      >
        <h1>{seoIdentity.heading}</h1>
        <p>{seoIdentity.subtitle}</p>
      </div>

      {initialData.introContent ? (
        <div className="container mx-auto">
          <p>{initialData.introContent}</p>
        </div>
      ) : null}

      <div className="container mx-auto">
        <section aria-labelledby="related-links-heading">
          <h2 id="related-links-heading">Explore more designs</h2>
          <a href={relatedCollectionHref}>{relatedCollectionLabel}</a>
        </section>
      </div>

      <div className="collection-products-shell">
        <div className="custom-products-grid container mx-auto">
          {items.map((product) => (
            <CustomProductCard
              key={product.id}
              productId={product.id}
              title={product.title}
              images={
                product.images?.nodes?.map((image) => ({
                  url: image.url,
                  altText: image.altText ?? undefined,
                })) ?? []
              }
              productUrl={`/products/${product.handle}`}
              minPrice={
                product.priceRange?.minVariantPrice
                  ? {
                      amount: product.priceRange.minVariantPrice.amount,
                      currencyCode:
                        product.priceRange.minVariantPrice.currencyCode,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {hasMore ? (
        <fetcher.Form method="post">
          <input type="hidden" name="offset" value={String(nextOffset)} />
          <button
            type="submit"
            className="collectionReloadButton"
            disabled={fetcher.state !== 'idle'}
          >
            {fetcher.state !== 'idle' ? 'Loading...' : 'Load more'}
          </button>
        </fetcher.Form>
      ) : null}
    </div>
  );
}
