import useEmblaCarousel from 'embla-carousel-react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
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
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({loop: false});
  const fallbackAlt = productTitle?.trim() || 'Product Image';
  const imageNodes = useMemo<ProductImageNode[]>(() => {
    return (images?.edges ?? []).map(({node}) => node);
  }, [images]);

  const updateCarouselControls = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    updateCarouselControls();
    emblaApi.on('select', updateCarouselControls);
    emblaApi.on('reInit', updateCarouselControls);

    return () => {
      emblaApi.off('select', updateCarouselControls);
      emblaApi.off('reInit', updateCarouselControls);
    };
  }, [emblaApi, updateCarouselControls]);

  if (imageNodes.length === 0) {
    return <div className="product-image" aria-hidden="true" />;
  }

  return (
    <div className="product-image-carousel">
      <div className="embla embla--main" ref={emblaRef}>
        <div className="embla__container">
          {imageNodes.map((img, index) => (
            <div className="embla__slide" key={img.id ?? img.url ?? `product-image-${index}`}>
              <Image
                alt={img.altText || fallbackAlt}
                data={img}
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          ))}
        </div>

        {imageNodes.length > 1 && (
          <>
            <button
              type="button"
              className="productCarouselArrow productCarouselArrow--prev"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={!canScrollPrev}
              aria-label="Show previous product image"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className="productCarouselArrow productCarouselArrow--next"
              onClick={() => emblaApi?.scrollNext()}
              disabled={!canScrollNext}
              aria-label="Show next product image"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
