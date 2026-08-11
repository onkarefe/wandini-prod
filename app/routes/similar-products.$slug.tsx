import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {useEffect, useState} from 'react';
import type {Route} from './+types/similar-products.$slug';
import {CustomProductCard} from '~/components/CustomProductCard';
import {
  buildSimilarProductsPath,
  getSimilarProductsPageData,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import {getCustomerWishlistProductIds} from '~/lib/wishlist.server';
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
  const description = `Entdecken Sie ${categoryLabel} zum Thema „${target.mainTheme}“ und mit dem Motiv „${target.mainMotif}“ sowie verwandte Designs.`;
  const subtitle = `Entdecken Sie ${categoryLabel.toLowerCase()} mit ähnlichen Motiven, Themen und Bildstilen.`;

  return {
    categoryLabel,
    heading,
    title: `${heading} | Wandini`,
    description,
    subtitle,
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
  const title =
    seoIdentity?.title ??
    `Ähnliche Produkte | ${params.slug ?? ''} | Wandini`;
  const description =
    seoIdentity?.description ??
    'Entdecken Sie verwandte Designs, ausgewählt nach Motiv, Thema und Kategorie.';

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
    throw new Response('Slug für ähnliche Produkte wurde nicht gefunden.', {
      status: 404,
    });
  }

  const [pageData, isLoggedIn, wishlistProductIds] = await Promise.all([
    getSimilarProductsPageData({
      storefront: context.storefront,
      slug,
      offset: 0,
      pageSize: PAGE_SIZE,
    }),
    context.customerAccount.isLoggedIn(),
    getCustomerWishlistProductIds({}),
  ]);

  const url = new URL(request.url);

  return {
    ...pageData,
    canonicalUrl: `${url.origin}${url.pathname}`,
    isLoggedIn,
    wishlistProductIds,
  };
}

export async function action({context, params, request}: Route.ActionArgs) {
  const slug = params.slug;

  if (!slug) {
    return Response.json(
      {
        ok: false,
        message: 'Slug für ähnliche Produkte wurde nicht gefunden.',
      },
      {status: 404},
    );
  }

  const formData = await request.formData();
  const offsetValue = formData.get('offset');
  const offset =
    typeof offsetValue === 'string' ? Number.parseInt(offsetValue, 10) : 0;

  if (!Number.isFinite(offset) || offset < 0) {
    return Response.json(
      {ok: false, message: 'Ungültiger Offset-Wert.'},
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
  const wishlistProductIdSet = new Set(initialData.wishlistProductIds);
  const heroState = location.state as
    | {
        sourceProductTitle?: string;
        sourceProductImageUrl?: string | null;
      }
    | undefined;
  const seoIdentity = buildSeoIdentity(initialData.target);

  useEffect(() => {
    setItems(initialData.items);
    setNextOffset(initialData.nextOffset);
    setHasMore(initialData.hasMore);
  }, [
    initialData.hasMore,
    initialData.items,
    initialData.nextOffset,
    initialData.target.slug,
  ]);

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

      <div className="collection-products-shell">
        <div className="custom-products-grid container mx-auto">
          {items.map((product) => {
            const mainMotif = product.mainMotif?.value?.trim() ?? '';
            const mainTheme = product.mainTheme?.value?.trim() ?? '';
            const hasSimilarProductsTarget = Boolean(mainMotif && mainTheme);
            const similarProductsUrl = hasSimilarProductsTarget
              ? buildSimilarProductsPath({
                  mainMotif,
                  mainTheme,
                  productCategory: initialData.target.categoryHandle,
                })
              : null;

            return (
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
                showSimilarMotifsButton={hasSimilarProductsTarget}
                similarProductsUrl={similarProductsUrl ?? undefined}
                similarProductsSourceTitle={product.title}
                similarProductsSourceImageUrl={
                  product.images?.nodes?.[0]?.url ?? undefined
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
                isLoggedIn={initialData.isLoggedIn}
                isWishlisted={wishlistProductIdSet.has(product.id)}
              />
            );
          })}
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
            {fetcher.state !== 'idle' ? 'Wird geladen...' : 'Mehr anzeigen'}
          </button>
        </fetcher.Form>
      ) : null}
    </div>
  );
}
