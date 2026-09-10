import {useFetcher, useLoaderData} from 'react-router';
import type {ShouldRevalidateFunction} from 'react-router';
import {useEffect, useState} from 'react';
import type {Route} from './+types/similar-products.$slug';
import {CustomProductCard} from '~/components/CustomProductCard';
import {
  buildSimilarProductsPath,
  getSimilarProductsPageData,
  mergeSimilarProductsById,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import {loadCustomerWishlistState} from '~/lib/customer-wishlist-state.server';
import {useTranslation} from '~/i18n/useTranslation';
import {createTranslator, type Translator} from '~/i18n';
import {getLocaleFromI18n} from '~/lib/locale';
import {resolveSimilarProductsLanguageSwitchLinks} from '~/lib/language-switcher';
import {buildCanonicalUrl, getRobotsDirective} from '~/lib/seo';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import '../styles/collections.css';
import '../styles/wishlistFeedback.css';

const PAGE_SIZE = 9;

function buildSimilarCategoryLabel(
  collectionTitle: string | null,
  categoryHandle: string,
) {
  if (
    typeof collectionTitle === 'string' &&
    collectionTitle.trim().length > 0
  ) {
    return collectionTitle.trim();
  }

  return categoryHandle
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSeoIdentity(
  target: {
    mainTheme: string;
    mainMotif: string;
    collectionTitle: string | null;
    categoryHandle: string;
  },
  t: Translator,
) {
  const categoryLabel = buildSimilarCategoryLabel(
    target.collectionTitle,
    target.categoryHandle,
  );
  const heading = `${target.mainTheme} ${target.mainMotif} ${categoryLabel}`;
  const description = t('similarProducts.metaDescription', {
    category: categoryLabel,
    theme: target.mainTheme,
    motif: target.mainMotif,
  });
  const subtitle = t('similarProducts.subtitle', {
    category: categoryLabel.toLowerCase(),
  });

  return {
    categoryLabel,
    heading,
    title: t('similarProducts.metaTitle', {heading}),
    description,
    subtitle,
  };
}

type LoadMoreResponse = {
  ok: boolean;
  message?: string;
  target: Awaited<ReturnType<typeof loader>>['target'];
  items: SimilarProductsBaseProduct[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

export const meta: Route.MetaFunction = ({data, params}) => {
  const canonicalUrl =
    data?.canonicalUrl ?? `/similar-products/${params.slug ?? ''}`;
  const t = createTranslator(data?.selectedLocale);
  const seoIdentity = data?.seoIdentity;
  const title =
    seoIdentity?.title ??
    t('similarProducts.fallbackMetaTitle', {slug: params.slug ?? ''});
  const description =
    seoIdentity?.description ?? t('similarProducts.fallbackMetaDescription');

  return [
    {title},
    {name: 'description', content: description},
    {name: 'robots', content: getRobotsDirective('noindex,follow')},
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
  ];
};

export async function loader({context, params, request}: Route.LoaderArgs) {
  const slug = params.slug;
  const selectedLocale = getLocaleFromI18n(context.storefront.i18n);
  const t = createTranslator(selectedLocale);

  if (!slug) {
    throw new Response(t('similarProducts.missingSlug'), {
      status: 404,
    });
  }

  const [pageData, wishlistState] = await Promise.all([
    getSimilarProductsPageData({
      storefront: context.storefront,
      slug,
      offset: 0,
      pageSize: PAGE_SIZE,
    }),
    loadCustomerWishlistState({
      customerAccount: context.customerAccount,
      env: context.env,
      request,
    }),
  ]);
  const languageSwitchLinks = await resolveSimilarProductsLanguageSwitchLinks({
    storefront: context.storefront,
    request,
    referenceProductId: pageData.target.referenceProductId,
    categoryId: pageData.target.categoryId,
  });

  return {
    ...pageData,
    selectedLocale,
    seoIdentity: buildSeoIdentity(pageData.target, t),
    languageSwitchLinks,
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
    isLoggedIn: wishlistState.isLoggedIn,
    wishlistProductIds: wishlistState.wishlistProductIds,
    wishlistStatus: wishlistState.wishlistStatus,
  };
}

export async function action({context, params, request}: Route.ActionArgs) {
  const slug = params.slug;
  const t = createTranslator(getLocaleFromI18n(context.storefront.i18n));

  if (!slug) {
    return Response.json(
      {
        ok: false,
        message: t('similarProducts.missingSlug'),
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
      {ok: false, message: t('similarProducts.invalidOffset')},
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

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  formAction,
  currentUrl,
  defaultShouldRevalidate,
}) => {
  if (
    formMethod?.toUpperCase() === 'POST' &&
    formAction &&
    new URL(formAction, currentUrl).pathname === currentUrl.pathname
  ) {
    return false;
  }

  return defaultShouldRevalidate;
};

export default function SimilarProductsSlugPage() {
  const {t} = useTranslation();
  const initialData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<LoadMoreResponse>();
  const [items, setItems] = useState(initialData.items);
  const [nextOffset, setNextOffset] = useState(initialData.nextOffset);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const wishlistProductIdSet = new Set(initialData.wishlistProductIds);
  const seoIdentity = initialData.seoIdentity;

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

    setItems((currentItems) =>
      mergeSimilarProductsById(currentItems, response.items),
    );
    setNextOffset(response.nextOffset);
    setHasMore(response.hasMore);
  }, [fetcher.data]);

  return (
    <div className="collection">
      {initialData.isLoggedIn &&
      initialData.wishlistStatus === 'unavailable' ? (
        <p className="wishlist-page-feedback" role="status">
          {t('wishlist.loadUnavailable')}
        </p>
      ) : null}
      <div className="collectionMainHeroDiv">
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
          {items.length === 0 ? <p>{t('similarProducts.empty')}</p> : null}
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

      {fetcher.data?.ok === false && fetcher.data.message ? (
        <p className="wishlist-page-feedback" role="alert">
          {fetcher.data.message}
        </p>
      ) : null}

      {hasMore ? (
        <fetcher.Form method="post">
          <input type="hidden" name="offset" value={String(nextOffset)} />
          <button
            type="submit"
            className="collectionReloadButton"
            disabled={fetcher.state !== 'idle'}
          >
            {fetcher.state !== 'idle'
              ? t('similarProducts.loading')
              : t('similarProducts.loadMore')}
          </button>
        </fetcher.Form>
      ) : null}
    </div>
  );
}
