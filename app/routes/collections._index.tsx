import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/collections._index';
import {Image} from '@shopify/hydrogen';
import type {CollectionFragment} from 'storefrontapi.generated';
import collectionMainlistStyles from '~/styles/collection-mainlist.css?url';

type CollectionListItem = CollectionFragment & {
  showListing?: {
    value?: string | null;
  } | null;
};

export function links() {
  return [{rel: 'stylesheet', href: collectionMainlistStyles}];
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const [{collections}] = await Promise.all([
    context.storefront.query(COLLECTIONS_QUERY, {
      variables: {
        first: 12,
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {
    collections: {
      ...collections,
      nodes: collections.nodes.filter(
        (collection: CollectionListItem) =>
          collection.showListing?.value === 'true',
      ),
    },
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData(_: Route.LoaderArgs) {
  return {};
}

export default function Collections() {
  const {collections} = useLoaderData<typeof loader>();

  return (
    <main className="collection-mainlist-page">
      <section className="collection-mainlist" aria-label="Collections">
        {collections.nodes.map((collection: CollectionListItem, index: number) => (
          <CollectionItem
            key={collection.id}
            collection={collection}
            index={index}
          />
        ))}
      </section>
    </main>
  );
}

function CollectionItem({
  collection,
  index,
}: {
  collection: CollectionListItem;
  index: number;
}) {
  return (
    <Link
      className="collection-mainlist__item"
      key={collection.id}
      to={`/collections/${collection.handle}`}
      prefetch="intent"
    >
      {collection?.image && (
        <Image
          className="collection-mainlist__image"
          alt={collection.image.altText || collection.title}
          aspectRatio="4/5"
          data={collection.image}
          loading={index < 3 ? 'eager' : undefined}
          sizes="(min-width: 45em) 400px, 100vw"
        />
      )}
      <span className="collection-mainlist__overlay" aria-hidden="true" />
      <h2 className="collection-mainlist__title">{collection.title}</h2>
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
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    collections(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor
    ) {
      nodes {
        ...Collection
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
` as const;
