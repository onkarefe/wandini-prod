import {Suspense, useEffect, useRef} from 'react';
import {Await, useFetcher} from 'react-router';
import {toast} from 'sonner';
import type {NewsletterActionData} from '~/routes/api.newsletter';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';
import wandiniWhiteLogo from '~/assets/logos/wanWhite.png';
import amexIcon from '~/assets/Icons/amex.svg';
import applePayIcon from '~/assets/Icons/applepay.svg';
import googlePayIcon from '~/assets/Icons/googlepay.svg';
import klarnaIcon from '~/assets/Icons/klarna.svg';
import maestroIcon from '~/assets/Icons/maestro.svg';
import mastercardIcon from '~/assets/Icons/mastercard.svg';
import paypalIcon from '~/assets/Icons/paypal.svg';
import shopPayIcon from '~/assets/Icons/shop_pay.svg';
import unionPayIcon from '~/assets/Icons/unionpay.svg';
import visaIcon from '~/assets/Icons/visa.svg';
import {NavLink} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

const PAYMENT_METHODS = [
  {name: 'Visa', icon: visaIcon},
  {name: 'Mastercard', icon: mastercardIcon},
  {name: 'Maestro', icon: maestroIcon},
  {name: 'American Express', icon: amexIcon},
  {name: 'PayPal', icon: paypalIcon},
  {name: 'Apple Pay', icon: applePayIcon},
  {name: 'Google Pay', icon: googlePayIcon},
  {name: 'Klarna', icon: klarnaIcon},
  {name: 'Shop Pay', icon: shopPayIcon},
  {name: 'UnionPay', icon: unionPayIcon},
] as const;

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
  const fetcher = useFetcher<NewsletterActionData>();
  const emailRef = useRef<HTMLInputElement>(null);
  const submissionPendingRef = useRef(false);
  const handledResponsesRef = useRef(new WeakSet<object>());
  const isSubmitting = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state !== 'idle') return;
    submissionPendingRef.current = false;

    const data = fetcher.data;
    if (!data || handledResponsesRef.current.has(data)) return;
    handledResponsesRef.current.add(data);

    if (data.ok) {
      toast.success(t('footer.newsletterSuccess'));
      if (emailRef.current) emailRef.current.value = '';
    } else {
      toast.error(
        t(
          data.fieldErrors?.email
            ? 'footer.newsletterInvalidEmail'
            : 'footer.newsletterError',
        ),
      );
    }
  }, [fetcher.data, fetcher.state, t]);

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

              <fetcher.Form
                method='post'
                action='/api/newsletter'
                className='footerInputBox'
                aria-busy={isSubmitting}
                onSubmit={(event) => {
                  if (submissionPendingRef.current || isSubmitting) {
                    event.preventDefault();
                    return;
                  }
                  submissionPendingRef.current = true;
                }}
              >
                <svg
                  className='footerEmailIcon'
                  viewBox='0 0 24 24'
                  aria-hidden='true'
                >
                  <path d='M3.5 5.5h17v13h-17z' />
                  <path d='m4 6 8 6 8-6' />
                </svg>
                <input
                  ref={emailRef}
                  type='email'
                  name='email'
                  required
                  maxLength={254}
                  autoComplete='email'
                  aria-label={t('footer.emailPlaceholder')}
                  placeholder={t('footer.emailPlaceholder')}
                  className='footerEmailInput'
                  onInvalid={(event) => {
                    event.preventDefault();
                    event.currentTarget.focus();
                    toast.error(t('footer.newsletterInvalidEmail'));
                  }}
                />
                <button
                  type='submit'
                  className='footerSubscribeButton'
                  disabled={isSubmitting}
                >
                  {t(
                    isSubmitting
                      ? 'footer.newsletterSubmitting'
                      : 'footer.subscribe',
                  )}
                </button>
              </fetcher.Form>
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
                  <ul
                    className='footerPaymentMethods'
                    aria-label='Accepted payment methods'
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <li key={method.name}>
                        <img src={method.icon} alt={method.name} loading='lazy' />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </footer>
        )}
      </Await>
    </Suspense>
  );
}
