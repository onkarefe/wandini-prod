import {useLocation, useMatches} from 'react-router';
import {useTranslation} from '~/i18n/useTranslation';
import {
  getFixedLanguageSwitchLinks,
  isLanguageSwitchLinks,
  type LanguageSwitchLinks,
} from '~/lib/language-switcher';

type LanguageSwitcherLinksProps = {
  activeLanguage: 'DE' | 'EN';
  className?: string;
  label: string;
  links: LanguageSwitchLinks;
  onNavigate?: () => void;
};

export function LanguageSwitcherLinks({
  activeLanguage,
  className = '',
  label,
  links,
  onNavigate,
}: LanguageSwitcherLinksProps) {
  return (
    <nav
      className={`language-switcher ${className}`.trim()}
      aria-label={label}
      data-language-switcher
    >
      <a
        href={links.DE}
        aria-current={activeLanguage === 'DE' ? 'page' : undefined}
        className={activeLanguage === 'DE' ? 'is-active' : undefined}
        lang="de"
        onClick={onNavigate}
      >
        DE
      </a>
      <a
        href={links.EN}
        aria-current={activeLanguage === 'EN' ? 'page' : undefined}
        className={activeLanguage === 'EN' ? 'is-active' : undefined}
        lang="en"
        onClick={onNavigate}
      >
        EN
      </a>
    </nav>
  );
}

export function LanguageSwitcher({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const {locale, t} = useTranslation();
  const location = useLocation();
  const matches = useMatches();
  const routeLinks = [...matches]
    .reverse()
    .map((match) => {
      const data = match.data as {languageSwitchLinks?: unknown} | undefined;
      return data?.languageSwitchLinks;
    })
    .find(isLanguageSwitchLinks);
  const links =
    routeLinks ??
    getFixedLanguageSwitchLinks(
      `${location.pathname}${location.search}${location.hash}`,
    );

  return (
    <LanguageSwitcherLinks
      activeLanguage={locale.language}
      className={className}
      label={t('navigation.language')}
      links={links}
      onNavigate={onNavigate}
    />
  );
}
