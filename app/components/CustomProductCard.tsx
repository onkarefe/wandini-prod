import React, { useEffect, useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import '../styles/customProductCard.css';

interface CustomProductCardProps {
  title: string;
  description?: string;
  images: { url: string; altText?: string }[];
  productUrl: string;
}

export const CustomProductCard: React.FC<CustomProductCardProps> = ({
  title,
  description,
  images,
  productUrl,
}) => {
  const displayImages = images.slice(0, 3);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' });
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  return (
    <a href={productUrl} className="custom-product-card" aria-label={title}>
      <div className="custom-product-card__media" ref={emblaRef}>
        <div className="custom-product-card__container">
          {displayImages.map((img) => (
            <div className="custom-product-card__slide" key={img.url}>
              <img
                src={img.url}
                alt={img.altText || title}
                className="custom-product-card__image"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="custom-product-card__dots">
        {displayImages.map((img, i) => (
          <button
            key={`dot-${img.url}`}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            className={
              'custom-product-card__dot' +
              (i === selectedIndex ? ' custom-product-card__dot--active' : '')
            }
            onClick={(e) => {
              e.preventDefault(); // kartın linkine tıklamayı engellemeden slider’ı kontrol et
              emblaApi?.scrollTo(i);
            }}
          />
        ))}
      </div>

      <div className="custom-product-card__body">
        <h3 className="custom-product-card__title">{title}</h3>
        {description && <p className="custom-product-card__desc">{description}</p>}
      </div>
    </a>
  );
};

export default CustomProductCard;
