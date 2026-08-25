import {Suspense} from 'react';
import {Await} from 'react-router';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';
import wandiniWhiteLogo from '~/assets/logos/wanWhite.png';
import {NavLink} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

/**
 * Footer linklerini normalize eder.
 * Shopify absolute URL gönderse bile (https://myshopify.com/...),
 * Hydrogen kendi domaininde kalır (/collections/...).
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
    const publicHost = publicStoreDomain;

    const base = `https://${publicHost}`;
    const url = new URL(rawUrl, base);
    const host = url.hostname;

    const isShopifyDomain =
      host === primaryHost ||
      host === publicHost ||
      host.endsWith('.myshopify.com');

    if (isShopifyDomain) {
      return url.pathname + url.search + url.hash;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function Footer({
  footer: footerPromise,
  header,
  publicStoreDomain,
}: FooterProps) {
  const {t} = useTranslation();

  return (
    <Suspense>
      <Await resolve={footerPromise}>
        {(footer) => (
          <footer className='custom-footer'>
            <div className='footer-subsBox'>
              <div className='footerSubsTitle'>
                {t('footer.newsletterTitle')}
              </div>

              <div className='footerSubsSubtitle'>
                {t('footer.newsletterDescription')}
              </div>

              <div className='footerInputBox'>
                <svg
                  className='footerEmailIcon'
                  viewBox='0 0 24 24'
                  aria-hidden='true'
                >
                  <path d='M3.5 5.5h17v13h-17z' />
                  <path d='m4 6 8 6 8-6' />
                </svg>
                <input
                  type='email'
                  placeholder={t('footer.emailPlaceholder')}
                  className='footerEmailInput'
                />
                <button className='footerSubscribeButton'>
                  {t('footer.subscribe')}
                </button>
              </div>
            </div>

            <div className='footer-main'>
              <div className='container mx-auto'>
                <div className='footerRow'>
                  <div className='footer-logoCol'>
                    <img
                      src={wandiniWhiteLogo}
                      alt={header.shop.name || 'Wandini'}
                      className='footer-logo-img'
                    />
                  </div>

                  {/* ----- FOOTER MENÜ BÖLÜMLERİ ----- */}
                  {footer?.menu && (
                    <nav
                      className='footer-sections'
                      aria-label={t('footer.navigation')}
                    >
                      {footer.menu.items.map((section) => (
                        <div className='footer-section' key={section.id}>
                          <div className='footer-section-title'>
                            {section.title}
                          </div>

                          {section.items && section.items.length > 0 && (
                            <ul className='footer-links'>
                              {section.items.map((item) => {
                                const cleanedUrl = normalizeMenuUrl(
                                  item.url ?? '#',
                                  publicStoreDomain,
                                  header.shop.primaryDomain.url,
                                );

                                return (
                                  <li key={item.id}>
                                    <NavLink
                                      to={cleanedUrl}
                                      className='footer-link'
                                    >
                                      {item.title}
                                    </NavLink>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      ))}
                    </nav>
                  )}
                </div>

                <div className='footerSubBanner'>
                  <span>{t('footer.copyright')}</span>
                </div>
              </div>
            </div>
          </footer>
        )}
      </Await>
    </Suspense>
  );
}
