import {RichText} from '@shopify/hydrogen';
import {useEffect, useId, useRef, useState, type KeyboardEvent} from 'react';
import {useFetcher} from 'react-router';
import {useTranslation} from '~/i18n/useTranslation';

export type FAQItem = {
  id: string;
  question: string;
  answer: string;
};

export type FAQCategory = {
  id: string;
  title: string;
  items: FAQItem[];
};

export type FAQContactActionData = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<'fullName' | 'email' | 'phone' | 'question', string>
  >;
};

export type FAQCopy = {
  contactEyebrow: string;
  contactTitle: string;
  contactDescription: string;
  fullNameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  questionLabel: string;
  submitLabel: string;
  submittingLabel: string;
};

type FAQProps = {
  title: string;
  categories: FAQCategory[];
  copy: FAQCopy;
};

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m4.5 7.5 5.5 5 5.5-5" />
    </svg>
  );
}

export default function FAQ({title, categories, copy}: FAQProps) {
  const {t} = useTranslation();
  const firstCategoryId = categories[0]?.id ?? '';
  const [activeCategoryId, setActiveCategoryId] = useState(firstCategoryId);
  const tabGroupId = useId().replaceAll(':', '');
  const fetcher = useFetcher<FAQContactActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];
  const activeCategoryIndex = activeCategory
    ? categories.indexOf(activeCategory)
    : -1;
  const isSubmitting = fetcher.state !== 'idle';

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(firstCategoryId);
    }
  }, [activeCategoryId, categories, firstCategoryId]);

  useEffect(() => {
    if (fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.data]);

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % categories.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + categories.length) % categories.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = categories.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    setActiveCategoryId(categories[nextIndex].id);
    document.getElementById(`${tabGroupId}-tab-${nextIndex}`)?.focus();
  };

  return (
    <main className="faq-page">
      <section className="faq-page__content container mx-auto">
        <header className="faq-page__header">
          <h1 className="faq-page__title">{title}</h1>
        </header>

        {categories.length ? (
          <>
            <div className="faq-page__tabs-scroll">
              <div className="faq-page__tabs" role="tablist" aria-label={title}>
                {categories.map((category, index) => {
                  const isActive = category.id === activeCategory?.id;

                  return (
                    <button
                      className="faq-page__tab"
                      id={`${tabGroupId}-tab-${index}`}
                      key={category.id}
                      type="button"
                      role="tab"
                      aria-controls={`${tabGroupId}-panel`}
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveCategoryId(category.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                    >
                      {category.title}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeCategory ? (
              <div
                className="faq-page__panel"
                id={`${tabGroupId}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabGroupId}-tab-${activeCategoryIndex}`}
              >
                <div className="faq-page__questions">
                  {activeCategory.items.map((item) => (
                    <details className="faq-page__item" key={item.id}>
                      <summary className="faq-page__question">
                        <span>{item.question}</span>
                        <span className="faq-page__toggle-icon">
                          <ChevronIcon />
                        </span>
                      </summary>
                      <RichText
                        className="faq-page__answer"
                        data={item.answer}
                      />
                    </details>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      <section className="faq-contact" aria-labelledby="faq-contact-title">
        <div className="faq-contact__inner container mx-auto">
          <header className="faq-contact__header">
            <span className="faq-contact__eyebrow">{copy.contactEyebrow}</span>
            <h2 id="faq-contact-title">{copy.contactTitle}</h2>
            <p>{copy.contactDescription}</p>
          </header>

          <fetcher.Form
            className="faq-contact__form"
            method="post"
            ref={formRef}
            aria-busy={isSubmitting}
          >
            <input type="hidden" name="intent" value="faq-contact" />
            <div className="faq-contact__honeypot" aria-hidden="true">
              <label htmlFor="faq-company">{t('common.company')}</label>
              <input
                id="faq-company"
                name="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="faq-contact__grid">
              <div className="faq-contact__field">
                <label htmlFor="faq-full-name">{copy.fullNameLabel}</label>
                <input
                  id="faq-full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                  aria-invalid={Boolean(fetcher.data?.fieldErrors?.fullName)}
                  aria-describedby={
                    fetcher.data?.fieldErrors?.fullName
                      ? 'faq-full-name-error'
                      : undefined
                  }
                />
                {fetcher.data?.fieldErrors?.fullName ? (
                  <span id="faq-full-name-error" className="faq-contact__error">
                    {fetcher.data.fieldErrors.fullName}
                  </span>
                ) : null}
              </div>

              <div className="faq-contact__field">
                <label htmlFor="faq-email">{copy.emailLabel}</label>
                <input
                  id="faq-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  required
                  aria-invalid={Boolean(fetcher.data?.fieldErrors?.email)}
                  aria-describedby={
                    fetcher.data?.fieldErrors?.email
                      ? 'faq-email-error'
                      : undefined
                  }
                />
                {fetcher.data?.fieldErrors?.email ? (
                  <span id="faq-email-error" className="faq-contact__error">
                    {fetcher.data.fieldErrors.email}
                  </span>
                ) : null}
              </div>

              <div className="faq-contact__field faq-contact__field--wide">
                <label htmlFor="faq-phone">{copy.phoneLabel}</label>
                <input
                  id="faq-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                  required
                  aria-invalid={Boolean(fetcher.data?.fieldErrors?.phone)}
                  aria-describedby={
                    fetcher.data?.fieldErrors?.phone
                      ? 'faq-phone-error'
                      : undefined
                  }
                />
                {fetcher.data?.fieldErrors?.phone ? (
                  <span id="faq-phone-error" className="faq-contact__error">
                    {fetcher.data.fieldErrors.phone}
                  </span>
                ) : null}
              </div>

              <div className="faq-contact__field faq-contact__field--wide">
                <label htmlFor="faq-question">{copy.questionLabel}</label>
                <textarea
                  id="faq-question"
                  name="question"
                  rows={6}
                  minLength={10}
                  maxLength={3000}
                  required
                  aria-invalid={Boolean(fetcher.data?.fieldErrors?.question)}
                  aria-describedby={
                    fetcher.data?.fieldErrors?.question
                      ? 'faq-question-error'
                      : undefined
                  }
                />
                {fetcher.data?.fieldErrors?.question ? (
                  <span id="faq-question-error" className="faq-contact__error">
                    {fetcher.data.fieldErrors.question}
                  </span>
                ) : null}
              </div>
            </div>

            <footer className="faq-contact__footer">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? copy.submittingLabel : copy.submitLabel}
              </button>
              <div className="faq-contact__feedback" aria-live="polite">
                {fetcher.data?.message ? (
                  <p
                    className={
                      fetcher.data.ok
                        ? 'faq-contact__success'
                        : 'faq-contact__error faq-contact__error--form'
                    }
                  >
                    {fetcher.data.message}
                  </p>
                ) : null}
              </div>
            </footer>
          </fetcher.Form>
        </div>
      </section>
    </main>
  );
}
