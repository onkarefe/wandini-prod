// app/components/Header.tsx
import React, {
  Suspense,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
} from 'react';
import {Await, useAsyncValue} from 'react-router';
import {
  type CartViewPayload,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import type {CartApiQueryFragment, HeaderQuery} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {DesktopHeader} from '~/components/DesktopHeader';
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
  references?: {
    nodes: unknown[];
  } | null;
};

type FieldContainer = {
  fields?: FieldRecord[] | null;
};

type CollectionReference = {
  handle?: string | null;
  title?: string | null;
};

type MegaMenuNode = HeaderQuery['megaMenus']['nodes'][number];
type MenuItem = NonNullable<HeaderQuery['menu']>['items'][number];
type NavItem = MenuItem & {_href: string};

function getField(node: FieldContainer | null | undefined, key: string) {
  return node?.fields?.find((field) => field?.key === key) ?? null;
}

function getValue(node: FieldContainer | null | undefined, key: string) {
  const value = getField(node, key)?.value;
  return typeof value === 'string' ? value : null;
}

function getRef<T>(node: FieldContainer | null | undefined, key: string) {
  return (getField(node, key)?.reference as T | null | undefined) ?? null;
}

function getRefs<T>(node: FieldContainer | null | undefined, key: string) {
  const nodes = getField(node, key)?.references?.nodes;
  return Array.isArray(nodes) ? (nodes as T[]) : [];
}

function collectionHandleFromPath(path: string) {
  try {
    const url = new URL(path, 'https://x.local');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'collections' && parts[1]) return parts[1];
    return null;
  } catch {
    return null;
  }
}

function normalizeToHandleLike(value: string) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildFilterUrl(
  baseCollectionHandle: string,
  taxonomyValueGid: string,
) {
  const payload = {
    taxonomyMetafield: {
      namespace: 'shopify',
      key: 'color-pattern',
      value: taxonomyValueGid,
    },
  };

  return `/collections/${baseCollectionHandle}?f=${encodeURIComponent(JSON.stringify(payload))}`;
}

function buildSortUrl(baseCollectionHandle: string, sortValue: string) {
  return `/collections/${baseCollectionHandle}?sort=${encodeURIComponent(sortValue)}`;
}

type HeaderProps = {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
};

export function Header({
  header,
  cart,
  publicStoreDomain,
}: HeaderProps) {
  return (
    <header className="h-header dh-headerHost">
      <DesktopHeader
        header={header}
        cart={cart}
        publicStoreDomain={publicStoreDomain}
      />
    </header>
  );
}

