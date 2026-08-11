import {useLocation, useNavigation} from 'react-router';
import type {CustomCollectionQuery} from 'storefrontapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {ZubehorProductCard} from '~/components/ZubehorProductCard';
import '../styles/zubehor-collection.css';

type CollectionData = NonNullable<CustomCollectionQuery['collection']>;
type CollectionProduct = CollectionData['products']['nodes'][number];

type ZubehorCollectionLayoutProps = {
  collection: CollectionData;
  isLoggedIn: boolean;
  wishlistProductIds: string[];
};

export default function ZubehorCollectionLayout({
  collection,
  isLoggedIn,
  wishlistProductIds,
}: ZubehorCollectionLayoutProps) {
  const location = useLocation();
  const navigation = useNavigation();
  const wishlistProductIdSet = new Set(wishlistProductIds);
  const isCollectionUpdating =
    navigation.state !== 'idle' &&
    navigation.location?.pathname === location.pathname &&
    navigation.location.search !== location.search;

  return (
    <div className="zubehor-collection">
      <section
        className="zubehor-collection__hero container mx-auto"
        style={
          collection.image?.url
            ? {
                backgroundImage: `url('${collection.image.url}')`,
              }
            : undefined
        }
      >
        <h1>{collection.title}</h1>
      </section>

      <section
        className={`collection-products-shell zubehor-collection__products ${
          isCollectionUpdating ? 'is-updating' : ''
        }`}
        aria-busy={isCollectionUpdating}
      >
        <PaginatedResourceSection<CollectionProduct>
          connection={collection.products}
          resourcesClassName="custom-products-grid container mx-auto zubehor-collection__grid"
        >
          {({node: product}) => (
            <ZubehorProductCard
              key={product.id}
              productId={product.id}
              handle={product.handle}
              title={product.title}
              image={product.images.nodes[0] ?? null}
              minPrice={product.priceRange?.minVariantPrice ?? null}
              isLoggedIn={isLoggedIn}
              isWishlisted={wishlistProductIdSet.has(product.id)}
            />
          )}
        </PaginatedResourceSection>

        {isCollectionUpdating ? (
          <div className="zubehor-collection__loader" aria-live="polite">
            <span className="zubehor-collection__spinner" aria-hidden="true" />
            <span className="zubehor-collection__loader-text">
              Produkte werden aktualisiert
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
