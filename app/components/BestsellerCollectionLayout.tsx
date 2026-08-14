import {useMemo} from 'react';
import type {CustomCollectionQuery} from 'storefrontapi.generated';
import BestsellerProductCard from '~/components/BestsellerProductCard';
import {Link} from '~/lib/i18n-router';
import {buildSimilarProductsPath} from '~/lib/similar-products';
import '../styles/bestseller-collection.css';

type CollectionData = NonNullable<CustomCollectionQuery['collection']>;
type CollectionProduct = CollectionData['products']['nodes'][number];
type CollectionProductWithSimilarFields = CollectionProduct & {
  mainMotif?: {value?: string | null} | null;
  mainTheme?: {value?: string | null} | null;
};

type BestsellerCollectionLayoutProps = {
  collection: CollectionData;
  isLoggedIn: boolean;
  wishlistProductIds: string[];
};

type ProductSlotProps = {
  product?: CollectionProduct;
  slotClassName: string;
  isLoggedIn: boolean;
  isWishlisted: boolean;
  collectionHandle: string;
};

function ProductSlot({
  product,
  slotClassName,
  isLoggedIn,
  isWishlisted,
  collectionHandle,
}: ProductSlotProps) {
  if (!product) return null;

  const productWithSimilarFields =
    product as CollectionProductWithSimilarFields;
  const mainMotif = productWithSimilarFields.mainMotif?.value?.trim() ?? '';
  const mainTheme = productWithSimilarFields.mainTheme?.value?.trim() ?? '';
  const similarProductsUrl =
    mainMotif && mainTheme
      ? buildSimilarProductsPath({
          mainMotif,
          mainTheme,
          productCategory: collectionHandle,
        })
      : undefined;

  return (
    <div className={`bestseller-collection__slot ${slotClassName}`}>
      <BestsellerProductCard
        productId={product.id}
        title={product.title}
        images={product.images.nodes.map((image) => ({
          url: image.url,
          altText: image.altText ?? undefined,
        }))}
        productUrl={`/products/${product.handle}`}
        minPrice={product.priceRange?.minVariantPrice ?? undefined}
        isLoggedIn={isLoggedIn}
        isWishlisted={isWishlisted}
        showSimilarMotifsButton={Boolean(similarProductsUrl)}
        similarProductsUrl={similarProductsUrl ?? undefined}
        similarProductsSourceTitle={product.title}
        similarProductsSourceImageUrl={
          product.images.nodes[0]?.url ?? undefined
        }
      />
    </div>
  );
}

export default function BestsellerCollectionLayout({
  collection,
  isLoggedIn,
  wishlistProductIds,
}: BestsellerCollectionLayoutProps) {
  const products = collection.products.nodes.slice(0, 14);
  const wishlistProductIdSet = useMemo(
    () => new Set(wishlistProductIds),
    [wishlistProductIds],
  );

  const renderSlot = (productIndex: number, slotClassName: string) => (
    <ProductSlot
      key={products[productIndex]?.id ?? `empty-${productIndex}`}
      product={products[productIndex]}
      slotClassName={slotClassName}
      isLoggedIn={isLoggedIn}
      isWishlisted={wishlistProductIdSet.has(products[productIndex]?.id ?? '')}
      collectionHandle={collection.handle}
    />
  );

  return (
    <div className="bestseller-collection">
      <header className="bestseller-collection__intro container mx-auto">
        <h1>{collection.title}</h1>
        {collection.description ? (
          <p className="bestseller-collection__description">
            {collection.description}
          </p>
        ) : null}
      </header>

      <div
        className="bestseller-collection__lookbook container mx-auto"
        aria-label={`${collection.title} Produkte`}
      >
        <section
          className="bestseller-collection__block bestseller-collection__block--feature-left"
          aria-label="Bestseller 1 bis 3"
        >
          {renderSlot(0, 'bestseller-collection__slot--feature')}
          {renderSlot(1, 'bestseller-collection__slot--stack-top')}
          {renderSlot(2, 'bestseller-collection__slot--stack-bottom')}
        </section>

        <section
          className="bestseller-collection__block bestseller-collection__block--duo"
          aria-label="Bestseller 4 bis 5"
        >
          {renderSlot(3, 'bestseller-collection__slot--equal')}
          {renderSlot(4, 'bestseller-collection__slot--equal')}
        </section>

        <section
          className="bestseller-collection__block bestseller-collection__block--feature-right"
          aria-label="Bestseller 6 bis 8"
        >
          {renderSlot(5, 'bestseller-collection__slot--stack-top')}
          {renderSlot(6, 'bestseller-collection__slot--stack-bottom')}
          {renderSlot(7, 'bestseller-collection__slot--feature')}
        </section>

        <section
          className="bestseller-collection__block bestseller-collection__block--anchor"
          aria-label="Bestseller 9 bis 11"
        >
          {renderSlot(8, 'bestseller-collection__slot--wide')}
          {renderSlot(9, 'bestseller-collection__slot--support')}
          {renderSlot(10, 'bestseller-collection__slot--support')}
        </section>

        <section
          className="bestseller-collection__block bestseller-collection__block--feature-left bestseller-collection__block--finale"
          aria-label="Bestseller 12 bis 14"
        >
          {renderSlot(11, 'bestseller-collection__slot--feature')}
          {renderSlot(12, 'bestseller-collection__slot--stack-top')}
          {renderSlot(13, 'bestseller-collection__slot--stack-bottom')}
        </section>
      </div>

      <div className="bestseller-collection__cta container mx-auto">
        <Link
          className="bestseller-collection__cta-button"
          to="/collections/fototapeten"
        >
          <span>Alle Fototapeten entdecken</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-5-5 5 5-5 5" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
