import {useCallback, useEffect, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {useTranslation} from '~/i18n/useTranslation';
import {Link} from '~/lib/i18n-router';

type CollectionSwiperItem = {
  id: string;
  title: string;
  subtitle: string;
  image: {
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  } | null;
  link: string;
};

interface AllProdutsProps {
  items: CollectionSwiperItem[];
  sectionTitle?: string;
}

function isExternalUrl(url: string) {
  return /^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith('//');
}

function CollectionCardContent({item}: {item: CollectionSwiperItem}) {
  return (
    <>
      {item.image?.url ? (
        <div className="all-productIMGBOX">
          <img
            src={item.image.url}
            alt={item.image.altText || item.title}
            className="all-product-image"
          />
        </div>
      ) : null}

      <div className="all-product-info">
        <div className="all-product-title">{item.title}</div>
        <div className="all-product-subtitle">{item.subtitle}</div>
      </div>
    </>
  );
}

export default function AllProduts({
  items,
  sectionTitle,
}: AllProdutsProps) {
  const {t} = useTranslation();
  const resolvedSectionTitle = sectionTitle ?? t('collection.allProducts');
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    loop: items.length > 3,
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

  if (!items.length) return null;

  return (
    <div
      id="all-products-section"
      className="container mx-auto my-[50px] md:my-0"
      onMouseEnter={() => setIsMouseOver(true)}
      onMouseLeave={() => setIsMouseOver(false)}
    >
      <div className="seperator">
        <h3>{resolvedSectionTitle}</h3>
      </div>

      <div
        className="all-products-list"
        ref={emblaRef}
        role="region"
        aria-roledescription={t('common.carousel')}
        aria-label={resolvedSectionTitle}
      >
        <div className="all-products-track">
          {items.map((item, index) => (
            <div
              className="all-products-slide"
              key={item.id || index}
              role="group"
              aria-roledescription={t('common.slide')}
              aria-label={`${index + 1} / ${items.length}`}
            >
              {item.link ? (
                isExternalUrl(item.link) ? (
                  <a
                    href={item.link}
                    className="all-product-row all-product-link"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'block',
                    }}
                  >
                    <CollectionCardContent item={item} />
                  </a>
                ) : (
                  <Link
                    to={item.link}
                    className="all-product-row all-product-link"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'block',
                    }}
                  >
                    <CollectionCardContent item={item} />
                  </Link>
                )
              ) : (
                <div className="all-product-row all-product-link">
                  <CollectionCardContent item={item} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {scrollSnaps.length > 1 ? (
        <div
          className="allProductsDots"
          aria-label={t('collection.slides')}
        >
          {scrollSnaps.map((_, index) => (
            <button
              key={`all-products-dot-${index}`}
              type="button"
              className={`allProductsDot${
                index === selectedIndex ? ' allProductsDot--active' : ''
              }`}
              aria-label={t('collection.goToSlide', {number: index + 1})}
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
