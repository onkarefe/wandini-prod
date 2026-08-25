import {useCallback, useEffect, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {useTranslation} from '~/i18n/useTranslation';
import {Link} from '~/lib/i18n-router';

type ProductImage = {
  id?: string | null;
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

type ProductMoney = {
  amount: string;
  currencyCode: string;
};

export type BestsellerProduct = {
  id: string;
  handle: string;
  title: string;
  images: {
    nodes: ProductImage[];
  };
  priceRange: {
    minVariantPrice: ProductMoney;
  };
};

type AllProdutsNewProps = {
  products: BestsellerProduct[];
  sectionTitle?: string;
};

function formatPrice(price: ProductMoney) {
  const amount = Number(price.amount);

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${price.amount} ${price.currencyCode}`;
  }
}

export function BestsellerCard({product}: {product: BestsellerProduct}) {
  const primaryImage = product.images.nodes[0] ?? null;
  const listingImage = product.images.nodes[1] ?? primaryImage;
  const hasHoverImage =
    primaryImage && listingImage && primaryImage.url !== listingImage.url;
  const price = formatPrice(product.priceRange.minVariantPrice);

  return (
    <Link
      to={`/products/${product.handle}`}
      className="all-product-row all-product-link bestseller-product-card"
      aria-label={product.title}
      style={{textDecoration: 'none', color: 'inherit'}}
    >
      {listingImage ? (
        <div className="all-productIMGBOX bestseller-product-media">
          <img
            src={listingImage.url}
            alt={listingImage.altText || product.title}
            className="all-product-image bestseller-product-image bestseller-product-image--listing"
            width={listingImage.width ?? undefined}
            height={listingImage.height ?? undefined}
            loading="lazy"
            decoding="async"
          />
          {hasHoverImage ? (
            <img
              src={primaryImage.url}
              alt=""
              aria-hidden="true"
              className="all-product-image bestseller-product-image bestseller-product-image--primary"
              width={primaryImage.width ?? undefined}
              height={primaryImage.height ?? undefined}
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </div>
      ) : null}

      <div className="all-product-info">
        <div className="all-product-title">{product.title}</div>
        <div className="all-product-subtitle bestseller-product-price">
          Ab {price} / m²
        </div>
      </div>
    </Link>
  );
}

export default function AllProdutsNew({
  products,
  sectionTitle,
}: AllProdutsNewProps) {
  const {t} = useTranslation();
  const resolvedSectionTitle = sectionTitle ?? t('home.bestSelling');
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    loop: products.length > 3,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [isMouseOver, setIsMouseOver] = useState(false);

  const updateCarouselState = useCallback(() => {
    if (!emblaApi) return;

    setSelectedIndex(emblaApi.selectedScrollSnap());
    setScrollSnaps(emblaApi.scrollSnapList());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    updateCarouselState();
    emblaApi.on('select', updateCarouselState);
    emblaApi.on('reInit', updateCarouselState);

    return () => {
      emblaApi.off('select', updateCarouselState);
      emblaApi.off('reInit', updateCarouselState);
    };
  }, [emblaApi, updateCarouselState]);

  useEffect(() => {
    if (!emblaApi || isMouseOver || scrollSnaps.length <= 1) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const autoplayTimer = window.setTimeout(() => {
      if (emblaApi.canScrollNext()) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollTo(0);
      }
    }, 3000);

    return () => window.clearTimeout(autoplayTimer);
  }, [emblaApi, isMouseOver, scrollSnaps.length, selectedIndex]);

  if (!products.length) return null;

  return (
    <section
      id="bestseller-products-section"
      className="container mx-auto my-[50px] md:my-0"
      aria-labelledby="bestseller-products-title"
      onMouseEnter={() => setIsMouseOver(true)}
      onMouseLeave={() => setIsMouseOver(false)}
    >
      <div className="seperator">
        <h3 id="bestseller-products-title">{resolvedSectionTitle}</h3>
      </div>

      <div
        className="all-products-list"
        ref={emblaRef}
        role="region"
        aria-roledescription={t('common.carousel')}
        aria-label={resolvedSectionTitle}
      >
        <div className="all-products-track">
          {products.map((product, index) => (
            <div
              className="all-products-slide"
              key={product.id}
              role="group"
              aria-roledescription={t('common.slide')}
              aria-label={`${index + 1} / ${products.length}`}
            >
              <BestsellerCard product={product} />
            </div>
          ))}
        </div>
      </div>

      {scrollSnaps.length > 1 ? (
        <div
          className="allProductsDots"
          aria-label={t('home.bestSellingSlides')}
        >
          {scrollSnaps.map((snap, index) => (
            <button
              key={`bestseller-products-dot-${snap}`}
              type="button"
              className={`allProductsDot${
                index === selectedIndex ? ' allProductsDot--active' : ''
              }`}
              aria-label={t('home.bestSellingSlide', {number: index + 1})}
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
