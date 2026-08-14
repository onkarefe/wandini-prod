import {Image} from '@shopify/hydrogen';
import useEmblaCarousel from 'embla-carousel-react';
import {useCallback, useEffect, useState} from 'react';
import {Link} from '~/lib/i18n-router';
import type {
  SimilarMotifsPreviewData,
  SimilarMotifsPreviewProduct,
} from '~/lib/similar-products-preview';
import '../styles/similarMotifsCarousel.css';

function ArrowIcon({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

function MotifsIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="7" y="17" width="24" height="24" rx="2" />
      <rect x="17" y="7" width="24" height="24" rx="2" />
    </svg>
  );
}

function formatPrice(
  price: SimilarMotifsPreviewProduct['minPrice'],
): string | null {
  if (!price) return null;

  const amount = Number(price.amount);

  if (!Number.isFinite(amount)) {
    return `${price.amount} ${price.currencyCode} / m²`;
  }

  try {
    return `${new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: price.currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} / m²`;
  } catch {
    return `${price.amount} ${price.currencyCode} / m²`;
  }
}

function SimilarProductCard({product}: {product: SimilarMotifsPreviewProduct}) {
  const priceLabel = formatPrice(product.minPrice);

  return (
    <article className="similar-motifs-card">
      <Link
        to={`/products/${product.handle}`}
        className="similar-motifs-card__link"
        aria-label={product.title}
      >
        <div className="similar-motifs-card__media">
          {product.image ? (
            <Image
              data={product.image}
              alt={product.image.altText || product.title}
              className="similar-motifs-card__image"
              sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 84vw"
              loading="lazy"
            />
          ) : (
            <span
              className="similar-motifs-card__placeholder"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="similar-motifs-card__body">
          <h3>{product.title}</h3>
          {priceLabel ? <p>{priceLabel}</p> : null}
        </div>
      </Link>
    </article>
  );
}

function ExploreAllCard({data}: {data: SimilarMotifsPreviewData}) {
  return (
    <article className="similar-motifs-explore-card">
      <Link
        to={data.similarProductsPath}
        state={{
          sourceProductTitle: data.sourceProductTitle,
          sourceProductImageUrl: data.sourceProductImageUrl,
        }}
        className="similar-motifs-explore-card__link"
        aria-label="Alle ähnlichen Motive entdecken"
      >
        <span className="similar-motifs-explore-card__icon">
          <MotifsIcon />
        </span>
        <span className="similar-motifs-explore-card__eyebrow">
          Ähnliche Motive
        </span>
        <h3>Alle ähnlichen Motive entdecken</h3>
        <span className="similar-motifs-explore-card__action">
          Jetzt entdecken
          <ArrowIcon direction="right" />
        </span>
      </Link>
    </article>
  );
}

export default function SimilarMotifsCarousel({
  data,
}: {
  data: SimilarMotifsPreviewData;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    loop: false,
  });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateControls = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    updateControls();
    emblaApi.on('select', updateControls);
    emblaApi.on('reInit', updateControls);

    return () => {
      emblaApi.off('select', updateControls);
      emblaApi.off('reInit', updateControls);
    };
  }, [emblaApi, updateControls]);

  if (data.products.length === 0) return null;

  return (
    <section
      className="similar-motifs-section"
      aria-labelledby="similar-motifs-heading"
    >
      <div className="similar-motifs-section__header">
        <h2 id="similar-motifs-heading">Ähnliche Motive</h2>

        <div className="similar-motifs-section__controls">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canScrollPrev}
            aria-label="Vorherige Motive anzeigen"
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canScrollNext}
            aria-label="Weitere Motive anzeigen"
          >
            <ArrowIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="similar-motifs-section__content">
        <ExploreAllCard data={data} />

        <div
          className="similar-motifs-carousel"
          ref={emblaRef}
          role="region"
          aria-roledescription="Karussell"
          aria-label="Ähnliche Motive"
        >
          <div className="similar-motifs-carousel__track">
            {data.products.map((product, index) => (
              <div
                className="similar-motifs-carousel__slide"
                key={product.id}
                role="group"
                aria-roledescription="Folie"
                aria-label={`${index + 1} von ${data.products.length}`}
              >
                <SimilarProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
