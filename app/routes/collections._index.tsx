import {Image} from '@shopify/hydrogen';
import {useLoaderData} from 'react-router';
import type {CollectionFragment} from 'storefrontapi.generated';
import {Link} from '~/lib/i18n-router';
import collectionMainlistStyles from '~/styles/collection-mainlist.css?url';
import type {Route} from './+types/collections._index';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import {
  buildCanonicalUrl,
  buildFixedSeoAlternateUrls,
  buildSeoMetadata,
} from '~/lib/seo';
import {loadShopifySeoPage} from '~/lib/shopify-marketing-seo.server';
import {
  getShopifyGlobalSeoSettingsFromMatches,
  resolveShopifyMarketingSeo,
} from '~/lib/shopify-marketing-seo';
import {createTranslator} from '~/i18n';
import {getLocaleFromI18n} from '~/lib/locale';

type ListedCollection = CollectionFragment & {
  showListing?: {value?: string | null} | null;
};

export function links() {
  return [{rel: 'stylesheet', href: collectionMainlistStyles}];
}

export const meta: Route.MetaFunction = ({data, matches}) => {
  const marketingSeo = resolveShopifyMarketingSeo({
    settings: getShopifyGlobalSeoSettingsFromMatches(matches),
    page: data?.shopifySeoPage,
    fallbackTitle: data?.seoFallbackTitle,
  });

  return buildSeoMetadata({
    title: {explicit: marketingSeo.title},
    description: marketingSeo.description
      ? {explicit: marketingSeo.description}
      : undefined,
    canonicalUrl: data?.canonicalUrl ?? '/collections',
    alternates: buildFixedSeoAlternateUrls(
      data?.canonicalUrl ?? '/collections',
      '/collections',
    ),
    robots: marketingSeo.noindex ? 'noindex,follow' : 'index,follow',
    image: marketingSeo.image,
    openGraph: {
      title: marketingSeo.openGraphTitle,
      description: marketingSeo.openGraphDescription,
      image: marketingSeo.image,
    },
  });
};

export async function loader({context, request}: Route.LoaderArgs) {
  const [{collections}, shopifySeoPage] = await Promise.all([
    context.storefront.query(COLLECTIONS_QUERY, {
      variables: {first: 50},
    }),
    loadShopifySeoPage(context.storefront, 'collections'),
  ]);
  const t = createTranslator(getLocaleFromI18n(context.storefront.i18n));

  return {
    collections: collections.nodes.filter(
      (collection: ListedCollection) =>
        collection.showListing?.value === 'true',
    ),
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
    seoFallbackTitle: t('search.collections'),
    shopifySeoPage,
  };
}

export default function Collections() {
  const {collections} = useLoaderData<typeof loader>();

  return (
    <main className="collection-page">
      <div className="collection-gallery">
        {collections.map((collection: ListedCollection, index: number) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            index={index}
          />
        ))}
      </div>
    </main>
  );
}

function CollectionCard({
  collection,
  index,
}: {
  collection: ListedCollection;
  index: number;
}) {
  return (
    <Link
      className="collection-card"
      to={`/collections/${collection.handle}`}
    >
      <div className="collection-card__media">
        {collection.image ? (
          <Image
            className="collection-card__image object-cover"
            alt={collection.image.altText || collection.title}
            data={collection.image}
            loading={index < 2 ? 'eager' : 'lazy'}
            sizes="(min-width: 961px) 58vw, (min-width: 641px) 50vw, 100vw"
          />
        ) : null}
      </div>

      <div className="collection-card__footer">
        <span className="collection-card__index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="collection-card__title">{collection.title}</h2>
        <span className="collection-card__action" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M5 12h13M13 7l5 5-5 5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

const COLLECTIONS_QUERY = `#graphql
  fragment Collection on Collection {
    id
    title
    handle
    showListing: metafield(namespace: "custom", key: "show_listing") {
      value
    }
    image {
      id
      url
      altText
      width
      height
    }
  }
  query StoreCollections(
    $country: CountryCode
    $first: Int
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collections(first: $first) {
      nodes {
        ...Collection
      }
    }
  }
` as const;
