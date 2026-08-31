import type {CustomCollectionQuery} from 'storefrontapi.generated';
import {BestsellerCard} from '~/components/AllProdutsNew';
import {Link} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

type CollectionData = NonNullable<CustomCollectionQuery['collection']>;
type CollectionProduct = CollectionData['products']['nodes'][number];

type BestsellerCollectionLayoutProps = {
  collection: CollectionData;
};

const BESTSELLER_BLOCK_PATTERNS = [
  {
    className: 'bestseller-collection__block--feature-left',
    slotClassNames: [
      'bestseller-collection__slot--feature',
      'bestseller-collection__slot--stack-top',
      'bestseller-collection__slot--stack-bottom',
    ],
  },
  {
    className: 'bestseller-collection__block--duo',
    slotClassNames: [
      'bestseller-collection__slot--equal',
      'bestseller-collection__slot--equal',
    ],
  },
  {
    className: 'bestseller-collection__block--feature-right',
    slotClassNames: [
      'bestseller-collection__slot--stack-top',
      'bestseller-collection__slot--stack-bottom',
      'bestseller-collection__slot--feature',
    ],
  },
  {
    className: 'bestseller-collection__block--anchor',
    slotClassNames: [
      'bestseller-collection__slot--wide',
      'bestseller-collection__slot--support',
      'bestseller-collection__slot--support',
    ],
  },
] as const;

type ProductSlotProps = {
  product?: CollectionProduct;
  slotClassName: string;
};

function ProductSlot({
  product,
  slotClassName,
}: ProductSlotProps) {
  if (!product) return null;

  return (
    <div className={`bestseller-collection__slot ${slotClassName}`}>
      <BestsellerCard product={product} />
    </div>
  );
}

export default function BestsellerCollectionLayout({
  collection,
}: BestsellerCollectionLayoutProps) {
  const {t} = useTranslation();
  const products = collection.products.nodes;

  const renderSlot = (product: CollectionProduct, slotClassName: string) => (
    <ProductSlot
      key={product.id}
      product={product}
      slotClassName={slotClassName}
    />
  );

  const blocks: Array<{
    pattern: (typeof BESTSELLER_BLOCK_PATTERNS)[number];
    products: CollectionProduct[];
    productOffset: number;
  }> = [];
  let productOffset = 0;
  let patternIndex = 0;

  while (productOffset < products.length) {
    const pattern =
      BESTSELLER_BLOCK_PATTERNS[
        patternIndex % BESTSELLER_BLOCK_PATTERNS.length
      ];
    const blockProducts = products.slice(
      productOffset,
      productOffset + pattern.slotClassNames.length,
    );

    blocks.push({pattern, products: blockProducts, productOffset});
    productOffset += blockProducts.length;
    patternIndex += 1;
  }

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
        aria-label={t('collection.productsLabel', {title: collection.title})}
      >
        {blocks.map(({pattern, products: blockProducts, productOffset}) => (
          <section
            className={`bestseller-collection__block ${pattern.className} bestseller-collection__block--count-${blockProducts.length}`}
            aria-label={t('collection.bestSellingRange', {
              start: productOffset + 1,
              end: productOffset + blockProducts.length,
            })}
            key={blockProducts[0].id}
          >
            {blockProducts.map((product, index) =>
              renderSlot(product, pattern.slotClassNames[index]),
            )}
          </section>
        ))}
      </div>

      <div className="bestseller-collection__cta container mx-auto">
        <Link
          className="bestseller-collection__cta-button"
          to="/collections/fototapeten"
        >
          <span>{t('collection.discoverAllWallpapers')}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-5-5 5 5-5 5" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
