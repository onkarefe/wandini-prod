import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {type FetcherWithComponents, useNavigate} from 'react-router';
import {
  CartForm,
  getAdjacentAndFirstAvailableVariants,
  getProductOptions,
  Image,
  Money,
  type OptimisticCartLineInput,
  useOptimisticVariant,
} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {ProductPrice} from '~/components/ProductPrice';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {prefixPathWithLocale, type SelectedLocale} from '~/lib/locale';
import '../styles/zubehor-product-detail.css';

type ProductImageNode = ProductFragment['images']['edges'][number]['node'];

type RichTextNode = {
  type?: string;
  value?: string;
  url?: string;
  level?: number;
  listType?: string;
  bold?: boolean;
  italic?: boolean;
  children?: RichTextNode[];
};

type CartActionData = {
  errors?: Array<unknown>;
};

type ZubehorProductLayoutProps = {
  product: ProductFragment;
};

function ArrowIcon({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
    </svg>
  );
}

function getImageKey(image?: ProductImageNode | null) {
  return image?.id ?? image?.url;
}

function addUniqueImage(
  images: ProductImageNode[],
  image?: ProductImageNode | null,
) {
  if (!image) return;
  const key = getImageKey(image);
  if (images.some((item) => getImageKey(item) === key)) return;
  images.push(image);
}

function getWrappedIndex(index: number, imageCount: number) {
  if (imageCount <= 1) return 0;
  return (index + imageCount) % imageCount;
}

