import {createElement, type FormHTMLAttributes} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import CustomerReviewsPage from '~/components/customer-reviews-page';
import {createTranslator} from '~/i18n';
import type {CustomerReviewActionData} from '~/lib/customer-review.server';

const ui = vi.hoisted(() => ({
  language: 'DE' as 'DE' | 'EN',
  state: 'idle' as 'idle' | 'submitting' | 'loading',
  data: undefined as CustomerReviewActionData | undefined,
  refs: [] as Array<{current: unknown}>,
  cursor: 0,
  effects: [] as Array<() => void>,
  formProps: undefined as FormHTMLAttributes<HTMLFormElement> | undefined,
  reset: vi.fn(),
  company: '',
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = ui.cursor++;
      return ui.refs[index] ?? (ui.refs[index] = {current: initial});
    },
    useEffect: (callback: () => void) => {
      ui.effects.push(callback);
    },
  };
});
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  const React = await import('react');
  const Form = React.forwardRef<
    HTMLFormElement,
    FormHTMLAttributes<HTMLFormElement>
  >((props, ref) => {
    ui.formProps = props;
    if (ref && typeof ref !== 'function')
      ref.current = {reset: ui.reset} as unknown as HTMLFormElement;
    return React.createElement('form', props);
  });
  return {
    ...actual,
    useFetcher: () => ({state: ui.state, data: ui.data, Form}),
  };
});
vi.mock('~/i18n/useTranslation', () => ({
  useTranslation: () => ({t: createTranslator({language: ui.language})}),
}));

