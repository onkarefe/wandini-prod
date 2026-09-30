import {Link} from '~/lib/i18n-router';
import {Image, Money} from '@shopify/hydrogen';
import type {
  CollectionItemFragment,
  RecommendedProductFragment,
} from 'storefrontapi.generated';
import {useVariantUrl} from '~/lib/variants';

export function ProductItem({
  product,
  loading,
  headingLevel = 'h3',
}: {
  product:
    | CollectionItemFragment
    | RecommendedProductFragment;
  loading?: 'eager' | 'lazy';
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  const variantUrl = useVariantUrl(product.handle);
  const image = product.featuredImage;
  return (
    <Link
      className="product-item"
      key={product.id}
      prefetch="intent"
      to={variantUrl}
    >
      {image && (
        <Image
          alt={image.altText || product.title}
          className="productImage"
          aspectRatio="1/1"
          data={image}
          loading={loading}
        />
      )}
      <Heading className="product-item__title">{product.title}</Heading>
      <small>
        <Money data={product.priceRange.minVariantPrice} />
      </small>
    </Link>
  );
}