function ZubehorProductGallery({
  images,
  preferredImageKey,
  productId,
  productTitle,
}: {
  images: ProductImageNode[];
  preferredImageKey?: string;
  productId: string;
  productTitle: string;
}) {
  const {t} = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    const preferredIndex = images.findIndex(
      (image) => getImageKey(image) === preferredImageKey,
    );
    setActiveIndex(preferredIndex >= 0 ? preferredIndex : 0);
  }, [images, preferredImageKey, productId]);

  if (!images.length) {
    return (
      <div className="zpd-gallery zpd-gallery--empty" aria-hidden="true">
        <svg
          width="32"
          height="32"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
        >
          <path d="M8 10h32v28H8zM13 31l8-9 6 6 4-4 9 10M31 18h.01" />
        </svg>
      </div>
    );
  }

  const showImage = (index: number) => {
    setActiveIndex(getWrappedIndex(index, images.length));
  };

  const finishSwipe = (clientX: number) => {
    if (!hasMultipleImages || touchStartX.current === null) return;

    const distance = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 40) return;

    showImage(activeIndex + (distance < 0 ? 1 : -1));
  };

  return (
    <section
      className={`zpd-gallery${
        hasMultipleImages ? ' zpd-gallery--multiple' : ''
      }`}
      aria-label={t('product.imagesLabel', {title: productTitle})}
    >
      <div
        className="zpd-gallery__stage"
        role="group"
        aria-label={t('product.imageViewer')}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          finishSwipe(event.changedTouches[0]?.clientX ?? 0);
        }}
      >
        <div
          className="zpd-gallery__track"
          style={{transform: `translate3d(-${activeIndex * 100}%, 0, 0)`}}
        >
          {images.map((image, index) => (
            <div
              className="zpd-gallery__slide"
              key={getImageKey(image) ?? `${productId}-${index}`}
              aria-hidden={index !== activeIndex}
            >
              <Image
                data={image}
                alt={image.altText || productTitle}
                className="zpd-gallery__image"
                sizes="(min-width: 1100px) 390px, (min-width: 700px) 440px, calc(100vw - 32px)"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>

        {hasMultipleImages ? (
          <div className="zpd-gallery__controls">
            <button
              type="button"
              onClick={() => showImage(activeIndex - 1)}
              aria-label={t('product.previousImage')}
            >
              <ArrowIcon direction="left" />
            </button>
            <span aria-live="polite">
              {activeIndex + 1}/{images.length}
            </span>
            <button
              type="button"
              onClick={() => showImage(activeIndex + 1)}
              aria-label={t('product.nextImage')}
            >
              <ArrowIcon direction="right" />
            </button>
          </div>
        ) : null}
      </div>

      {hasMultipleImages ? (
        <div
          className="zpd-gallery__thumbnails"
          aria-label={t('product.selectImage')}
        >
          {images.map((image, index) => (
            <button
              type="button"
              key={`thumbnail-${getImageKey(image) ?? index}`}
              className={index === activeIndex ? 'is-active' : undefined}
              onClick={() => showImage(index)}
              aria-label={t('product.showImage', {number: index + 1})}
              aria-current={index === activeIndex ? 'true' : undefined}
            >
              <Image
                data={image}
                alt=""
                className="zpd-gallery__thumbnail-image"
                sizes="56px"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function safeRichTextUrl(url: string | undefined, locale: SelectedLocale) {
  if (!url) return '#';
  if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) return '#';
  return url.startsWith('/') ? prefixPathWithLocale(url, locale) : url;
}

function renderRichTextNode(
  node: RichTextNode,
  key: string,
  locale: SelectedLocale,
): ReactNode {
  const children = node.children?.map((child, index) =>
    renderRichTextNode(child, `${key}-${index}`, locale),
  );

  if (node.type === 'text' || (!node.type && node.value !== undefined)) {
    let content: ReactNode = node.value ?? '';
    if (node.bold) content = <strong>{content}</strong>;
    if (node.italic) content = <em>{content}</em>;
    return <Fragment key={key}>{content}</Fragment>;
  }

  switch (node.type) {
    case 'root':
      return <Fragment key={key}>{children}</Fragment>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading':
      if (node.level === 3) return <h3 key={key}>{children}</h3>;
      if (node.level === 4) return <h4 key={key}>{children}</h4>;
      return <h2 key={key}>{children}</h2>;
    case 'list':
      return node.listType === 'ordered' ? (
        <ol key={key}>{children}</ol>
      ) : (
        <ul key={key}>{children}</ul>
      );
    case 'list-item':
      return <li key={key}>{children}</li>;
    case 'link':
      return (
        <a key={key} href={safeRichTextUrl(node.url, locale)}>
          {children}
        </a>
      );
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

function renderProductInfo(
  productInfo: ProductFragment['productInfo'],
  locale: SelectedLocale,
) {
  if (!productInfo?.value) return null;

  if (productInfo.type === 'rich_text_field') {
    try {
      const richText = JSON.parse(productInfo.value) as RichTextNode;
      return renderRichTextNode(richText, 'product-info', locale);
    } catch {
      return null;
    }
  }

  return <p className="zpd-details__multiline">{productInfo.value}</p>;
}

function ZubehorCartSubmit({
  fetcher,
  disabled,
  isAvailable,
}: {
  fetcher: FetcherWithComponents<unknown>;
  disabled: boolean;
  isAvailable: boolean;
}) {
  const {open} = useAside();
  const {t} = useTranslation();
  const submitted = useRef(false);
  const [feedback, setFeedback] = useState('');
  const isPending = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      submitted.current = true;
      setFeedback('');
      return;
    }

    if (!submitted.current) return;
    submitted.current = false;

    const response = fetcher.data as CartActionData | undefined;
    if (response?.errors?.length) {
      setFeedback(
        t('product.addError'),
      );
      return;
    }

    open('cart');
  }, [fetcher.data, fetcher.state, open, t]);

  return (
    <>
      <button
        className="zpd-buy__submit"
        type="submit"
        disabled={disabled || isPending}
      >
        {isPending
          ? t('cart.adding')
          : isAvailable
            ? t('product.addToCart')
            : t('product.unavailable')}
      </button>
      <p className="zpd-buy__feedback" aria-live="polite">
        {feedback}
      </p>
    </>
  );
}

function ZubehorAddToCart({
  line,
  isAvailable,
}: {
  line?: OptimisticCartLineInput;
  isAvailable: boolean;
}) {
  const {t} = useTranslation();
  const cartPath = usePrefixPathWithLocale('/cart');
  if (!line) {
    return (
      <button className="zpd-buy__submit" type="button" disabled>
        {t('product.unavailable')}
      </button>
    );
  }

  return (
    <CartForm
      route={cartPath}
      inputs={{lines: [line]}}
      action={CartForm.ACTIONS.LinesAdd}
    >
      {(fetcher: FetcherWithComponents<unknown>) => (
        <ZubehorCartSubmit
          fetcher={fetcher}
          disabled={!isAvailable}
          isAvailable={isAvailable}
        />
      )}
    </CartForm>
  );
}

export default function ZubehorProductLayout({
  product,
}: ZubehorProductLayoutProps) {
  const {locale, t} = useTranslation();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );
  const [requestedImage, setRequestedImage] = useState<ProductImageNode | null>(
    selectedVariant?.image ?? null,
  );
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });
  const visibleOptions = productOptions.filter(
    (option) => option.optionValues.length > 1,
  );
  const productInfoContent = renderProductInfo(product.productInfo, locale);
  const isAvailable = Boolean(selectedVariant?.availableForSale);
  const compareAtPrice =
    selectedVariant?.compareAtPrice &&
    Number(selectedVariant.compareAtPrice.amount) >
      Number(selectedVariant.price.amount)
      ? selectedVariant.compareAtPrice
      : null;
  const totalPrice = selectedVariant
    ? {
        ...selectedVariant.price,
        amount: (Number(selectedVariant.price.amount) * quantity).toFixed(2),
      }
    : undefined;
  const totalCompareAtPrice = compareAtPrice
    ? {
        ...compareAtPrice,
        amount: (Number(compareAtPrice.amount) * quantity).toFixed(2),
      }
    : null;
  const images = useMemo(() => {
    const galleryImages: ProductImageNode[] = [];

    product.images.edges.forEach(({node}) =>
      addUniqueImage(galleryImages, node),
    );
    product.options.forEach((option) => {
      option.optionValues.forEach((value) => {
        addUniqueImage(galleryImages, value.firstSelectableVariant?.image);
      });
    });
    addUniqueImage(galleryImages, selectedVariant?.image);
    addUniqueImage(galleryImages, requestedImage);

    return galleryImages;
  }, [
    product.images.edges,
    product.options,
    requestedImage,
    selectedVariant?.image,
  ]);

  useEffect(() => {
    setQuantity(1);
    setRequestedImage(product.selectedOrFirstAvailableVariant?.image ?? null);
  }, [product.id, product.selectedOrFirstAvailableVariant?.image]);

  useEffect(() => {
    if (selectedVariant?.image) setRequestedImage(selectedVariant.image);
  }, [selectedVariant?.id, selectedVariant?.image]);

  const changeQuantity = (nextQuantity: number) => {
    if (!Number.isFinite(nextQuantity)) return;
    setQuantity(Math.max(1, Math.floor(nextQuantity)));
  };

  const cartLine: OptimisticCartLineInput | undefined = selectedVariant
    ? {
        merchandiseId: selectedVariant.id,
        quantity,
        selectedVariant,
      }
    : undefined;

  return (
    <main className="zpd">
      <div className="zpd__shell">
        <nav className="zpd-breadcrumb" aria-label={t('product.accessories')}>
          <Link to="/collections/zubehor">
            <ArrowIcon direction="left" />
            <span>{t('product.backToAccessories')}</span>
          </Link>
        </nav>

        <div className="zpd__product">
          <ZubehorProductGallery
            images={images}
            preferredImageKey={getImageKey(
              requestedImage ?? selectedVariant?.image,
            )}
            productId={product.id}
            productTitle={product.title}
          />

          <section className="zpd-purchase" aria-labelledby="zpd-title">
            <p className="zpd-purchase__eyebrow">
              {t('product.accessories')}
            </p>
            <h1 id="zpd-title">{product.title}</h1>
            {selectedVariant?.sku ? (
              <p className="zpd-purchase__sku">
                Art.-Nr. {selectedVariant.sku}
              </p>
            ) : null}

            <div className="zpd-price">
              <ProductPrice
                price={totalPrice}
                compareAtPrice={totalCompareAtPrice}
              />
              {quantity > 1 && selectedVariant ? (
                <p className="zpd-price__breakdown">
                  {quantity} × <Money data={selectedVariant.price} />{' '}
                  {t('product.perItem')}
                </p>
              ) : null}
            </div>

            {visibleOptions.length ? (
              <div className="zpd-options">
                {visibleOptions.map((option) => (
                  <fieldset className="zpd-option" key={option.name}>
                    <legend>{option.name}</legend>
                    <div className="zpd-option__values">
                      {option.optionValues.map((value) => {
                        const {
                          name,
                          handle,
                          variantUriQuery,
                          selected,
                          exists,
                          available,
                          isDifferentProduct,
                          swatch,
                          variant,
                          firstSelectableVariant,
                        } = value;
                        const variantImage =
                          variant?.image ?? firstSelectableVariant?.image;
                        const swatchImage = swatch?.image?.previewImage?.url;
                        const hasVisual = Boolean(
                          variantImage || swatchImage || swatch?.color,
                        );
                        const className = [
                          'zpd-option-card',
                          selected ? 'is-selected' : '',
                          !available ? 'is-unavailable' : '',
                          hasVisual ? 'has-visual' : 'is-text-only',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        const content = (
                          <>
                            {variantImage ? (
                              <span className="zpd-option-card__visual">
                                <Image
                                  data={variantImage}
                                  alt=""
                                  className="zpd-option-card__image"
                                  sizes="54px"
                                  loading="lazy"
                                />
                              </span>
                            ) : hasVisual ? (
                              <span
                                className="zpd-option-card__swatch"
                                style={{
                                  backgroundColor: swatch?.color ?? undefined,
                                }}
                                aria-hidden="true"
                              >
                                {swatchImage ? (
                                  <img src={swatchImage} alt="" />
                                ) : null}
                              </span>
                            ) : null}

                            <span className="zpd-option-card__copy">
                              <strong>{name}</strong>
                              {!available ? (
                                <small>{t('product.unavailable')}</small>
                              ) : null}
                            </span>

                            <span className="zpd-option-card__check">
                              <CheckIcon />
                            </span>
                          </>
                        );

                        if (isDifferentProduct) {
                          return (
                            <Link
                              key={name}
                              className={className}
                              to={`/products/${handle}?${variantUriQuery}`}
                              replace
                              preventScrollReset
                              aria-current={selected ? 'true' : undefined}
                            >
                              {content}
                            </Link>
                          );
                        }

                        return (
                          <button
                            key={name}
                            type="button"
                            className={className}
                            disabled={!exists}
                            aria-pressed={selected}
                            onClick={() => {
                              if (variantImage) setRequestedImage(variantImage);
                              if (selected) return;

                              void navigate(`?${variantUriQuery}`, {
                                replace: true,
                                preventScrollReset: true,
                              });
                            }}
                          >
                            {content}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            ) : null}

            <div className="zpd-buy">
              <p
                className={`zpd-buy__availability${
                  isAvailable ? ' is-available' : ' is-unavailable'
                }`}
              >
                <span aria-hidden="true" />
                {isAvailable
                  ? t('product.inStock')
                  : t('product.currentlyUnavailable')}
              </p>

              <div className="zpd-buy__controls">
                <div className="zpd-quantity">
                  <span className="zpd-quantity__label">
                    {t('product.quantity')}
                  </span>
                  <div className="zpd-quantity__control">
                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label={t('product.decreaseQuantity')}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event) =>
                        changeQuantity(Number(event.target.value))
                      }
                      aria-label={t('product.quantity')}
                    />
                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity + 1)}
                      aria-label={t('product.increaseQuantity')}
                    >
                      +
                    </button>
                  </div>
                </div>

                <ZubehorAddToCart line={cartLine} isAvailable={isAvailable} />
              </div>
            </div>
          </section>
        </div>

        {product.descriptionHtml || productInfoContent ? (
          <div className="zpd-details">
            {product.descriptionHtml ? (
              <section className="zpd-details__section">
                <h2>{t('product.description')}</h2>
                <div
                  className="zpd-details__content"
                  dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
                />
              </section>
            ) : null}

            {productInfoContent ? (
              <section className="zpd-details__section">
                <h2>{t('product.information')}</h2>
                <div className="zpd-details__content">{productInfoContent}</div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
