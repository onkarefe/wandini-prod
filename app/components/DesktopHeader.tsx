import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  type CartViewPayload,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import {Await, useAsyncValue} from 'react-router';
import type {CartApiQueryFragment, HeaderQuery} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {
  SEARCH_ENDPOINT,
  SearchFormPredictive,
} from '~/components/SearchFormPredictive';
import {SearchResultsPredictive} from '~/components/SearchResultsPredictive';
import {Link, NavLink, usePrefixPathWithLocale} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

type FieldRecord = {
  key?: string | null;
  value?: string | null;
  reference?: unknown;
  references?: {nodes: unknown[]} | null;
};

type FieldContainer = {fields?: FieldRecord[] | null};
type CollectionReference = {handle?: string | null};
type MegaMenuNode = HeaderQuery['megaMenus']['nodes'][number];
type MenuItem = NonNullable<HeaderQuery['menu']>['items'][number];
type NavigationItem = MenuItem & {_href: string};
type ResolvedNavigationItem = {
  item: NavigationItem;
  key: string;
  mega: MegaMenuNode | null;
};

type DesktopHeaderProps = {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  publicStoreDomain: string;
};

function field(node: FieldContainer | null | undefined, key: string) {
  return node?.fields?.find((item) => item?.key === key) ?? null;
}

function value(node: FieldContainer | null | undefined, key: string) {
  const fieldValue = field(node, key)?.value;
  return typeof fieldValue === 'string' ? fieldValue : null;
}

function reference<T>(node: FieldContainer | null | undefined, key: string) {
  return (field(node, key)?.reference as T | null | undefined) ?? null;
}

function references<T>(node: FieldContainer | null | undefined, key: string) {
  const nodes = field(node, key)?.references?.nodes;
  return Array.isArray(nodes) ? (nodes as T[]) : [];
}

function collectionHandle(path: string) {
  try {
    const parts = new URL(path, 'https://wandini.local').pathname
      .split('/')
      .filter(Boolean);
    return parts[0] === 'collections' ? (parts[1] ?? null) : null;
  } catch {
    return null;
  }
}

