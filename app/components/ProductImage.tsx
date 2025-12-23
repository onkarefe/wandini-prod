


import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';
import { Image } from '@shopify/hydrogen';
import '../styles/customProductCard.css';
import '../styles/productDetail.css';

// images: Product['images']



export function ProductImage({ images }: { images: any }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  if (!images || !images.edges || images.edges.length === 0) {
    return <div className="product-image" />;
  }
  const imageNodes = images.edges.map(({ node }: any) => node);

  // Swipe ile ana görsel değişince thumbnail'ı güncelle
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    // İlk renderda da doğru indexte başlasın
    emblaApi.scrollTo(selectedIndex);
  }, [emblaApi, onSelect]);

  // Thumbnail'a tıklayınca ana slider'ı güncelle
  const onThumbClick = (idx: number) => {
    setSelectedIndex(idx);
    if (emblaApi) emblaApi.scrollTo(idx);
  };

  return (
    <div className="product-image-carousel">
      {/* Ana büyük görsel swipe edilebilir */}
      <div className="embla embla--main" ref={emblaRef} style={{ marginBottom: 16 }}>
        <div className="embla__container">
          {imageNodes.map((img: any, idx: number) => (
            <div className="embla__slide" key={img.id}>
              <Image
                alt={img.altText || 'Product Image'}
                aspectRatio="1/1"
                data={img}
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          ))}
        </div>
      </div>
      {/* Thumbnail bar - ilk 4 küçük görsel */}
      <div className="thumbs-bar">
        {imageNodes.slice(0, 4).map((img: any, idx: number) => (
          <div
            key={img.id + '-thumb'}
            className='thumbsImgBox'
            onClick={() => onThumbClick(idx)}
            style={{
              border: idx === selectedIndex ? '2px solid #b4b4b4ff' : '2px solid #eee',
              opacity: idx === selectedIndex ? 1 : 0.5,
            }}
          >
            <img
              src={img.url}
              alt={img.altText || 'Product Thumbnail'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
