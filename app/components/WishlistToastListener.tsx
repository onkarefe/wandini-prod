import {useEffect, useRef} from 'react';
import {useFetchers} from 'react-router';
import type {WishlistActionData} from '~/lib/wishlist';
import {showWishlistSuccessToast} from '~/lib/wishlist-toast';
import {useTranslation} from '~/i18n/useTranslation';

export function WishlistToastListener() {
  const {t} = useTranslation();
  const fetchers = useFetchers();
  const handledResponsesRef = useRef(new WeakSet<object>());

  useEffect(() => {
    for (const fetcher of fetchers) {
      if (!fetcher.formAction?.endsWith('/api/wishlist')) continue;

      const data = fetcher.data as WishlistActionData | undefined;
      if (!data || typeof data !== 'object') continue;
      if (handledResponsesRef.current.has(data)) continue;

      handledResponsesRef.current.add(data);

      if (!data.ok || typeof data.wishlisted !== 'boolean') continue;

      showWishlistSuccessToast(
        data.wishlisted ? t('wishlist.added') : t('wishlist.removed'),
      );
    }
  }, [fetchers, t]);

  return null;
}
