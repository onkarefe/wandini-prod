import useEmblaCarousel from 'embla-carousel-react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import '../styles/customProductCard.css';
import '../styles/productDetail.css';

type ProductImages = ProductFragment['images'];
type ProductImageNode = NonNullable<ProductImages>['edges'][number]['node'];

export function ProductImage({
  images,
  productTitle,
}: {
  images: ProductImages | null | undefined;
  productTitle?: string | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({loop: false});
  const fallbackAlt = productTitle?.trim() || 'Product Image';
  const imageNodes = useMemo<ProductImageNode[]>(() => {
    return (images?.edges ?? []).map(({node}) => node);
  }, [images]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    onSelect();
    emblaApi.on('select', onSelect);

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const onThumbClick = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      emblaApi?.scrollTo(index);
    },
    [emblaApi],
  );

  useEffect(() => {
    if (selectedIndex <= imageNodes.length - 1) return;

    setSelectedIndex(0);
    emblaApi?.scrollTo(0);
  }, [emblaApi, imageNodes.length, selectedIndex]);

  if (imageNodes.length === 0) {
    return <div className="product-image" aria-hidden="true" />;
  }

  return (
    <div className="product-image-carousel">
      <div className="embla embla--main" ref={emblaRef} style={{marginBottom: 16}}>
        <div className="embla__container">
          {imageNodes.map((img, index) => (
            <div className="embla__slide" key={img.id ?? img.url ?? `product-image-${index}`}>
              <Image
                alt={img.altText || fallbackAlt}
                aspectRatio="1/1"
                data={img}
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="thumbs-bar" role="tablist" aria-label="Product image thumbnails">
        {imageNodes.slice(0, 4).map((img, index) => {
          const isSelected = index === selectedIndex;

          return (
            <button
              key={`${img.id ?? img.url ?? `product-image-${index}`}-thumb`}
              type="button"
              className="thumbsImgBox"
              onClick={() => onThumbClick(index)}
              aria-label={`Show product image ${index + 1}`}
              aria-pressed={isSelected}
              style={{
                padding: 0,
                background: 'transparent',
                border: isSelected ? '2px solid #b4b4b4ff' : '2px solid #eee',
                opacity: isSelected ? 1 : 0.5,
              }}
            >
              <img
                src={img.url}
                alt={img.altText || `${fallbackAlt} thumbnail ${index + 1}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
