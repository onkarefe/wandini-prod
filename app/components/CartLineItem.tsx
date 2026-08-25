import type {
  CartLineUpdateInput,
  MoneyV2,
} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Image, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {ProductPrice} from './ProductPrice';
import {useAside} from './Aside';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {
  getCartLineDisplayTotal,
  type CartLinePricingLike,
} from '~/lib/cart-pricing';

type CartLine = OptimisticCartLine<CartApiQueryFragment>;

/**
 * A single line item in the cart. It displays the product image, title, price.
 * It also provides controls to update the quantity or remove the line item.
 */
export function CartLineItem({
  layout,
  line,
}: {
  layout: CartLayout;
  line: CartLine;
}) {
  const {id, merchandise} = line;
  const {product, title, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const displayPrice = getCartLineDisplayTotal(
    line as unknown as CartLinePricingLike,
  );

  return (
    <li key={id} className={`custom-cart-line custom-cart-line--${layout}`}>
      <div className="customCartLineImgBox">
        {image && (
          <Image
            alt={title}
            className="custom-cartLineImg"
            data={image}
            loading="lazy"
          />
        )}
      </div>

      <div className="customCartDataBox">
        <Link
          prefetch="intent"
          to={lineItemUrl}
          onClick={() => {
            if (layout === 'aside') {
              close();
            }
          }}
        >
          <p>
            <strong>{product.title}</strong>
          </p>
        </Link>
        <ProductPrice
          price={(displayPrice ?? undefined) as MoneyV2 | undefined}
        />
        <ul className="custom-cart-line__options">
          {selectedOptions.map((option) => (
            <li key={option.name}>
              <small>
                {option.name}: {option.value}
              </small>
            </li>
          ))}
        </ul>
        <CartLineRemove line={line} />
      </div>
    </li>
  );
}

/**
 * Provides the controls to update the quantity of a line item in the cart.
 * These controls are disabled when the line item is new, and the server
 * hasn't yet responded that it was successfully added to the cart.
 */

// quantitiy içeren defoul fonksiyon bunu kullanmıyoruz
// function CartLineQuantity({line}: {line: CartLine}) {
//   if (!line || typeof line?.quantity === 'undefined') return null;
//   const {id: lineId, quantity, isOptimistic} = line;
//   const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
//   const nextQuantity = Number((quantity + 1).toFixed(0));

//   return (
//     <div className="cart-line-quantity">
//       <small>Quantity: {quantity} &nbsp;&nbsp;</small>
//       <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
//         <button
//           aria-label="Decrease quantity"
//           disabled={quantity <= 1 || !!isOptimistic}
//           name="decrease-quantity"
//           value={prevQuantity}
//         >
//           <span>&#8722; </span>
//         </button>
//       </CartLineUpdateButton>
//       &nbsp;
//       <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
//         <button
//           aria-label="Increase quantity"
//           name="increase-quantity"
//           value={nextQuantity}
//           disabled={!!isOptimistic}
//         >
//           <span>&#43;</span>
//         </button>
//       </CartLineUpdateButton>
//       &nbsp;
//       <CartLineRemoveButton lineIds={[lineId]} disabled={!!isOptimistic} />
//     </div>
//   );
// }

function CartLineRemove({line}: {line: CartLine}) {
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;

  return (
    <div className="custom-cart-line-remove">
      <CartLineRemoveButton lineIds={[lineId]} disabled={!!isOptimistic} />
    </div>
  );
}

/**
 * A button that removes a line item from the cart. It is disabled
 * when the line item is new, and the server hasn't yet responded
 * that it was successfully added to the cart.
 */
function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  const {t} = useTranslation();
  const cartPath = usePrefixPathWithLocale('/cart');

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartPath}
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        className="aside-itemRemove"
        disabled={disabled}
        type="submit"
        aria-label={t('cart.removeItem')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
          <path d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z" />
        </svg>
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);
  const cartPath = usePrefixPathWithLocale('/cart');

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartPath}
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

/**
 * Returns a unique key for the update action. This is used to make sure actions modifying the same line
 * items are not run concurrently, but cancel each other. For example, if the user clicks "Increase quantity"
 * and "Decrease quantity" in rapid succession, the actions will cancel each other and only the last one will run.
 * @param lineIds - line ids affected by the update
 * @returns
 */
function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
