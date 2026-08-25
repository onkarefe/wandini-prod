export type WishlistActionData = {
  ok: boolean;
  errorCode?: 'LOGIN_REQUIRED' | 'UPDATE_UNAVAILABLE';
  loginUrl?: string;
  message?: string;
  wishlistCount?: number;
  wishlisted?: boolean;
};