function HeaderSearch() {
  const {t} = useTranslation();
  const queriesDatalistId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const closeResults = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeResults();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      closeResults();
      containerRef.current?.querySelector('input')?.blur();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeResults, isOpen]);

  function handleResultsKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const input =
      containerRef.current?.querySelector<HTMLInputElement>('input');
    const resultLinks = Array.from(
      containerRef.current?.querySelectorAll<HTMLAnchorElement>(
        '.h-desktopSearchResults a[href]',
      ) ?? [],
    );

    if (!input || resultLinks.length === 0) return;

    event.preventDefault();
    const currentIndex = resultLinks.indexOf(
      document.activeElement as HTMLAnchorElement,
    );

    if (event.key === 'ArrowDown') {
      resultLinks[Math.min(currentIndex + 1, resultLinks.length - 1)]?.focus();
      return;
    }

    if (currentIndex <= 0) {
      input.focus();
      return;
    }

    resultLinks[currentIndex - 1]?.focus();
  }

  return (
    <div className="h-desktopSearchWrap" ref={containerRef}>
      <SearchFormPredictive
        className="h-desktopSearch"
        fetcherKey="header-search"
        onKeyDown={handleResultsKeyDown}
        onSearchSubmit={closeResults}
        role="search"
        aria-label={t('search.label')}
      >
        {({fetchResults, inputRef}) => (
          <>
            <button
              className="h-desktopSearchSubmit"
              type="submit"
              aria-label={t('search.submitLabel')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.4" />
                <path d="m15.6 15.6 4.1 4.1" />
              </svg>
            </button>

            <label className="h-visuallyHidden" htmlFor="header-search-query">
              {t('search.inputLabel')}
            </label>
            <input
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="header-search-results"
              aria-expanded={isOpen}
              data-header-predictive-search-input="true"
              enterKeyHint="search"
              id="header-search-query"
              list={queriesDatalistId}
              name="q"
              onChange={(event) => {
                setIsOpen(Boolean(event.currentTarget.value.trim()));
                fetchResults(event);
              }}
              onFocus={(event) => {
                setIsOpen(Boolean(event.currentTarget.value.trim()));
                fetchResults(event);
              }}
              placeholder={t('search.placeholder')}
              ref={inputRef}
              role="combobox"
              type="search"
            />
          </>
        )}
      </SearchFormPredictive>

      <SearchResultsPredictive
        fetcherKey="header-search"
        inputSelector='[data-header-predictive-search-input="true"]'
        onClose={closeResults}
      >
        {({items, total, term, state, closeSearch}) => {
          if (!isOpen || !term.current) return null;

          const {collections, products, queries} = items;
          const searchUrl = `${SEARCH_ENDPOINT}?${new URLSearchParams({
            q: term.current,
          }).toString()}`;

          return (
            <div
              className="h-desktopSearchResults"
              id="header-search-results"
              aria-live="polite"
              aria-label={t('search.suggestions')}
            >
              <SearchResultsPredictive.Queries
                queries={queries}
                queriesDatalistId={queriesDatalistId}
              />

              {state !== 'idle' ? (
                <div className="h-desktopSearchLoading" role="status">
                  <span aria-hidden="true" />
                  {t('search.searching')}
                </div>
              ) : total ? (
                <div className="h-desktopSearchResultsList">
                  <div className="h-desktopProductResults">
                    <SearchResultsPredictive.Products
                      products={products}
                      closeSearch={closeSearch}
                      term={term}
                    />
                  </div>
                  <div className="h-desktopCollectionResults">
                    <SearchResultsPredictive.Collections
                      collections={collections}
                      closeSearch={closeSearch}
                      term={term}
                    />
                  </div>

                  <Link
                    className="h-desktopSearchAll"
                    onClick={closeSearch}
                    to={searchUrl}
                  >
                    <span>
                      {t('search.allResults', {term: term.current})}
                    </span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10h11M11 6l4 4-4 4" />
                    </svg>
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

function HeaderLogo({shop}: {shop: HeaderQuery['shop'] | null}) {
  const {t} = useTranslation();

  return (
    <NavLink to="/" className="h-logoLink wh-logo" aria-label={t('common.home')}>
      {shop?.brand?.logo?.image?.url ? (
        <img
          src={shop.brand.logo.image.url}
          alt={shop?.name || t('common.logo')}
          className="h-logoImg"
        />
      ) : (
        <span className="h-logoText">{shop?.name || t('common.store')}</span>
      )}
    </NavLink>
  );
}

function DesktopHeaderActions({
  cart,
}: {
  cart: Promise<CartApiQueryFragment | null>;
}) {
  const {t} = useTranslation();

  return (
    <nav className="wh-actions" aria-label={t('navigation.quickActions')}>
      <NavLink
        to="/account/favorites"
        className="wh-actionButton"
        aria-label={t('navigation.favorites')}
      >
        <span className="wh-actionIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 20.75l7.78-7.3 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
          </svg>
        </span>
        <span className="wh-actionLabel">{t('navigation.favorites')}</span>
      </NavLink>
      <CartToggle cart={cart} showLabel />
    </nav>
  );
}

export function HeaderMenu({
  header,
  publicStoreDomain,
}: {
  header: HeaderQuery;
  publicStoreDomain: string;
}) {
  const {t} = useTranslation();
  const shop = header?.shop ?? null;
  const menu = header?.menu ?? null;
  const megaNodes = header.megaMenus.nodes;
  const menuItems = menu?.items;

  const primaryDomainUrl: string | null = shop?.primaryDomain?.url ?? null;

  const normalizeMenuUrl = useCallback(
    (rawUrl: string | null) => {
      if (!rawUrl) return '/';
      try {
        const primary = primaryDomainUrl ? new URL(primaryDomainUrl) : null;
        const primaryHost = primary?.hostname;

        const publicHost = publicStoreDomain;
        const base = `https://${publicHost}`;
        const url = new URL(rawUrl, base);

        const host = url.hostname;
        const isShopifyDomain =
          !primaryHost ||
          host === primaryHost ||
          host === publicHost ||
          host.endsWith('.myshopify.com');

        if (isShopifyDomain) return url.pathname + url.search + url.hash;
        return rawUrl;
      } catch {
        return rawUrl;
      }
    },
    [primaryDomainUrl, publicStoreDomain],
  );

  const megaByTrigger = useMemo(() => {
    const map = new Map<string, MegaMenuNode>();
    for (const m of megaNodes) {
      const trigger = getValue(m, 'trigger_handle');
      if (trigger) map.set(trigger, m);
    }
    return map;
  }, [megaNodes]);

  const navItems = useMemo<NavItem[]>(() => {
    return (menuItems ?? []).map((item) => {
      const href = normalizeMenuUrl(item.url ?? null);
      return {...item, _href: href};
    });
  }, [menuItems, normalizeMenuUrl]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOpenKey, setMobileOpenKey] = useState<string | null>(null);
  const megaHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setMobileOpenKey(null);
  }, []);

  const clearMegaHoverTimer = useCallback(() => {
    if (!megaHoverTimer.current) return;
    clearTimeout(megaHoverTimer.current);
    megaHoverTimer.current = null;
  }, []);

  const scheduleMegaOpen = useCallback(
    (key: string) => {
      clearMegaHoverTimer();
      megaHoverTimer.current = setTimeout(() => setOpenId(key), 110);
    },
    [clearMegaHoverTimer],
  );

  const scheduleMegaClose = useCallback(
    (key: string) => {
      clearMegaHoverTimer();
      megaHoverTimer.current = setTimeout(() => {
        setOpenId((current) => (current === key ? null : current));
      }, 130);
    },
    [clearMegaHoverTimer],
  );

  useEffect(() => {
    function closeDesktopMenu(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null);
    }

    document.addEventListener('keydown', closeDesktopMenu);
    return () => {
      document.removeEventListener('keydown', closeDesktopMenu);
      clearMegaHoverTimer();
    };
  }, [clearMegaHoverTimer]);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, closeMobile]);

  function resolveMegaForItem(item: NavItem) {
    const href: string = item?._href || '/';
    const byUrlHandle = collectionHandleFromPath(href);
    const byTitleHandle = normalizeToHandleLike(item?.title || '');
    const triggerCandidates = [byUrlHandle, byTitleHandle].filter(
      Boolean,
    ) as string[];

    for (const t of triggerCandidates) {
      const found = megaByTrigger.get(t);
      if (found) return found;
    }
    return null;
  }

  function megaBaseHref(mega: MegaMenuNode) {
    const baseCollection = getRef<CollectionReference>(mega, 'base_collection');
    const baseHandle = baseCollection?.handle;
    return baseHandle ? `/collections/${baseHandle}` : '/';
  }

  return (
    <div className="h-menuRoot">
      <nav className="h-navDesktop" aria-label={t('navigation.primary')}>
        {navItems.map((item) => {
          const href: string = item?._href || '/';
          const mega = resolveMegaForItem(item);
          const hasMega = !!mega;
          const key = item?.id || item?.title || href;

          return (
            <div
              key={key}
              className="h-navItemWrap"
              onBlur={(event) => {
                if (
                  hasMega &&
                  !event.currentTarget.contains(event.relatedTarget)
                ) {
                  setOpenId(null);
                }
              }}
              onFocus={() => hasMega && setOpenId(String(key))}
              onMouseEnter={() => hasMega && scheduleMegaOpen(String(key))}
              onMouseLeave={() => hasMega && scheduleMegaClose(String(key))}
            >
              <NavLink
                to={href}
                className={({isActive}) =>
                  `h-navLink${isActive ? ' is-active' : ''}`
                }
                aria-expanded={hasMega ? openId === String(key) : undefined}
              >
                <span>{item?.title || t('navigation.link')}</span>
                {hasMega ? (
                  <svg
                    className="h-navChevron"
                    viewBox="0 0 12 8"
                    aria-hidden="true"
                  >
                    <path d="m1 1.5 5 5 5-5" />
                  </svg>
                ) : null}
              </NavLink>

              {hasMega && openId === String(key) ? (
                <MegaMenuPanel mega={mega} />
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="h-navMobileToggleWrap">
        <button
          type="button"
          className="h-mobileToggleBtn"
          onClick={() => setMobileOpen(true)}
          aria-label={t('navigation.openMenu')}
          aria-expanded={mobileOpen}
        >
          ☰
        </button>
      </div>

      {mobileOpen ? (
        <div
          className="h-mobileOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('navigation.mobileMenu')}
        >
          <button
            type="button"
            className="h-mobileOverlayBackdrop"
            onClick={closeMobile}
            aria-label={t('navigation.closeMenu')}
          />

          <div className="h-mobilePanel">
            <div className="h-mobilePanelHeader">
              <NavLink
                to="/"
                className="h-logoLink"
                aria-label={t('common.home')}
                onClick={closeMobile}
              >
                {shop?.brand?.logo?.image?.url ? (
                  <img
                    src={shop.brand.logo.image.url}
                    alt={shop?.name || t('common.logo')}
                    className="h-logoImg"
                  />
                ) : (
                  <span className="h-logoText">
                    {shop?.name || t('common.store')}
                  </span>
                )}
              </NavLink>
              <button
                type="button"
                className="h-mobileCloseBtn"
                onClick={closeMobile}
                aria-label={t('navigation.closeMenu')}
              >
                ✕
              </button>
            </div>

            <nav className="h-mobileNav" aria-label={t('navigation.mobile')}>
              <ul className="h-mobileNavList">
                {navItems.map((item) => {
                  const href: string = item?._href || '/';
                  const label = item?.title || t('navigation.link');
                  const key = String(item?.id || label || href);

                  const mega = resolveMegaForItem(item);
                  const hasMega = !!mega;

                  if (!hasMega) {
                    return (
                      <li key={key} className="h-mobileItem">
                        <NavLink
                          to={href}
                          className="h-mobileNavLink"
                          onClick={closeMobile}
                        >
                          {label}
                        </NavLink>
                      </li>
                    );
                  }

                  const isOpen = mobileOpenKey === key;
                  const baseHref = megaBaseHref(mega);

                  return (
                    <li key={key} className="h-mobileItem h-mobileItemHasSub">
                      <div className="h-mobileRow">
                        <NavLink
                          to={href || baseHref}
                          className="h-mobileNavLink h-mobileNavLinkPrimary"
                          onClick={closeMobile}
                        >
                          {label}
                        </NavLink>

                        <button
                          type="button"
                          className="h-mobileAccordionBtn"
                          onClick={() =>
                            setMobileOpenKey((cur) =>
                              cur === key ? null : key,
                            )
                          }
                          aria-expanded={isOpen}
                          aria-controls={`h-mobile-sub-${key}`}
                          aria-label={
                            isOpen
                              ? t('navigation.collapseSubmenu', {label})
                              : t('navigation.expandSubmenu', {label})
                          }
                        >
                          <span
                            className="h-mobileAccordionIcon"
                            aria-hidden="true"
                            style={{
                              display: 'inline-flex',
                              transition: 'transform 0.2s ease',
                              transform: isOpen
                                ? 'rotate(180deg)'
                                : 'rotate(0deg)',
                            }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 640 640"
                            >
                              <path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" />
                            </svg>
                          </span>
                        </button>
                      </div>

                      <div
                        id={`h-mobile-sub-${key}`}
                        className={`h-mobileSub ${isOpen ? 'is-open' : ''}`}
                        hidden={!isOpen}
                      >
                        <MobileMegaContent
                          mega={mega}
                          onNavigate={closeMobile}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MegaMenuPanel({mega}: {mega: MegaMenuNode}) {
  const baseCollection = getRef<CollectionReference>(mega, 'base_collection');
  const baseHandle = baseCollection?.handle;
  const columns = getRefs<FieldContainer & {id?: string | null}>(
    mega,
    'columns',
  );

  if (!baseHandle || columns.length === 0) return null;

  return (
    <div className="h-megaWrap">
      <div className="h-megaShell">
        <div className="container mx-auto h-megaInner">
          <div className="h-megaGrid">
            {columns.map((col) => {
              const title = getValue(col, 'title') || '';
              const items = getRefs<FieldContainer & {id?: string | null}>(
                col,
                'items',
              );

              return (
                <div key={col?.id || title} className="h-megaCol">
                  <div className="h-megaColTitle">{title}</div>
                  <ul className="h-megaList">
                    {items.map((it) => {
                      const label = getValue(it, 'label') || '';
                      const action = getValue(it, 'action_type') || '';

                      let href = `/collections/${baseHandle}`;

                      if (action === 'collection') {
                        const c = getRef<CollectionReference>(it, 'collection');
                        if (c?.handle) href = `/collections/${c.handle}`;
                      } else if (action === 'filter_preset') {
                        const fp = getRef<FieldContainer>(it, 'filter_preset');
                        const gid =
                          fp?.fields?.find(
                            (field) => field.key === 'taxonomy_value_gid',
                          )?.value ?? null;
                        if (gid) href = buildFilterUrl(baseHandle, gid);
                      } else if (action === 'sort_preset') {
                        const sp = getRef<FieldContainer>(it, 'sort_preset');
                        const sortValue =
                          sp?.fields?.find(
                            (field) => field.key === 'sort_value',
                          )?.value ?? null;
                        if (sortValue)
                          href = buildSortUrl(baseHandle, sortValue);
                      }

                      return (
                        <li key={it?.id || label}>
                          <NavLink to={href} className="h-megaLink">
                            {label}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-megaHoverBuffer" aria-hidden="true" />
    </div>
  );
}

function MobileMegaContent({
  mega,
  onNavigate,
}: {
  mega: MegaMenuNode;
  onNavigate: () => void;
}) {
  const baseCollection = getRef<CollectionReference>(mega, 'base_collection');
  const baseHandle = baseCollection?.handle;
  const columns = getRefs<FieldContainer & {id?: string | null}>(
    mega,
    'columns',
  );

  if (!baseHandle || columns.length === 0) {
    return (
      <div className="h-mobileSubEmpty">
        <NavLink
          to={baseHandle ? `/collections/${baseHandle}` : '/'}
          onClick={onNavigate}
          className="h-mobileSubLink"
        >
          Browse all
        </NavLink>
      </div>
    );
  }

  return (
    <div className="h-mobileMega">
      {columns.map((col) => {
        const title = getValue(col, 'title') || '';
        const items = getRefs<FieldContainer & {id?: string | null}>(
          col,
          'items',
        );

        return (
          <div key={col?.id || title} className="h-mobileMegaCol">
            {title ? <div className="h-mobileMegaTitle">{title}</div> : null}

            <ul className="h-mobileMegaList">
              {items.map((it) => {
                const label = getValue(it, 'label') || '';
                const action = getValue(it, 'action_type') || '';

                let href = `/collections/${baseHandle}`;

                if (action === 'collection') {
                  const c = getRef<CollectionReference>(it, 'collection');
                  if (c?.handle) href = `/collections/${c.handle}`;
                } else if (action === 'filter_preset') {
                  const fp = getRef<FieldContainer>(it, 'filter_preset');
                  const gid =
                    fp?.fields?.find(
                      (field) => field.key === 'taxonomy_value_gid',
                    )?.value ?? null;
                  if (gid) href = buildFilterUrl(baseHandle, gid);
                } else if (action === 'sort_preset') {
                  const sp = getRef<FieldContainer>(it, 'sort_preset');
                  const sortValue =
                    sp?.fields?.find((field) => field.key === 'sort_value')
                      ?.value ?? null;
                  if (sortValue) href = buildSortUrl(baseHandle, sortValue);
                }

                return (
                  <li key={it?.id || label} className="h-mobileMegaItem">
                    <NavLink
                      to={href}
                      className="h-mobileMegaLink"
                      onClick={onNavigate}
                    >
                      {label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function HeaderCtas({
  isLoggedIn,
  cart,
}: {
  isLoggedIn: Promise<boolean>;
  cart: Promise<CartApiQueryFragment | null>;
}) {
  const {t} = useTranslation();

  return (
    <nav className="h-ctas" aria-label={t('navigation.quickActions')}>
      <NavLink
        to="/account"
        className="h-userbox"
        aria-label={t('navigation.account')}
      >
        <Suspense fallback={null}>
          <Await resolve={isLoggedIn} errorElement={null}>
            {() => (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 640 640"
                aria-hidden="true"
              >
                <path d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z" />
              </svg>
            )}
          </Await>
        </Suspense>
      </NavLink>

      <SearchToggle />

      <CartToggle cart={cart} />
    </nav>
  );
}

function SearchToggle() {
  const {open} = useAside();
  const {t} = useTranslation();

  return (
    <button
      type="button"
      className="h-searchbox"
      onClick={() => open('search')}
      aria-label={t('search.submit')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        aria-hidden="true"
      >
        <path d="M416 208c0 45.9-14.9 88.3-40.1 122.7l108.7 108.7c9.4 9.4 9.4 24.6 0 33.9l-11.3 11.3c-9.4 9.4-24.6 9.4-33.9 0L330.7 375.9C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0s208 93.1 208 208zm-208 144c79.5 0 144-64.5 144-144S287.5 64 208 64 64 128.5 64 208s64.5 144 144 144z" />
      </svg>
    </button>
  );
}

function CartToggle({
  cart,
  showLabel = false,
}: {
  cart: Promise<CartApiQueryFragment | null>;
  showLabel?: boolean;
}) {
  return (
    <Suspense fallback={<CartBadge count={null} showLabel={showLabel} />}>
      <Await resolve={cart}>
        <CartBanner showLabel={showLabel} />
      </Await>
    </Suspense>
  );
}

function CartBanner({showLabel}: {showLabel: boolean}) {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);

  return <CartBadge count={cart?.totalQuantity ?? 0} showLabel={showLabel} />;
}

function CartBadge({
  count,
  showLabel = false,
}: {
  count: number | null;
  showLabel?: boolean;
}) {
  const {open} = useAside();
  const {t} = useTranslation();
  const {publish, shop, cart, prevCart} = useAnalytics();
  const cartPath = usePrefixPathWithLocale('/cart');

  return (
    <a
      href={cartPath}
      className="h-cartBox"
      aria-label={t('navigation.cart')}
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
      <span
        className={
          showLabel ? 'wh-actionIcon h-cartIconWrap' : 'h-cartIconWrap'
        }
      >
        {showLabel ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.5 8.5h11l1 12h-13l1-12Z" />
            <path d="M9 9V6.5a3 3 0 0 1 6 0V9" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 640 640"
            aria-hidden="true"
          >
            <path d="M24 48C10.7 48 0 58.7 0 72C0 85.3 10.7 96 24 96L69.3 96C73.2 96 76.5 98.8 77.2 102.6L129.3 388.9C135.5 423.1 165.3 448 200.1 448L456 448C469.3 448 480 437.3 480 424C480 410.7 469.3 400 456 400L200.1 400C188.5 400 178.6 391.7 176.5 380.3L171.4 352L475 352C505.8 352 532.2 330.1 537.9 299.8L568.9 133.9C572.6 114.2 557.5 96 537.4 96L124.7 96L124.3 94C119.5 67.4 96.3 48 69.2 48L24 48zM208 576C234.5 576 256 554.5 256 528C256 501.5 234.5 480 208 480C181.5 480 160 501.5 160 528C160 554.5 181.5 576 208 576zM432 576C458.5 576 480 554.5 480 528C480 501.5 458.5 480 432 480C405.5 480 384 501.5 384 528C384 554.5 405.5 576 432 576z" />
          </svg>
        )}
        {count !== null && count > 0 ? (
          <span className="h-cartCount">{count}</span>
        ) : null}
      </span>
      {showLabel ? (
        <span className="wh-actionLabel">{t('navigation.cart')}</span>
      ) : null}
    </a>
  );
}
