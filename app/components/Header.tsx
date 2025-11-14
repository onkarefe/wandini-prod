import { Suspense } from 'react';
import { Await, NavLink, useAsyncValue } from 'react-router';
import {
  type CartViewPayload,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import type { HeaderQuery, CartApiQueryFragment } from 'storefrontapi.generated';
import { useAside } from '~/components/Aside';

interface HeaderProps {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
}

type Viewport = 'desktop' | 'mobile';

export function Header({
  header,
  isLoggedIn,
  cart,
  publicStoreDomain,
}: HeaderProps) {
  const { shop, menu } = header;
  return (
    <header className="header headerCustom">
      <NavLink prefetch="intent" to="/" style={activeLinkStyle} end>
        {shop.brand?.logo?.image?.url && (
          <img
            src={shop.brand.logo.image.url}
            alt={shop.name}
            className="headerLogo"
          />
        )}
      </NavLink>
      <HeaderMenu
        menu={menu}
        viewport="desktop"
        primaryDomainUrl={header.shop.primaryDomain.url}
        publicStoreDomain={publicStoreDomain}
      />
      <HeaderCtas isLoggedIn={isLoggedIn} cart={cart} />
    </header>
  );
}

export function HeaderMenu({
  menu,
  primaryDomainUrl,
  viewport,
  publicStoreDomain,
}: {
  menu: HeaderProps['header']['menu'];
  primaryDomainUrl: HeaderProps['header']['shop']['primaryDomain']['url'];
  viewport: Viewport;
  publicStoreDomain: HeaderProps['publicStoreDomain'];
}) {
  const className = `header-menu-${viewport}`;
  const { close } = useAside();

  return (
    <nav className={className} role="navigation">
      {(menu || FALLBACK_HEADER_MENU).items.map((item) => {
        const linkUrl = normalizeMenuUrl(
          item.url,
          publicStoreDomain,
          primaryDomainUrl,
        );

        return (
          <div
            key={item.id}
            className={
              item.items && item.items.length > 0
                ? 'menu-item-with-sub group'
                : 'menu-item'
            }
          >
            <NavLink
              className="header-menu-item"
              end
              onClick={close}
              prefetch="intent"
              to={linkUrl}
            >
              {item.title}
              {item.items && item.items.length > 0 && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="size-6 inline-block ml-1 headerChevron"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m19.5 8.25-7.5 7.5-7.5-7.5"
                  />
                </svg>
              )}
            </NavLink>
            {item.items && item.items.length > 0 && (
              <ul className="submenu">
                {item.items.map((subItem) => {
                  const subLinkUrl = normalizeMenuUrl(
                    subItem.url,
                    publicStoreDomain,
                    primaryDomainUrl,
                  );

                  return (
                    <li key={subItem.id}>
                      <NavLink
                        className="header-submenu-item"
                        to={subLinkUrl}
                        prefetch="intent"
                      >
                        {subItem.title}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function HeaderCtas({
  isLoggedIn,
  cart,
}: Pick<HeaderProps, 'isLoggedIn' | 'cart'>) {
  return (
    <nav className="header-ctas" role="navigation">
      <HeaderMenuMobileToggle />
      <NavLink prefetch="intent" to="/account" style={activeLinkStyle}>
        <Suspense fallback="Sign in">
          <Await resolve={isLoggedIn} errorElement="Sign in">
            {(isLoggedIn) => (isLoggedIn ? 'Account' : 'Sign in')}
          </Await>
        </Suspense>
      </NavLink>
      <SearchToggle />
      <CartToggle cart={cart} />
    </nav>
  );
}

function HeaderMenuMobileToggle() {
  const { open } = useAside();
  return (
    <button
      className="header-menu-mobile-toggle reset"
      onClick={() => open('mobile')}
    >
      <h3>☰</h3>
    </button>
  );
}

function SearchToggle() {
  const { open } = useAside();
  return (
    <button className="reset" onClick={() => open('search')}>
      Search
    </button>
  );
}

function CartBadge({ count }: { count: number | null }) {
  const { open } = useAside();
  const { publish, shop, cart, prevCart } = useAnalytics();

  return (
    <a
      href="/cart"
      onClick={(e) => {
        e.preventDefault();
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: typeof window !== 'undefined' ? window.location.href || '' : '',
        } as CartViewPayload);
      }}
    >
      Cart {count === null ? <span>&nbsp;</span> : count}
    </a>
  );
}

function CartToggle({ cart }: Pick<HeaderProps, 'cart'>) {
  return (
    <Suspense fallback={<CartBadge count={null} />}>
      <Await resolve={cart}>
        <CartBanner />
      </Await>
    </Suspense>
  );
}

function CartBanner() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return <CartBadge count={cart?.totalQuantity ?? 0} />;
}

const FALLBACK_HEADER_MENU = {
  id: 'gid://shopify/Menu/199655587896',
  items: [
    {
      id: 'gid://shopify/MenuItem/461609500728',
      resourceId: null,
      tags: [],
      title: 'Collections',
      type: 'HTTP',
      url: '/collections',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609533496',
      resourceId: null,
      tags: [],
      title: 'Blog',
      type: 'HTTP',
      url: '/blogs/journal',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609566264',
      resourceId: null,
      tags: [],
      title: 'Policies',
      type: 'HTTP',
      url: '/policies',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609599032',
      resourceId: 'gid://shopify/Page/92591030328',
      tags: [],
      title: 'About',
      type: 'PAGE',
      url: '/pages/about',
      items: [],
    },
  ],
};

function activeLinkStyle({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) {
  return {
    fontWeight: isActive ? 'bold' : undefined,
    color: isPending ? 'grey' : 'black',
  };
}

/**
 * Menü URL'lerini normalize eder:
 * - myshopify.com veya primary domain ise sadece path + query + hash döner
 * - Dış domain ise aynen bırakır
 * Böylece her zaman kendi Hydrogen domaininde kalırsın (efeonkar-test.com).
 */
function normalizeMenuUrl(
  rawUrl: string | null,
  publicStoreDomain: string,
  primaryDomainUrl: string,
) {
  if (!rawUrl) return '/';

  try {
    const primary = new URL(primaryDomainUrl);
    const primaryHost = primary.hostname;

    // publicStoreDomain "3tzgtt-7y.myshopify.com" gibi geliyor
    const publicHost = publicStoreDomain;

    // rawUrl absolute veya relative olabilir
    const base = `https://${publicHost}`;
    const url = new URL(rawUrl, base);

    const host = url.hostname;

    const isShopifyDomain =
      host === primaryHost ||
      host === publicHost ||
      host.endsWith('.myshopify.com');

    if (isShopifyDomain) {
      // Sadece path + query + hash dön → /collections/... gibi
      return url.pathname + url.search + url.hash;
    }

    // Dış domain ise dokunma
    return rawUrl;
  } catch {
    // Parse edilemezse (zaten relative path vs.), olduğu gibi kullan
    return rawUrl;
  }
}
