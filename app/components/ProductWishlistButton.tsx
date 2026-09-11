import {useEffect, useState} from 'react';
import {useFetcher, useLocation} from 'react-router';
import {useTranslation} from '~/i18n/useTranslation';
import {usePrefixPathWithLocale} from '~/lib/i18n-router';
import type {WishlistActionData} from '~/lib/wishlist';

type ProductWishlistButtonProps = {
  productId: string;
  productTitle: string;
  isLoggedIn: boolean;
  isWishlisted: boolean;
  wishlistStatus: 'ready' | 'unavailable';
};

function HeartIcon({filled}: {filled: boolean}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

export function ProductWishlistButton({
  productId,
  productTitle,
  isLoggedIn,
  isWishlisted,
  wishlistStatus,
}: ProductWishlistButtonProps) {
  const {t} = useTranslation();
  const fetcher = useFetcher<WishlistActionData>();
  const location = useLocation();
  const loginPath = usePrefixPathWithLocale('/account/login');
  const fetcherLoginUrl = usePrefixPathWithLocale(fetcher.data?.loginUrl ?? '');
  const [wishlisted, setWishlisted] = useState(isWishlisted);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const [stateUnavailable, setStateUnavailable] = useState(
    wishlistStatus === 'unavailable',
  );

  useEffect(() => {
    setWishlisted(isWishlisted);
    setWishlistError(null);
    setStateUnavailable(wishlistStatus === 'unavailable');
  }, [isWishlisted, productId, wishlistStatus]);

  useEffect(() => {
    if (!fetcherLoginUrl) return;
    window.location.href = fetcherLoginUrl;
  }, [fetcherLoginUrl]);

  useEffect(() => {
    if (!fetcher.data) return;

    if (!fetcher.data.ok) {
      if (!fetcher.data.loginUrl) {
        setWishlistError(t('wishlist.updateUnavailable'));
      }
      return;
    }

    if (typeof fetcher.data.wishlisted !== 'boolean') return;

    setWishlisted(fetcher.data.wishlisted);
    setWishlistError(null);
    setStateUnavailable(false);
  }, [fetcher.data, t]);

  const isPending = fetcher.state !== 'idle';
  const buttonLabel = isPending
    ? t('product.wishlistUpdating')
    : wishlisted
      ? t('product.wishlistRemove')
      : t('product.wishlistAdd');
  const feedback = wishlistError
    ? wishlistError
    : stateUnavailable
      ? t('wishlist.loadUnavailable')
      : null;

  const handleClick = () => {
    setWishlistError(null);

    if (!isLoggedIn) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      window.location.href = `${loginPath}?return_to=${encodeURIComponent(returnTo)}`;
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('productTitle', productTitle);
    formData.set('desiredWishlisted', String(!wishlisted));
    void fetcher.submit(formData, {
      method: 'post',
      action: '/api/wishlist',
    });
  };

  return (
    <div className="product-detail-wishlist">
      <button
        type="button"
        className={`product-detail-wishlist__button${wishlisted ? ' is-active' : ''}`}
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={wishlisted}
        aria-busy={isPending}
      >
        <HeartIcon filled={wishlisted} />
        <span>{buttonLabel}</span>
      </button>
      {feedback ? (
        <p className="product-detail-wishlist__feedback" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
