import {useEffect, useRef} from 'react';
import { type FetcherWithComponents } from 'react-router';
import { CartForm, type OptimisticCartLineInput } from '@shopify/hydrogen';

export function AddToCartButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
  onSuccess,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
  onSuccess?: () => void;
}) {
  return (
    <CartForm route="/cart" inputs={{ lines }} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<any>) => (
        <AddToCartSubmitButton fetcher={fetcher} onSuccess={onSuccess}>
          <input
            name="analytics"
            type="hidden"
            value={JSON.stringify(analytics)}
          />
          <div className="customAddToCartButtonWrapper">
            <button
              type="submit"
              className="customAddToCartButton"
              onClick={onClick}
              disabled={Boolean(disabled) || fetcher.state !== 'idle'}
            >
              {children}
            </button>
          </div>
        </AddToCartSubmitButton>
      )}
    </CartForm>
  );
}

function AddToCartSubmitButton({
  children,
  fetcher,
  onSuccess,
}: {
  children: React.ReactNode;
  fetcher: FetcherWithComponents<any>;
  onSuccess?: () => void;
}) {
  const previousState = useRef(fetcher.state);

  useEffect(() => {
    if (previousState.current !== 'idle' && fetcher.state === 'idle') {
      if (isSuccessfulCartMutation(fetcher.data)) onSuccess?.();
    }
    previousState.current = fetcher.state;
  }, [fetcher.data, fetcher.state, onSuccess]);

  return children;
}

export function isSuccessfulCartMutation(data: unknown) {
  if (!data || typeof data !== 'object') return false;
  const result = data as {cart?: unknown; errors?: unknown};
  const hasErrors = Array.isArray(result.errors)
    ? result.errors.length > 0
    : Boolean(result.errors);
  return Boolean(result.cart) && !hasErrors;
}