function handleLike(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function filterUrl(handle: string, taxonomyValueGid: string) {
  const filter = {
    taxonomyMetafield: {
      namespace: 'shopify',
      key: 'color-pattern',
      value: taxonomyValueGid,
    },
  };

  return `/collections/${handle}?f=${encodeURIComponent(JSON.stringify(filter))}`;
}

function megaItemUrl(item: FieldContainer, baseHandle: string) {
  const action = value(item, 'action_type') ?? '';

  if (action === 'collection') {
    const collection = reference<CollectionReference>(item, 'collection');
    if (collection?.handle) return `/collections/${collection.handle}`;
  }

  if (action === 'filter_preset') {
    const preset = reference<FieldContainer>(item, 'filter_preset');
    const taxonomyValueGid = value(preset, 'taxonomy_value_gid');
    if (taxonomyValueGid) return filterUrl(baseHandle, taxonomyValueGid);
  }

  if (action === 'sort_preset') {
    const preset = reference<FieldContainer>(item, 'sort_preset');
    const sortValue = value(preset, 'sort_value');
    if (sortValue) {
      return `/collections/${baseHandle}?sort=${encodeURIComponent(sortValue)}`;
    }
  }

  return `/collections/${baseHandle}`;
}

export function DesktopHeader({
  header,
  cart,
  publicStoreDomain,
}: DesktopHeaderProps) {
  const {t} = useTranslation();
  const {shop} = header;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOpenKey, setMobileOpenKey] = useState<string | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const banner =
    header.headerBanners.nodes[0]?.fields
      .find((item) => item.value?.trim())
      ?.value?.trim() ?? '';

  const normalizeUrl = useCallback(
    (rawUrl: string | null) => {
      if (!rawUrl) return '/';

      try {
        const url = new URL(rawUrl, `https://${publicStoreDomain}`);
        const primaryHost = shop.primaryDomain?.url
          ? new URL(shop.primaryDomain.url).hostname
          : null;
        const isInternal =
          !primaryHost ||
          url.hostname === primaryHost ||
          url.hostname === publicStoreDomain ||
          url.hostname.endsWith('.myshopify.com');

        return isInternal ? `${url.pathname}${url.search}${url.hash}` : rawUrl;
      } catch {
        return rawUrl;
      }
    },
    [publicStoreDomain, shop.primaryDomain?.url],
  );

  const navigation = useMemo<NavigationItem[]>(
    () =>
      (header.menu?.items ?? []).map((item) => ({
        ...item,
        _href: normalizeUrl(item.url ?? null),
      })),
    [header.menu?.items, normalizeUrl],
  );

  const megaMenus = useMemo(() => {
    const menuMap = new Map<string, MegaMenuNode>();
    header.megaMenus.nodes.forEach((mega) => {
      const trigger = value(mega, 'trigger_handle');
      if (trigger) menuMap.set(trigger, mega);
    });
    return menuMap;
  }, [header.megaMenus.nodes]);

  const resolvedNavigation = useMemo<ResolvedNavigationItem[]>(
    () =>
      navigation.map((item) => {
        const keys = [
          collectionHandle(item._href),
          handleLike(item.title ?? ''),
        ].filter(Boolean) as string[];
        const mega = keys.map((key) => megaMenus.get(key)).find(Boolean) ?? null;

        return {
          item,
          key: String(item.id || item.title || item._href),
          mega,
        };
      }),
    [megaMenus, navigation],
  );

  const clearIntent = useCallback(() => {
    if (!intentTimer.current) return;
    clearTimeout(intentTimer.current);
    intentTimer.current = null;
  }, []);

  const scheduleOpen = useCallback(
    (key: string) => {
      clearIntent();
      intentTimer.current = setTimeout(() => setOpenMenu(key), 90);
    },
    [clearIntent],
  );

  const scheduleClose = useCallback(
    (key: string) => {
      clearIntent();
      intentTimer.current = setTimeout(() => {
        setOpenMenu((current) => (current === key ? null : current));
      }, 170);
    },
    [clearIntent],
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const menuButton = document.querySelector<HTMLButtonElement>(
        '.dhx-menuToggle[aria-expanded="true"]',
      );
      setOpenMenu(null);
      setMobileMenuOpen(false);
      setMobileOpenKey(null);
      if (menuButton) requestAnimationFrame(() => menuButton.focus());
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      clearIntent();
    };
  }, [clearIntent]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1023.98px)');
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setMobileMenuOpen(false);
      setMobileOpenKey(null);
    };

    desktopQuery.addEventListener('change', closeAtDesktop);
    return () => desktopQuery.removeEventListener('change', closeAtDesktop);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    setMobileOpenKey(null);
  }, []);

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
  }

  return (
    <div className="dhx-header">
      <div className="dhx-topRail">
        <div className="container mx-auto dhx-container dhx-topRailInner">
          <div className="dhx-announcement">
            <p>{banner}</p>
          </div>
          <div className="dhx-futureTrust" aria-hidden="true" />
        </div>
      </div>

      <div className="dhx-commandBar">
        <div className="container mx-auto dhx-container dhx-commandGrid">
          <NavLink
            className="dhx-brand"
            to="/"
            aria-label={t('common.home')}
            onClick={closeMobileMenu}
          >
            {shop.brand?.logo?.image?.url ? (
              <img
                src={shop.brand.logo.image.url}
                alt={shop.name || 'Wandini'}
              />
            ) : (
              <span>{shop.name || 'Wandini'}</span>
            )}
          </NavLink>

          <DesktopSearch
            forceClosed={mobileMenuOpen}
            onEngage={closeMobileMenu}
          />
          <DesktopActions
            cart={cart}
            isMenuOpen={mobileMenuOpen}
            onNavigate={closeMobileMenu}
            onMenuToggle={() => {
              setOpenMenu(null);
              setMobileMenuOpen((current) => !current);
            }}
          />
        </div>
      </div>

      <div className="dhx-navigationRail">
        <div className="container mx-auto dhx-container dhx-navigationInner">
          <nav className="dhx-navigation" aria-label={t('navigation.primary')}>
            {resolvedNavigation.map(({item, key, mega}) => {
              const isOpen = openMenu === key;

              return (
                <div
                  className="dhx-navigationItem"
                  key={key}
                  onBlur={closeWhenFocusLeaves}
                  onFocus={() => mega && setOpenMenu(key)}
                  onMouseEnter={() => mega && scheduleOpen(key)}
                  onMouseLeave={() => mega && scheduleClose(key)}
                >
                  <NavLink
                    className={({isActive}) =>
                      `dhx-navigationLink${isActive ? ' is-active' : ''}`
                    }
                    to={item._href}
                    aria-expanded={mega ? isOpen : undefined}
                    onClick={() => setOpenMenu(null)}
                  >
                    <span>{item.title || t('navigation.link')}</span>
                    {mega ? <DownIcon /> : null}
                  </NavLink>

                  {mega && isOpen ? (
                    <DesktopMegaMenu
                      mega={mega}
                      onNavigate={() => setOpenMenu(null)}
                    />
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      {mobileMenuOpen ? (
        <MobileNavigation
          items={resolvedNavigation}
          openKey={mobileOpenKey}
          onNavigate={closeMobileMenu}
          onToggle={(key) =>
            setMobileOpenKey((current) => (current === key ? null : key))
          }
        />
      ) : null}
    </div>
  );
}

function MobileNavigation({
  items,
  openKey,
  onNavigate,
  onToggle,
}: {
  items: ResolvedNavigationItem[];
  openKey: string | null;
  onNavigate: () => void;
  onToggle: (key: string) => void;
}) {
  const {t} = useTranslation();
  return (
    <div className="dhx-mobileMenu" id="dhx-mobile-navigation">
      <nav
        className="container mx-auto dhx-container dhx-mobileNavigation"
        aria-label={t('navigation.mobile')}
      >
        {items.map(({item, key, mega}) => {
          const isOpen = openKey === key;
          const submenuId = 'dhx-mobile-submenu-' + handleLike(key);

          return (
            <div className="dhx-mobileItem" key={key}>
              <div className="dhx-mobileItemRow">
                <NavLink
                  className={({isActive}) =>
                    'dhx-mobileLink' + (isActive ? ' is-active' : '')
                  }
                  to={item._href}
                  onClick={onNavigate}
                >
                  {item.title || t('navigation.link')}
                </NavLink>

                {mega ? (
                  <button
                    className="dhx-mobileExpand"
                    type="button"
                    aria-controls={submenuId}
                    aria-expanded={isOpen}
                    aria-label={t('navigation.submenu', {
                      label: item.title || t('navigation.menu'),
                    })}
                    onClick={() => onToggle(key)}
                  >
                    <DownIcon />
                  </button>
                ) : null}
              </div>

              {mega && isOpen ? (
                <MobileMegaMenu
                  id={submenuId}
                  mega={mega}
                  onNavigate={onNavigate}
                />
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function MobileMegaMenu({
  id,
  mega,
  onNavigate,
}: {
  id: string;
  mega: MegaMenuNode;
  onNavigate: () => void;
}) {
  const baseCollection = reference<CollectionReference>(
    mega,
    'base_collection',
  );
  const columns = references<FieldContainer & {id?: string | null}>(
    mega,
    'columns',
  );

  if (!baseCollection?.handle || columns.length === 0) return null;
  const baseHandle = baseCollection.handle;

  return (
    <div className="dhx-mobileSubmenu" id={id}>
      {columns.map((column) => {
        const columnTitle = value(column, 'title') ?? '';
        const columnItems = references<FieldContainer & {id?: string | null}>(
          column,
          'items',
        );

        return (
          <section
            className="dhx-mobileColumn"
            key={column.id || columnTitle}
          >
            {columnTitle ? <h3>{columnTitle}</h3> : null}
            <ul>
              {columnItems.map((columnItem) => {
                const label = value(columnItem, 'label') ?? '';

                return (
                  <li key={columnItem.id || label}>
                    <NavLink
                      to={megaItemUrl(columnItem, baseHandle)}
                      onClick={onNavigate}
                    >
                      <span>{label}</span>
                      <ArrowIcon />
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DesktopSearch({
  forceClosed,
  onEngage,
}: {
  forceClosed: boolean;
  onEngage: () => void;
}) {
  const {t} = useTranslation();
  const datalistId = useId();
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!forceClosed) return;
    close();
    searchRef.current?.querySelector('input')?.blur();
  }, [close, forceClosed]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) close();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
      searchRef.current?.querySelector('input')?.blur();
    }

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [close, isOpen]);

  function enterResults(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'ArrowDown') return;
    const firstResult = searchRef.current?.querySelector<HTMLAnchorElement>(
      '.dhx-results a[href]',
    );
    if (!firstResult) return;
    event.preventDefault();
    firstResult.focus();
  }

  return (
    <div className="dhx-search" ref={searchRef}>
      <SearchFormPredictive
        className="dhx-searchForm"
        fetcherKey="desktop-command-search"
        predictiveLimit={9}
        onKeyDown={enterResults}
        onSearchSubmit={close}
        role="search"
        aria-label={t('search.label')}
      >
        {({fetchResults, inputRef}) => (
          <>
            <SearchIcon />
            <label className="dhx-srOnly" htmlFor="desktop-command-search">
              {t('search.inputLabel')}
            </label>
            <input
              aria-autocomplete="list"
              aria-controls="desktop-command-results"
              aria-expanded={isOpen}
              autoComplete="off"
              data-desktop-command-search="true"
              enterKeyHint="search"
              id="desktop-command-search"
              list={datalistId}
              name="q"
               onChange={(event) => {
                 onEngage();
                 setIsOpen(Boolean(event.currentTarget.value.trim()));
                 fetchResults(event);
               }}
               onFocus={(event) => {
                 onEngage();
                 setIsOpen(Boolean(event.currentTarget.value.trim()));
                 fetchResults(event);
              }}
              placeholder={t('search.placeholder')}
              ref={inputRef}
              role="combobox"
              type="search"
            />
            <button type="submit" aria-label={t('search.submitLabel')}>
              {t('search.submit')}
            </button>
          </>
        )}
      </SearchFormPredictive>

      <SearchResultsPredictive
        fetcherKey="desktop-command-search"
        inputSelector='[data-desktop-command-search="true"]'
        onClose={close}
      >
        {({items, total, term, state, closeSearch}) => {
          if (!isOpen || !term.current) return null;

          const searchUrl = `${SEARCH_ENDPOINT}?${new URLSearchParams({
            q: term.current,
          }).toString()}`;

          return (
            <div
              className="dhx-results"
              id="desktop-command-results"
              aria-label={t('search.suggestions')}
              aria-live="polite"
            >
              <SearchResultsPredictive.Queries
                queries={items.queries}
                queriesDatalistId={datalistId}
              />

              {state !== 'idle' ? (
                <div className="dhx-resultsStatus" role="status">
                  <i aria-hidden="true" />
                  {t('search.searching')}
                </div>
              ) : total ? (
                <div className="dhx-resultsBody">
                  <div className="dhx-productResults">
                    <SearchResultsPredictive.Products
                      products={items.products}
                      closeSearch={closeSearch}
                      term={term}
                    />
                  </div>
                  <div className="dhx-collectionResults">
                    <SearchResultsPredictive.Collections
                      collections={items.collections}
                      closeSearch={closeSearch}
                      term={term}
                    />
                  </div>
                  <Link
                    className="dhx-allResults"
                    onClick={closeSearch}
                    to={searchUrl}
                  >
                    <span>
                      {t('search.allResults', {term: term.current})}
                    </span>
                    <ArrowIcon />
                  </Link>
                </div>
              ) : (
                <SearchResultsPredictive.Empty term={term} />
              )}
            </div>
          );
        }}
      </SearchResultsPredictive>
    </div>
  );
}

function DesktopActions({
  cart,
  isMenuOpen,
  onNavigate,
  onMenuToggle,
}: {
  cart: Promise<CartApiQueryFragment | null>;
  isMenuOpen: boolean;
  onNavigate: () => void;
  onMenuToggle: () => void;
}) {
  const {t} = useTranslation();

  return (
    <nav className="dhx-actions" aria-label={t('navigation.quickActions')}>
      <NavLink
        className="dhx-account"
        to="/account"
        aria-label={t('navigation.account')}
        title={t('navigation.account')}
        onClick={onNavigate}
      >
        <UserIcon />
      </NavLink>
      <NavLink
        className="dhx-saved"
        to="/account/favorites"
        aria-label={t('navigation.favorites')}
        title={t('navigation.favorites')}
        onClick={onNavigate}
      >
        <HeartIcon />
      </NavLink>

      <Suspense fallback={<CartAction count={null} onOpen={onNavigate} />}>
        <Await resolve={cart}>
          <ResolvedCartAction onOpen={onNavigate} />
        </Await>
      </Suspense>
      <button
        className="dhx-menuToggle"
        type="button"
        aria-controls="dhx-mobile-navigation"
        aria-expanded={isMenuOpen}
        aria-label={
          isMenuOpen ? t('navigation.closeMenu') : t('navigation.openMenu')
        }
        onClick={onMenuToggle}
      >
        <MenuIcon isOpen={isMenuOpen} />
      </button>
    </nav>
  );
}

function ResolvedCartAction({onOpen}: {onOpen: () => void}) {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return <CartAction count={cart?.totalQuantity ?? 0} onOpen={onOpen} />;
}

function CartAction({
  count,
  onOpen,
}: {
  count: number | null;
  onOpen: () => void;
}) {
  const {t} = useTranslation();
  const {open} = useAside();
  const {publish, shop, cart, prevCart} = useAnalytics();
  const cartPath = usePrefixPathWithLocale('/cart');

  return (
    <a
      className="dhx-cart"
      href={cartPath}
      aria-label={t('navigation.openCart')}
      title={t('navigation.cart')}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: typeof window !== 'undefined' ? window.location.href : '',
        } as CartViewPayload);
      }}
    >
      <span className="dhx-bag">
        <BagIcon />
        {count !== null && count > 0 ? <b>{count}</b> : null}
      </span>
    </a>
  );
}

function DesktopMegaMenu({
  mega,
  onNavigate,
}: {
  mega: MegaMenuNode;
  onNavigate: () => void;
}) {
  const baseCollection = reference<CollectionReference>(
    mega,
    'base_collection',
  );
  const columns = references<FieldContainer & {id?: string | null}>(
    mega,
    'columns',
  );

  if (!baseCollection?.handle || columns.length === 0) return null;
  const baseHandle = baseCollection.handle;

  return (
    <div className="dhx-mega">
      <div className="dhx-megaLayout">
        <div className="dhx-megaColumns">
          {columns.map((column) => {
            const columnTitle = value(column, 'title') ?? '';
            const items = references<FieldContainer & {id?: string | null}>(
              column,
              'items',
            );

            return (
              <section
                className="dhx-megaColumn"
                key={column.id || columnTitle}
              >
                {columnTitle ? <h3>{columnTitle}</h3> : null}
                <ul>
                  {items.map((item) => {
                    const label = value(item, 'label') ?? '';
                    return (
                      <li key={item.id || label}>
                        <NavLink
                          to={megaItemUrl(item, baseHandle)}
                          onClick={onNavigate}
                        >
                          <span>{label}</span>
                          <ArrowIcon />
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="dhx-searchIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.7" cy="10.7" r="6.3" />
      <path d="m15.5 15.5 4.1 4.1" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.7 5a5.2 5.2 0 0 0-7.4 0L12 6.3 10.7 5a5.2 5.2 0 1 0-7.4 7.4l1.3 1.3L12 20.6l7.4-6.9 1.3-1.3A5.2 5.2 0 0 0 20.7 5Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.7 8.4h12.6l.8 11.4H4.9l.8-11.4Z" />
      <path d="M9 8.5V6.2a3 3 0 0 1 6 0v2.3" />
    </svg>
  );
}

function MenuIcon({isOpen}: {isOpen: boolean}) {
  return (
    <svg
      className={'dhx-menuIcon' + (isOpen ? ' is-open' : '')}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path className="dhx-menuIconTop" d="M4.5 7.5h15" />
      <path className="dhx-menuIconMiddle" d="M4.5 12h15" />
      <path className="dhx-menuIconBottom" d="M4.5 16.5h15" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg className="dhx-down" viewBox="0 0 12 8" aria-hidden="true">
      <path d="m1 1.5 5 5 5-5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="dhx-arrow" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" />
    </svg>
  );
}
