import {redirect, useFetcher, useLoaderData} from 'react-router';
import type {ShouldRevalidateFunction} from 'react-router';
import {useEffect, useState} from 'react';
import type {Route} from './+types/similar-products.$slug';
import {CustomProductCard} from '~/components/CustomProductCard';
import {
  getSimilarProductsTarget,
  getSimilarProductsRootPath,
  buildSimilarProductsPath,
  mergeSimilarProductsById,
  type SimilarProductsBaseProduct,
} from '~/lib/similar-products';
import {getSimilarProductsPageData} from '~/lib/similar-products.server';
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

function buildSeoIdentity(
  target: {mainTheme: string; mainMotif: string},
  t: Translator,
) {
  const heading =
    [target.mainTheme, target.mainMotif].filter(Boolean).join(' ') ||
    t('similarMotifs.title');
  return {
    heading,
    title: t('similarProducts.metaTitle', {heading}),
    description: target.mainMotif
      ? t('similarProducts.metaDescription', {
          category: t('search.products'),
          theme: target.mainTheme,
          motif: target.mainMotif,
        })
      : t('similarProducts.fallbackMetaDescription'),
    subtitle: t('similarProducts.subtitle', {category: t('search.products')}),
  };
}

type LoadMoreResponse = {
  ok: boolean;
  language: 'DE' | 'EN';
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
  const slug = params.slug ?? '';
  const selectedLocale = getLocaleFromI18n(context.storefront.i18n);
  const t = createTranslator(selectedLocale);

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
  if (!pageData) throw redirect(getSimilarProductsRootPath(selectedLocale));
  if (slug !== pageData.target.slug) {
    throw redirect(buildSimilarProductsPath(pageData.target, selectedLocale));
  }
  const languageSwitchLinks = await resolveSimilarProductsLanguageSwitchLinks({
    storefront: context.storefront,
    request,
    referenceProductId: pageData.target.referenceProductId,
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
  const slug = params.slug ?? '';
  const selectedLocale = getLocaleFromI18n(context.storefront.i18n);
  const t = createTranslator(selectedLocale);

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

  if (!page) throw redirect(getSimilarProductsRootPath(selectedLocale));

  return Response.json({
    ok: true,
    language: selectedLocale.language,
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

    if (
      !response ||
      !('ok' in response) ||
      !response.ok ||
      response.target.slug !== initialData.target.slug ||
      response.language !== initialData.selectedLocale.language
    ) {
      return;
    }

    setItems((currentItems) =>
      mergeSimilarProductsById(currentItems, response.items),
    );
    setNextOffset(response.nextOffset);
    setHasMore(response.hasMore);
  }, [
    fetcher.data,
    initialData.target.slug,
    initialData.selectedLocale.language,
  ]);

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
            const similarTarget = getSimilarProductsTarget(
              product,
              initialData.selectedLocale,
            );

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
                showSimilarMotifsButton={Boolean(similarTarget)}
                similarProductsUrl={similarTarget?.path}
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
