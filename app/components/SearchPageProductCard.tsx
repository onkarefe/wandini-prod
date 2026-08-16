import {Image, Money} from '@shopify/hydrogen';
import {Link} from '~/lib/i18n-router';
import type {RegularSearchReturn} from '~/lib/search';

type SearchProduct =
  RegularSearchReturn['result']['items']['products']['nodes'][number];

type SearchPageProductCardProps = {
  product: SearchProduct;
  to: string;
  loading?: 'eager' | 'lazy';
};

export function SearchPageProductCard({
  product,
  to,
  loading = 'lazy',
}: SearchPageProductCardProps) {
  const variant = product.selectedOrFirstAvailableVariant;
  const image = variant?.image;
  const price = variant?.price;
  const compareAtPrice = variant?.compareAtPrice;
  const hasDiscount =
    price &&
    compareAtPrice &&
    Number(compareAtPrice.amount) > Number(price.amount);

  return (
    <Link className="search-product-card" to={to} aria-label={product.title}>
      <div className="search-product-card__media">
        {image ? (
          <Image
            aspectRatio="4/3"
            className="search-product-card__image"
            data={image}
            fetchPriority={loading === 'eager' ? 'high' : 'auto'}
            loading={loading}
            sizes="(min-width: 1280px) 25vw, (min-width: 900px) 33vw, (min-width: 540px) 50vw, 100vw"
          />
        ) : (
          <span
            className="search-product-card__placeholder"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="search-product-card__body">
        <h3>{product.title}</h3>
        {price ? (
          <div className="search-product-card__price">
            <Money data={price} />
            {hasDiscount ? (
              <s>
                <Money data={compareAtPrice} />
              </s>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export default SearchPageProductCard;