const page = {
  hero: {
    title: 'Hero title',
    description: 'Hero description',
    buttonText: 'Read reviews',
    image: null,
  },
  reviews: [
    {
      id: 'review-1',
      customerName: 'Anna',
      commentTitle: 'Wonderful',
      customerComment: 'A beautiful room.',
      image: null,
      stars: 4.5,
    },
  ],
  reviewsSectionTitle: 'Customer stories',
  steps: {
    title: 'Our steps',
    description: 'Journey description',
    steps: [
      {
        id: 'step-1',
        title: 'Choose',
        description: 'Choose a motif',
        image: null,
      },
    ],
  },
};
function render(props = page) {
  ui.cursor = 0;
  ui.effects = [];
  return renderToStaticMarkup(createElement(CustomerReviewsPage, props));
}
function flushEffects() {
  for (const effect of ui.effects) effect();
}
function submit() {
  const preventDefault = vi.fn();
  ui.formProps?.onSubmit?.({preventDefault, currentTarget: {}} as never);
  return preventDefault;
}
beforeEach(() => {
  ui.language = 'DE';
  ui.state = 'idle';
  ui.data = undefined;
  ui.refs = [];
  ui.company = '';
  ui.reset.mockReset();
  const NativeFormData = globalThis.FormData;
  vi.stubGlobal(
    'FormData',
    class extends NativeFormData {
      constructor() {
        super();
        this.set('company', ui.company);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('customer review form and display', () => {
  it('retains Unicode in localized review feedback', () => {
    expect(createTranslator({language: 'DE'})('reviews.success')).toContain(
      'gepr\u00fcft',
    );
    expect(createTranslator({language: 'EN'})('reviews.submitting')).toBe(
      'Validating \u2026',
    );
  });
  it('posts multipart to the isolated resource route and hides the honeypot accessibly', () => {
    const html = render();
    expect(html).toContain('action="/api/customer-review"');
    expect(html).toContain('method="post"');
    expect(html).toContain('encType="multipart/form-data"');
    expect(html).toContain('<div hidden="" aria-hidden="true">');
    expect(html).toContain(
      'name="company" type="text" tabindex="-1" autoComplete="off"',
    );
    for (const name of [
      'firstName',
      'lastName',
      'email',
      'phone',
      'rating',
      'comment',
      'photo',
    ])
      expect(html).toContain('name="' + name + '"');
  });
  it.each(['DE', 'EN'] as const)(
    'localizes accessible success and validation feedback in %s',
    (language) => {
      ui.language = language;
      const t = createTranslator({language});
      ui.data = {ok: false, fieldErrors: {email: 'email', photo: 'photoSize'}};
      let html = render();
      expect(html).toContain('role="alert"');
      expect(html).toContain(
        'aria-invalid="true" aria-describedby="review-email-error"',
      );
      expect(html).toContain(t('reviews.error.email'));
      expect(html).toContain(t('reviews.error.photoSize'));
      ui.data = {ok: true};
      html = render();
      expect(html).toContain('role="status"');
      expect(html).toContain(t('reviews.success'));
    },
  );
  it.each(['submitting', 'loading'] as const)(
    'disables submission throughout %s and hides stale feedback',
    (state) => {
      ui.state = state;
      ui.data = {ok: true};
      const html = render();
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('<button type="submit" disabled="">');
      expect(html).toContain(createTranslator()('reviews.submitting'));
      expect(html).not.toContain(createTranslator()('reviews.success'));
      expect(submit()).toHaveBeenCalledOnce();
    },
  );
  it('blocks a second submit before fetcher state changes', () => {
    render();
    flushEffects();
    expect(submit()).not.toHaveBeenCalled();
    expect(submit()).toHaveBeenCalledOnce();
  });
  it('resets only after a completed genuine success, including subsequent submissions', () => {
    render();
    flushEffects();
    expect(ui.reset).not.toHaveBeenCalled();
    submit();
    ui.state = 'submitting';
    render();
    flushEffects();
    ui.state = 'loading';
    ui.data = {ok: true};
    render();
    flushEffects();
    expect(ui.reset).not.toHaveBeenCalled();
    ui.state = 'idle';
    render();
    flushEffects();
    expect(ui.reset).toHaveBeenCalledTimes(1);
    expect(submit()).not.toHaveBeenCalled();
    ui.state = 'submitting';
    render();
    flushEffects();
    ui.state = 'idle';
    ui.data = {ok: true};
    render();
    flushEffects();
    expect(ui.reset).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    'preserves values after error or honeypot success (honeypot=%s)',
    (honeypot) => {
      ui.company = honeypot ? 'trap' : '';
      render();
      flushEffects();
      submit();
      // Changing the live field after submission cannot turn a trapped success into a reset.
      ui.company = '';
      ui.state = 'submitting';
      render();
      flushEffects();
      ui.state = 'idle';
      ui.data = honeypot
        ? {ok: true}
        : {ok: false, fieldErrors: {email: 'email'}};
      render();
      flushEffects();
      expect(ui.reset).not.toHaveBeenCalled();
    },
  );
  it('never renders arbitrary response HTML or echoes submitted HTML', () => {
    const attack = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    ui.data = {
      ok: false,
      fieldErrors: {comment: attack},
    } as unknown as CustomerReviewActionData;
    const html = render();
    expect(html).not.toContain(attack);
    expect(html).not.toContain('<script');
    expect(html).toContain(createTranslator()('reviews.error.malformed'));
    expect(html).toContain('<textarea');
    expect(html).not.toContain('value="' + attack);
  });
  it('preserves hero, review list, aggregate/half-star rating and journey rendering', () => {
    const html = render();
    for (const text of [
      'Hero title',
      'Hero description',
      'Read reviews',
      'Customer stories',
      'Anna',
      'Wonderful',
      'A beautiful room.',
      'Our steps',
      'Choose a motif',
    ])
      expect(html).toContain(text);
    expect(html).toContain('href="#kundenstimmen"');
    expect(html).toContain('<strong>4.5</strong>');
    expect(html).toContain('customer-reviews-page__star--half');
    expect(html).toContain('customer-reviews-page__journey-index');
  });
  it('escapes HTML in displayed metaobject text', () => {
    const html = render({
      ...page,
      reviews: [
        {...page.reviews[0], customerComment: '<script>alert(1)</script>'},
      ],
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
