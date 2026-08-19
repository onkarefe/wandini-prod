import {toast} from 'sonner';

export function showWishlistSuccessToast(
  wishlisted: boolean,
  productTitle: string,
) {
  toast.success(
    wishlisted
      ? 'Produkt wurde zu den Favoriten hinzugefügt.'
      : 'Produkt wurde aus den Favoriten entfernt.',
    {description: productTitle},
  );
}
