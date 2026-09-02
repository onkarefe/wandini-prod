import {useEffect, useRef, useState} from 'react';
import {useFetcher} from 'react-router';
import {useAnalytics} from '@shopify/hydrogen';
import {useTranslation} from '~/i18n/useTranslation';
import {Link} from '~/lib/i18n-router';
import {allowsThirdPartyTracking} from '~/lib/customer-privacy';

export type KontaktLink = {
  id: string;
  handle: string;
  title: string;
};

export type KontaktPageData = {
  address: string;
  mobile: string;
  mail: string;
  mapUrl: string;
  links: KontaktLink[];
};

export type KontaktActionData = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<'fullName' | 'email' | 'phone' | 'message', string>
  >;
};

type KontaktProps = {
  title: string;
  data: KontaktPageData;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

function getTelephoneHref(phone: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, '');
  return normalizedPhone ? `tel:${normalizedPhone}` : undefined;
}

function ConsentGatedMap({url, title}: {url: string; title: string}) {
  const {customerPrivacy, privacyBanner} = useAnalytics();
  const {t} = useTranslation();
  const [hasTrackingConsent, setHasTrackingConsent] = useState(false);

  useEffect(() => {
    const syncConsent = () => {
      const privacyApi = window.Shopify?.customerPrivacy ?? customerPrivacy;
      setHasTrackingConsent(allowsThirdPartyTracking(privacyApi));
    };

    syncConsent();
    document.addEventListener('visitorConsentCollected', syncConsent);
    document.addEventListener('shopifyCustomerPrivacyApiLoaded', syncConsent);

    return () => {
      document.removeEventListener('visitorConsentCollected', syncConsent);
      document.removeEventListener(
        'shopifyCustomerPrivacyApiLoaded',
        syncConsent,
      );
    };
  }, [customerPrivacy]);

  if (hasTrackingConsent) {
    return (
      <iframe
        src={url}
        title={title}
        width="600"
        height="450"
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  const showPrivacyPreferences = () => {
    const banner = window.privacyBanner ?? privacyBanner;
    banner?.showPreferences();
  };

  return (
    <div className="kontakt-details__map-consent">
      <p>{t('contact.mapConsentRequired')}</p>
      <button type="button" onClick={showPrivacyPreferences}>
        {t('contact.privacySettings')}
      </button>
    </div>
  );
}

export default function Kontakt({title, data}: KontaktProps) {
  const {t} = useTranslation();
  const hasDetails = Boolean(
    data.address || data.mobile || data.mail || data.mapUrl,
  );

  return (
    <main className="kontakt-page">
      <section className="kontakt-page__hero container mx-auto">
        <header className="kontakt-page__header">
          <h1 className="kontakt-page__title">{title}</h1>
        </header>

        {data.links.length ? (
          <nav className="kontakt-links" aria-label={t('contact.navigation')}>
            {data.links.map((link) => (
              <Link
                className="kontakt-links__card"
                key={link.id}
                to={`/pages/${link.handle}`}
                prefetch="intent"
              >
                <span>{link.title}</span>
                <ArrowIcon />
              </Link>
            ))}
          </nav>
        ) : null}
      </section>

      {hasDetails ? (
        <section
          className="kontakt-details container mx-auto"
          aria-label={t('contact.details')}
        >
          {data.address || data.mobile || data.mail ? (
            <div className="kontakt-details__information">
              <dl className="kontakt-details__list">
                {data.address ? (
                  <div className="kontakt-details__item">
                    <dt>{t('contact.address')}</dt>
                    <dd>
                      <address>{data.address}</address>
                    </dd>
                  </div>
                ) : null}

                {data.mobile ? (
                  <div className="kontakt-details__item">
                    <dt>{t('contact.phone')}</dt>
                    <dd>
                      <a href={getTelephoneHref(data.mobile)}>{data.mobile}</a>
                    </dd>
                  </div>
                ) : null}

                {data.mail ? (
                  <div className="kontakt-details__item">
                    <dt>{t('contact.email')}</dt>
                    <dd>
                      <a href={`mailto:${data.mail}`}>{data.mail}</a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {data.mapUrl ? (
            <div className="kontakt-details__map">
              <ConsentGatedMap
                url={data.mapUrl}
                title={t('contact.mapTitle', {address: data.address || title})}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <KontaktForm />
    </main>
  );
}

function KontaktForm() {
  const {t} = useTranslation();
  const fetcher = useFetcher<KontaktActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.data]);

  return (
    <section className="kontakt-form" aria-labelledby="kontakt-form-title">
      <div className="kontakt-form__inner container mx-auto">
        <header className="kontakt-form__header">
          <span className="kontakt-form__eyebrow">{t('contact.eyebrow')}</span>
          <h2 id="kontakt-form-title">{t('contact.title')}</h2>
          <p>{t('contact.description')}</p>
        </header>

        <fetcher.Form
          className="kontakt-form__form"
          method="post"
          ref={formRef}
          aria-busy={isSubmitting}
        >
          <input type="hidden" name="intent" value="kontakt-contact" />
          <div className="kontakt-form__honeypot" aria-hidden="true">
            <label htmlFor="kontakt-company">{t('common.company')}</label>
            <input
              id="kontakt-company"
              name="company"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="kontakt-form__grid">
            <div className="kontakt-form__field">
              <label htmlFor="kontakt-full-name">{t('contact.fullName')}</label>
              <input
                id="kontakt-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={120}
                required
                aria-invalid={Boolean(fetcher.data?.fieldErrors?.fullName)}
                aria-describedby={
                  fetcher.data?.fieldErrors?.fullName
                    ? 'kontakt-full-name-error'
                    : undefined
                }
              />
              {fetcher.data?.fieldErrors?.fullName ? (
                <span
                  id="kontakt-full-name-error"
                  className="kontakt-form__error"
                >
                  {fetcher.data.fieldErrors.fullName}
                </span>
              ) : null}
            </div>

            <div className="kontakt-form__field">
              <label htmlFor="kontakt-email">{t('contact.emailAddress')}</label>
              <input
                id="kontakt-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                required
                aria-invalid={Boolean(fetcher.data?.fieldErrors?.email)}
                aria-describedby={
                  fetcher.data?.fieldErrors?.email
                    ? 'kontakt-email-error'
                    : undefined
                }
              />
              {fetcher.data?.fieldErrors?.email ? (
                <span id="kontakt-email-error" className="kontakt-form__error">
                  {fetcher.data.fieldErrors.email}
                </span>
              ) : null}
            </div>

            <div className="kontakt-form__field">
              <label htmlFor="kontakt-phone">{t('contact.phoneNumber')}</label>
              <input
                id="kontakt-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                required
                aria-invalid={Boolean(fetcher.data?.fieldErrors?.phone)}
                aria-describedby={
                  fetcher.data?.fieldErrors?.phone
                    ? 'kontakt-phone-error'
                    : undefined
                }
              />
              {fetcher.data?.fieldErrors?.phone ? (
                <span id="kontakt-phone-error" className="kontakt-form__error">
                  {fetcher.data.fieldErrors.phone}
                </span>
              ) : null}
            </div>

            <div className="kontakt-form__field kontakt-form__field--wide">
              <label htmlFor="kontakt-message">{t('contact.message')}</label>
              <textarea
                id="kontakt-message"
                name="message"
                minLength={10}
                maxLength={3000}
                required
                aria-invalid={Boolean(fetcher.data?.fieldErrors?.message)}
                aria-describedby={
                  fetcher.data?.fieldErrors?.message
                    ? 'kontakt-message-error'
                    : undefined
                }
              />
              {fetcher.data?.fieldErrors?.message ? (
                <span
                  id="kontakt-message-error"
                  className="kontakt-form__error"
                >
                  {fetcher.data.fieldErrors.message}
                </span>
              ) : null}
            </div>
          </div>

          <div className="kontakt-form__footer">
            <div
              className="kontakt-form__feedback"
              aria-live="polite"
              aria-atomic="true"
            >
              {fetcher.data?.message ? (
                <p
                  className={
                    fetcher.data.ok
                      ? 'kontakt-form__success'
                      : 'kontakt-form__error kontakt-form__error--form'
                  }
                >
                  {fetcher.data.message}
                </p>
              ) : null}
            </div>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('contact.sending') : t('contact.send')}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </section>
  );
}
