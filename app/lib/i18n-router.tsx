import type {LinkProps, NavLinkProps, To} from 'react-router';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useRouteLoaderData,
} from 'react-router';
import type {SelectedLocale} from '~/lib/locale';
import {DEFAULT_LOCALE, prefixPathWithLocale} from '~/lib/locale';

type RootLoaderData = {
  selectedLocale?: SelectedLocale;
};

function useSelectedLocale() {
  const data = useRouteLoaderData('root') as RootLoaderData | undefined;
  return data?.selectedLocale ?? DEFAULT_LOCALE;
}

function localizeTo(to: To, locale: SelectedLocale): To {
  if (typeof to === 'string') {
    return prefixPathWithLocale(to, locale);
  }

  if (!to.pathname) {
    return to;
  }

  return {
    ...to,
    pathname: prefixPathWithLocale(to.pathname, locale),
  };
}

export function usePrefixPathWithLocale(path: string) {
  const locale = useSelectedLocale();
  return prefixPathWithLocale(path, locale);
}

export function Link(props: LinkProps) {
  const locale = useSelectedLocale();

  return <RouterLink {...props} to={localizeTo(props.to, locale)} />;
}

export function NavLink(props: NavLinkProps) {
  const locale = useSelectedLocale();

  return <RouterNavLink {...props} to={localizeTo(props.to, locale)} />;
}
