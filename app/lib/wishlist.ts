export const WISHLIST_UPDATE_UNAVAILABLE_MESSAGE =
  'Diese Aktion kann derzeit nicht ausgef\u00fchrt werden. Bitte versuchen Sie es sp\u00e4ter erneut.';

export const WISHLIST_LOAD_UNAVAILABLE_MESSAGE =
  'Ihre Favoriten k\u00f6nnen derzeit nicht geladen werden. Bitte versuchen Sie es sp\u00e4ter erneut.';

export type WishlistActionData = {
  ok: boolean;
  loginUrl?: string;
  message?: string;
  wishlistCount?: number;
  wishlisted?: boolean;
};
