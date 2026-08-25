import {Image} from '@shopify/hydrogen';
import useEmblaCarousel from 'embla-carousel-react';
import {useCallback, useEffect, useState} from 'react';
import {Link} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {formatLocaleCurrency} from '~/lib/locale-format';
import type {SelectedLocale} from '~/lib/locale';
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
  locale: SelectedLocale,
): string | null {
  if (!price) return null;

  const amount = Number(price.amount);

  if (!Number.isFinite(amount)) {
    return `${price.amount} ${price.currencyCode} / m²`;
  }

  try {
    return `${formatLocaleCurrency(amount, price.currencyCode, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} / m²`;
  } catch {
    return `${price.amount} ${price.currencyCode} / m²`;
  }
}

function SimilarProductCard({product}: {product: SimilarMotifsPreviewProduct}) {
  const {locale} = useTranslation();
  const priceLabel = formatPrice(product.minPrice, locale);

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
  const {t} = useTranslation();

  return (
    <article className="similar-motifs-explore-card">
      <Link
        to={data.similarProductsPath}
        state={{
          sourceProductTitle: data.sourceProductTitle,
          sourceProductImageUrl: data.sourceProductImageUrl,
        }}
        className="similar-motifs-explore-card__link"
        aria-label={t('similarMotifs.exploreAll')}
      >
        <span className="similar-motifs-explore-card__icon">
          <MotifsIcon />
        </span>
        <span className="similar-motifs-explore-card__eyebrow">
          {t('similarMotifs.title')}
        </span>
        <h3>{t('similarMotifs.exploreAll')}</h3>
        <span className="similar-motifs-explore-card__action">
          {t('similarMotifs.discoverNow')}
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
  const {t} = useTranslation();
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
        <h2 id="similar-motifs-heading">{t('similarMotifs.title')}</h2>

        <div className="similar-motifs-section__controls">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canScrollPrev}
            aria-label={t('similarMotifs.previous')}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canScrollNext}
            aria-label={t('similarMotifs.next')}
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
          aria-roledescription={t('common.carousel')}
          aria-label={t('similarMotifs.title')}
        >
          <div className="similar-motifs-carousel__track">
            {data.products.map((product, index) => (
              <div
                className="similar-motifs-carousel__slide"
                key={product.id}
                role="group"
                aria-roledescription={t('common.slide')}
                aria-label={t('similarMotifs.position', {
                  number: index + 1,
                  total: data.products.length,
                })}
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
