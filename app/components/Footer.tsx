import { Suspense } from 'react';
import { Await } from 'react-router';
import type { FooterQuery, HeaderQuery } from 'storefrontapi.generated';
import {NavLink} from '~/lib/i18n-router';

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

export function Footer({ footer: footerPromise, header, publicStoreDomain }: FooterProps) {
  return (
    <Suspense>
      <Await resolve={footerPromise}>
        {(footer) => (
          <footer className="custom-footer">
            <div className="footer-subsBox">
              <div className="footerSubsTitle">Newsletter abonnieren</div>

              <div className="footerSubsSubtitle">
                Abonnieren Sie unseren Newsletter und erhalten Sie als Erste aktuelle
                Neuigkeiten, Angebote und Informationen zu unseren Produkten. Bleiben Sie
                über die neuesten Trends auf dem Laufenden.
              </div>

              <div className="footerInputBox">
                <input type="email" placeholder="E-Mail-Adresse eingeben" className="footerEmailInput" />
                <button className="footerSubscribeButton">Abonnieren</button>
              </div>
            </div>

            <div className="container mx-auto">
              <div className="footerRow">
                {/* ----- LOGO & INFO ----- */}
                <div className="footer-logoCol">
                  {header?.shop?.brand?.logo?.image?.url ? (
                    <img
                      src={header.shop.brand.logo.image.url}
                      alt={header.shop.brand.logo.image.altText || header.shop.name || 'Logo'}
                      className="footer-logo-img"
                    />
                  ) : header?.shop?.name ? (
                    <span className="footer-logo-text">{header.shop.name}</span>
                  ) : null}

                  <div className="footerLogoSubtext">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas volutpat lacinia sem,
                    non posuere nulla consequat sit amet.
                  </div>

                  <div className="footerCallCenterBox">
                    <div className="callCenterIcon">
                      <img
                        src="https://cdn.shopify.com/s/files/1/0953/1323/2152/files/footerSvg.png?v=1761919410"
                        alt=""
                      />
                    </div>
                    <div className="callCenterTextBox">
                      <div className="callCenterTitle">Hotline Free:</div>
                      <a className="footerTel" href="tel:+4902433939920">
                        +49 (0)2433 93992-0
                      </a>
                    </div>
                  </div>

                  <div className="footerAdress">Rheinstraße 20 41836 Hückelhoven</div>
                </div>

                {/* ----- FOOTER MENÜ BÖLÜMLERİ ----- */}
                {footer?.menu && (
                  <div className="footer-sections">
                    {footer.menu.items.map((section) => (
                      <div className="footer-section" key={section.id}>
                        <div className="footer-section-title">{section.title}</div>

                        {section.items && section.items.length > 0 && (
                          <ul className="footer-links">
                            {section.items.map((item) => {
                              const cleanedUrl = normalizeMenuUrl(
                                item.url ?? '#',
                                publicStoreDomain,
                                header.shop.primaryDomain.url,
                              );

                              return (
                                <li key={item.id}>
                                  <NavLink to={cleanedUrl} className="footer-link">
                                    {item.title}
                                  </NavLink>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}

                  </div>
                )}
              </div>
            </div>

            <div className="footerSubBanner">
              <div className="container mx-auto">
                <span>Copyright © 2026 - Wandini. All Rights Reserved</span>
              </div>
            </div>
          </footer>
        )}
      </Await>
    </Suspense>
  );
}
