import { useOptimisticCart } from '@shopify/hydrogen';
import { Link } from 'react-router';
import type { CartApiQueryFragment } from 'storefrontapi.generated';
import { useAside } from '~/components/Aside';
import { CartLineItem } from '~/components/CartLineItem';

export type CartLayout = 'page' | 'aside';

export type CustomCartProps = {
    cart: CartApiQueryFragment | null;
    layout: CartLayout;
};

/**
 * Cart component used by the /cart page route.
 */
export function CustomCart({ layout, cart: originalCart }: CustomCartProps) {
    // The useOptimisticCart hook applies pending actions to the cart
    // so the user immediately sees feedback when they modify the cart.
    const cart = useOptimisticCart(originalCart);

    const linesCount = Boolean(cart?.lines?.nodes?.length || 0);
    const withDiscount =
        cart &&
        Boolean(cart?.discountCodes?.filter((code) => code.applicable)?.length);
    // bu satır eski aside dönem için bunu aç
    // const className = `cart-main ${withDiscount ? 'with-discount' : ''}`;
    const className = `custom-cart-main ${withDiscount ? 'with-discount' : ''}`;
    return (
        <div className={className}>
            <CartEmpty hidden={linesCount} layout={layout} />
            <div className="cart-details">
                <div aria-labelledby="cart-lines">
                    <ul>
                        {(cart?.lines?.nodes ?? []).map((line) => (
                            <CartLineItem key={line.id} line={line} layout={layout} />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

function CartEmpty({
    hidden = false,
}: {
    hidden: boolean;
    layout?: CustomCartProps['layout'];
}) {
    const { close } = useAside();
    return (
        <div hidden={hidden}>
            <br />
            <p>
                efe Looks like you haven&rsquo;t added anything yet, let&rsquo;s get you
                started!
            </p>
            <br />
            <Link to="/collections" onClick={close} prefetch="viewport">
                Continue shopping →
            </Link>
        </div>
    );
}
