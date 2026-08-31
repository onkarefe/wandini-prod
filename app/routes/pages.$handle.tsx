import {useLoaderData} from 'react-router';
import {lazy, Suspense} from 'react';
import type {Route} from './+types/pages.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import staticPagesStyles from '~/styles/staticPages.css?url';
import faqStyles from '~/styles/FAQ.css?url';
import kontaktStyles from '~/styles/kontakt.css?url';
import customerReviewsPageStyles from '~/styles/customer-reviews-page.css?url';
import breadcrumbStyles from '~/styles/product-breadcrumb.css?url';
import {Breadcrumbs} from '~/components/ProductBreadcrumb';
import {
  buildBreadcrumbStructuredData,
  buildContentBreadcrumbItems,
} from '~/lib/breadcrumbs';
import {
  buildCanonicalUrl,
  buildResourceSeoAlternateUrls,
  buildSeoMetadata,
  normalizeSeoText as normalizeMetaText,
} from '~/lib/seo';
import type {FAQCategory, FAQCopy} from '~/components/FAQ';
import type {KontaktPageData} from '~/components/kontakt';
import {createTranslator} from '~/i18n';
import {getLocaleFromRequest} from '~/lib/locale';
import {resolveResourceLanguageSwitchLinks} from '~/lib/language-switcher';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import {getOnlineStoreId} from '~/lib/store-schema';
import {
  parseCustomerReviewsHeroMetaobject,
  parseCustomerReviewsMetaobject,
  parseCustomerReviewsSectionTitle,
  parseCustomerReviewsStepsMetaobject,
} from '~/lib/customer-reviews';

const BLOCKED_HTML_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'link',
  'meta',
  'base',
] as const;
const PAGE_META_BRAND = 'Wandini';
const ERFAHRUNGEN_PAGE_TYPE = 'erfahrungen';
const FAQ_PAGE_TYPE = 'faq';
const KONTAKT_PAGE_TYPE = 'kontakt';

const FAQ = lazy(() => import('~/components/FAQ'));
const Kontakt = lazy(() => import('~/components/kontakt'));

const CustomerReviewsPage = lazy(
  () => import('~/components/customer-reviews-page'),
);

type PageWithType = {
  pageType?: {value?: string | null} | null;
};

function isErfahrungenPage(page?: PageWithType | null) {
  return page?.pageType?.value?.trim().toLowerCase() === ERFAHRUNGEN_PAGE_TYPE;
}

function isFaqPage(page?: PageWithType | null) {
  return page?.pageType?.value?.trim().toLowerCase() === FAQ_PAGE_TYPE;
}

function isKontaktPage(page?: PageWithType | null) {
  return page?.pageType?.value?.trim().toLowerCase() === KONTAKT_PAGE_TYPE;
}

function getFAQCopy(request: Request): FAQCopy {
  const t = createTranslator(getLocaleFromRequest(request));
  return {
    contactEyebrow: t('contact.eyebrow'),
    contactTitle: t('faq.contactTitle'),
    contactDescription: t('faq.contactDescription'),
    fullNameLabel: t('contact.fullName'),
    emailLabel: t('contact.emailAddress'),
    phoneLabel: t('contact.phoneNumber'),
    questionLabel: t('faq.question'),
    submitLabel: t('faq.send'),
    submittingLabel: t('contact.sending'),
  };
}

function sanitizeInlineStyles(html: string) {
  return html.replace(
    /\sstyle\s*=\s*(["'])(.*?)\1/gi,
    (_match, quote, rawStyle) => {
      const sanitizedStyle = String(rawStyle)
        .replace(/expression\s*\([^)]*\)/gi, '')
        .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\1\s*\)/gi, '')
        .replace(/-moz-binding\s*:[^;]+;?/gi, '')
        .trim();

      return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : '';
    },
  );
}

function sanitizeShopifyPageHtml(html: string | null | undefined) {
  if (!html) {
    return '';
  }

  let sanitizedHtml = html;

  for (const tagName of BLOCKED_HTML_TAGS) {
    const blockTagPattern = new RegExp(
      `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      'gi',
    );
    const selfClosingTagPattern = new RegExp(`<${tagName}\\b[^>]*\\/?>`, 'gi');

    sanitizedHtml = sanitizedHtml
      .replace(blockTagPattern, '')
      .replace(selfClosingTagPattern, '');
  }

  sanitizedHtml = sanitizeInlineStyles(sanitizedHtml)
    .replace(/\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(
      /\s(href|src|xlink:href|formaction|poster|srcdoc)\s*=\s*(["'])\s*(javascript:|vbscript:|data:(?!image\/))[\s\S]*?\2/gi,
      (_match, attributeName, quote) => ` ${attributeName}=${quote}#${quote}`,
    );

  return sanitizedHtml;
}

type FAQMetaobjectNode = {
  id?: unknown;
  title?: {value?: unknown} | null;
  order?: {value?: unknown} | null;
  question?: {value?: unknown} | null;
  answer?: {value?: unknown} | null;
  category?: {
    reference?: {id?: unknown} | null;
  } | null;
};

function getFAQNodes(
  value: unknown,
  key: 'faqCategories' | 'faqItems',
): FAQMetaobjectNode[] {
  if (!value || typeof value !== 'object') return [];

  const connection = (value as Record<string, unknown>)[key];
  if (!connection || typeof connection !== 'object') return [];

  const nodes = (connection as {nodes?: unknown}).nodes;
  return Array.isArray(nodes) ? (nodes as FAQMetaobjectNode[]) : [];
}

function getFAQFieldText(field?: {value?: unknown} | null) {
  return typeof field?.value === 'string' ? field.value.trim() : '';
}

function getFAQOrder(field?: {value?: unknown} | null) {
  const value = Number.parseInt(getFAQFieldText(field), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function isValidRichText(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
}

function parseFAQMetaobjects(value: unknown): FAQCategory[] {
  const categories = getFAQNodes(value, 'faqCategories')
    .map((node, sourceIndex) => ({
      id: typeof node.id === 'string' ? node.id : '',
      title: getFAQFieldText(node.title),
      order: getFAQOrder(node.order),
      sourceIndex,
      items: [] as Array<
        FAQCategory['items'][number] & {order: number; sourceIndex: number}
      >,
    }))
    .filter((category) => category.id && category.title);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );

  getFAQNodes(value, 'faqItems').forEach((node, sourceIndex) => {
    const categoryId =
      typeof node.category?.reference?.id === 'string'
        ? node.category.reference.id
        : '';
    const category = categoriesById.get(categoryId);
    const id = typeof node.id === 'string' ? node.id : '';
    const question = getFAQFieldText(node.question);
    const answer = getFAQFieldText(node.answer);

    if (!category || !id || !question || !answer || !isValidRichText(answer)) {
      return;
    }

    category.items.push({
      id,
      question,
      answer,
      order: getFAQOrder(node.order),
      sourceIndex,
    });
  });

  return categories
    .sort(
      (first, second) =>
        first.order - second.order || first.sourceIndex - second.sourceIndex,
    )
    .map((category) => ({
      id: category.id,
      title: category.title,
      items: category.items
        .sort(
          (first, second) =>
            first.order - second.order ||
            first.sourceIndex - second.sourceIndex,
        )
        .map(({id, question, answer}) => ({id, question, answer})),
    }));
}

type KontaktField = {value?: unknown} | null;

type KontaktMetaobjectNode = {
  address?: KontaktField;
  mobile?: KontaktField;
  mail?: KontaktField;
  googleMaps?: KontaktField;
  links?: {
    references?: {
      nodes?: unknown;
    } | null;
  } | null;
};

type KontaktPageReference = {
  id?: unknown;
  handle?: unknown;
  title?: unknown;
};

function getKontaktFieldText(field?: KontaktField) {
  return typeof field?.value === 'string' ? field.value.trim() : '';
}

function extractGoogleMapsUrl(value: string) {
  if (!value) return '';

  const iframeSrc = value.match(
    /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i,
  );
  const candidate = (
    iframeSrc?.[1] ??
    iframeSrc?.[2] ??
    iframeSrc?.[3] ??
    value
  )
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&');

  try {
    const url = new URL(candidate);
    const allowedHost =
      url.hostname === 'www.google.com' ||
      url.hostname === 'maps.google.com' ||
      url.hostname === 'www.google.de' ||
      url.hostname === 'maps.google.de';
    const allowedPath = /^\/maps\/(?:d\/)?embed(?:\/|$)/.test(url.pathname);

    if (url.protocol !== 'https:' || !allowedHost || !allowedPath) return '';

    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function parseKontaktPageDetails(value: unknown): KontaktPageData {
  const emptyData: KontaktPageData = {
    address: '',
    mobile: '',
    mail: '',
    mapUrl: '',
    links: [],
  };

  if (!value || typeof value !== 'object') return emptyData;

  const connection = (value as {kontaktPageDetails?: unknown})
    .kontaktPageDetails;
  if (!connection || typeof connection !== 'object') return emptyData;

  const nodes = (connection as {nodes?: unknown}).nodes;
  if (!Array.isArray(nodes) || !nodes.length) return emptyData;

  const node = nodes[0] as KontaktMetaobjectNode;
  const references = node.links?.references?.nodes;
  const links = Array.isArray(references)
    ? references.flatMap((reference) => {
        if (!reference || typeof reference !== 'object') return [];

        const pageReference = reference as KontaktPageReference;
        const id =
          typeof pageReference.id === 'string' ? pageReference.id.trim() : '';
        const handle =
          typeof pageReference.handle === 'string'
            ? pageReference.handle.trim()
            : '';
        const title =
          typeof pageReference.title === 'string'
            ? pageReference.title.trim()
            : '';

        return id && handle && title ? [{id, handle, title}] : [];
      })
    : [];

  return {
    address: getKontaktFieldText(node.address),
    mobile: getKontaktFieldText(node.mobile),
    mail: getKontaktFieldText(node.mail),
    mapUrl: extractGoogleMapsUrl(getKontaktFieldText(node.googleMaps)),
    links,
  };
}

function getRichTextPlainText(value: string) {
  try {
    const root: unknown = JSON.parse(value);
    const textParts: string[] = [];

    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;

      const richTextNode = node as {value?: unknown; children?: unknown};
      if (typeof richTextNode.value === 'string') {
        textParts.push(richTextNode.value);
      }
      if (Array.isArray(richTextNode.children)) {
        richTextNode.children.forEach(visit);
      }
    };

    visit(root);
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function getFAQMetaDescription(
  title: string | null | undefined,
  categories: FAQCategory[],
) {
  const firstItem = categories.flatMap((category) => category.items)[0];
  if (!firstItem) return null;

  const answer = getRichTextPlainText(firstItem.answer);
  const description = [normalizeMetaText(title), firstItem.question, answer]
    .filter(Boolean)
    .join(' — ');

  return description || null;
}

function getKontaktMetaDescription(
  title: string | null | undefined,
  data?: KontaktPageData | null,
) {
  if (!data) return null;

  const description = [
    normalizeMetaText(title),
    normalizeMetaText(data.address),
    normalizeMetaText(data.mail),
  ]
    .filter(Boolean)
    .join(' - ');

  return description || null;
}

function buildKontaktJsonLd(
  title: string | null | undefined,
  canonicalUrl: string,
  data: KontaktPageData,
) {
  const name = normalizeMetaText(title);
  if (!name) return null;

  const hasContactData = Boolean(data.address || data.mail || data.mobile);

  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name,
    url: canonicalUrl,
    ...(hasContactData
      ? {
          mainEntity: {
            '@type': 'OnlineStore',
            '@id': getOnlineStoreId(canonicalUrl),
            name: PAGE_META_BRAND,
            ...(data.address ? {address: data.address} : {}),
            ...(data.mail ? {email: data.mail} : {}),
            ...(data.mobile ? {telephone: data.mobile} : {}),
          },
        }
      : {}),
  };
}

function buildFAQJsonLd(categories: FAQCategory[]) {
  const seenQuestions = new Set<string>();
  const mainEntity = categories.flatMap((category) =>
    category.items.flatMap((item) => {
      const answer = getRichTextPlainText(item.answer);
      const normalizedQuestion = item.question.trim().toLocaleLowerCase();

      if (!answer || seenQuestions.has(normalizedQuestion)) return [];
      seenQuestions.add(normalizedQuestion);

      return [
        {
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer,
          },
        },
      ];
    }),
  );

  if (!mainEntity.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function links() {
  return [
    {rel: 'stylesheet', href: staticPagesStyles},
    {rel: 'stylesheet', href: faqStyles},
    {rel: 'stylesheet', href: kontaktStyles},
    {rel: 'stylesheet', href: customerReviewsPageStyles},
    {rel: 'stylesheet', href: breadcrumbStyles},
  ];
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const page = data?.page;
  const specializedFallback = isFaqPage(page)
    ? getFAQMetaDescription(page?.title, data?.faqCategories ?? [])
    : isKontaktPage(page)
      ? getKontaktMetaDescription(page?.title, data?.kontakt)
      : null;
  const contentFallback = normalizeMetaText(page?.body)
    ? page?.body
    : specializedFallback;

  return buildSeoMetadata({
    title: {
      explicit: page?.seo?.title,
      fallback: page?.title,
    },
    description: {
      explicit: page?.seo?.description,
      fallback: contentFallback,
    },
    canonicalUrl: data?.canonicalUrl ?? `/pages/${params.handle ?? ''}`,
    alternates: buildResourceSeoAlternateUrls(
      data?.canonicalUrl ?? `/pages/${params.handle ?? ''}`,
      data?.languageSwitchLinks,
    ),
  });
};

function readFAQFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getShopifyContactUrl(domain: string | undefined) {
  if (!domain) return null;

  try {
    const url = new URL(
      domain.startsWith('http://') || domain.startsWith('https://')
        ? domain
        : `https://${domain}`,
    );
    url.protocol = 'https:';
    url.pathname = '/contact';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

type ContactFieldErrors = Partial<
  Record<'fullName' | 'email' | 'phone' | 'question' | 'message', string>
>;

export async function action({
  context,
  request,
}: Route.ActionArgs): Promise<Response> {
  const t = createTranslator(getLocaleFromRequest(request));
  const FAQ_ACTION_MESSAGES = {
    required: t('contact.required'),
    invalidEmail: t('contact.invalidEmail'),
    invalidQuestion: t('faq.invalidQuestion'),
    success: t('faq.success'),
    error: t('faq.error'),
  };
  const KONTAKT_ACTION_MESSAGES = {
    required: t('contact.required'),
    invalidEmail: t('contact.invalidEmail'),
    invalidMessage: t('contact.invalidMessage'),
    success: t('contact.success'),
    error: t('contact.error'),
  };
  if (request.method !== 'POST') {
    return Response.json(
      {ok: false, message: FAQ_ACTION_MESSAGES.error},
      {status: 405},
    );
  }

  const formData = await request.formData();
  const intent = readFAQFormValue(formData, 'intent');
  const isKontaktForm = intent === 'kontakt-contact';
  if (!isKontaktForm && intent !== 'faq-contact') {
    return Response.json(
      {ok: false, message: FAQ_ACTION_MESSAGES.error},
      {status: 400},
    );
  }
  const messages = isKontaktForm
    ? KONTAKT_ACTION_MESSAGES
    : FAQ_ACTION_MESSAGES;

  if (readFAQFormValue(formData, 'company')) {
    return Response.json({
      ok: true,
      message: messages.success,
    });
  }

  const fullName = readFAQFormValue(formData, 'fullName');
  const email = readFAQFormValue(formData, 'email');
  const phone = readFAQFormValue(formData, 'phone');
  const question = readFAQFormValue(formData, 'question');
  const message = readFAQFormValue(formData, 'message');
  const body = isKontaktForm ? message : question;
  const fieldErrors: ContactFieldErrors = {};

  if (fullName.length < 2 || fullName.length > 120) {
    fieldErrors.fullName = messages.required;
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = messages.invalidEmail;
  }
  if (!phone || phone.length > 40) {
    fieldErrors.phone = messages.required;
  }
  if (body.length < 10 || body.length > 3000) {
    if (isKontaktForm) {
      fieldErrors.message = KONTAKT_ACTION_MESSAGES.invalidMessage;
    } else {
      fieldErrors.question = FAQ_ACTION_MESSAGES.invalidQuestion;
    }
  }

  if (Object.keys(fieldErrors).length) {
    return Response.json({ok: false, fieldErrors}, {status: 400});
  }

  const contactUrl = getShopifyContactUrl(context.env.PUBLIC_STORE_DOMAIN);
  if (!contactUrl) {
    return Response.json({ok: false, message: messages.error}, {status: 503});
  }

  const shopifyForm = new URLSearchParams({
    form_type: 'contact',
    utf8: '✓',
    'contact[name]': fullName,
    'contact[email]': email,
    'contact[phone]': phone,
    'contact[body]': body,
  });

  try {
    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: shopifyForm,
      redirect: 'follow',
    });

    if (!response.ok) throw new Error('Kontaktformular wurde abgelehnt');

    return Response.json({
      ok: true,
      message: messages.success,
    });
  } catch {
    return Response.json({ok: false, message: messages.error}, {status: 502});
  }
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, request, params}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Error('Missing page handle');
  }

  const [{page}] = await Promise.all([
    context.storefront.query(PAGE_QUERY, {
      variables: {
        handle: params.handle,
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!page) {
    throw new Response('Not Found', {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle: params.handle, data: page});
  const faqMetaobjects = isFaqPage(page)
    ? await context.storefront.query(FAQ_QUERY, {
        cache: context.storefront.CacheShort(),
        variables: {
          faqCategoryType: 'faq_category',
          faqItemType: 'faq_item',
          titleKey: 'title',
          orderKey: 'order',
          questionKey: 'question',
          answerKey: 'answer',
          categoryKey: 'select_category',
        },
      })
    : null;
  const kontaktMetaobjects = isKontaktPage(page)
    ? await context.storefront.query(KONTAKT_QUERY, {
        cache: context.storefront.CacheShort(),
        variables: {
          kontaktType: 'kontakt_page_detatils',
          addressKey: 'adress',
          mobileKey: 'mobile',
          mailKey: 'mail',
          linksKey: 'links',
          googleMapsKey: 'google_maps',
        },
      })
    : null;
  const customerReviewsMetaobject =
    page.customerReviews?.reference ??
    page.customerReviews?.references?.nodes?.[0] ??
    null;
  const customerReviewsHeroMetaobject = page.erfahrungenHero?.reference ?? null;
  const customerReviewsStepsMetaobject =
    page.erfahrungenSteps?.reference ?? null;
  const languageSwitchLinks = await resolveResourceLanguageSwitchLinks({
    storefront: context.storefront,
    request,
    resourceId: page.id,
    resourceType: 'Page',
  });

  return {
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
    languageSwitchLinks,
    faqCategories: parseFAQMetaobjects(faqMetaobjects),
    faqCopy: getFAQCopy(request),
    kontakt: parseKontaktPageDetails(kontaktMetaobjects),
    customerReviewsHero: parseCustomerReviewsHeroMetaobject(
      customerReviewsHeroMetaobject,
    ),
    customerReviews: parseCustomerReviewsMetaobject(customerReviewsMetaobject),
    customerReviewsSectionTitle: parseCustomerReviewsSectionTitle(
      customerReviewsMetaobject,
    ),
    customerReviewsSteps: parseCustomerReviewsStepsMetaobject(
      customerReviewsStepsMetaobject,
    ),
    page: {
      ...page,
      body: sanitizeShopifyPageHtml(page.body),
    },
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData(_: Route.LoaderArgs) {
  return {};
}

export default function Page() {
  const {
    canonicalUrl,
    customerReviews,
    customerReviewsHero,
    customerReviewsSectionTitle,
    customerReviewsSteps,
    faqCategories,
    faqCopy,
    kontakt,
    page,
  } = useLoaderData<typeof loader>();
  const breadcrumbItems = buildContentBreadcrumbItems({
    canonicalUrl,
    currentName: page.title,
  });
  const breadcrumbJsonLd = buildBreadcrumbStructuredData(breadcrumbItems);
  const breadcrumbContent = (
    <>
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: stringifyJsonLd(breadcrumbJsonLd)}}
        />
      ) : null}
      <div className="breadcrumb-container container mx-auto">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
    </>
  );

  if (isKontaktPage(page)) {
    const kontaktJsonLd = buildKontaktJsonLd(page.title, canonicalUrl, kontakt);

    return (
      <>
        {breadcrumbContent}
        {kontaktJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: stringifyJsonLd(kontaktJsonLd)}}
          />
        ) : null}
        <Suspense
          fallback={
            <main className="kontakt-page" aria-busy="true">
              <div className="kontakt-page__hero container mx-auto" />
            </main>
          }
        >
          <Kontakt title={page.title} data={kontakt} />
        </Suspense>
      </>
    );
  }

  if (isFaqPage(page)) {
    const faqJsonLd = buildFAQJsonLd(faqCategories);

    return (
      <>
        {breadcrumbContent}
        {faqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: stringifyJsonLd(faqJsonLd)}}
          />
        ) : null}
        <Suspense
          fallback={
            <main className="faq-page" aria-busy="true">
              <div className="faq-page__content container mx-auto" />
            </main>
          }
        >
          <FAQ title={page.title} categories={faqCategories} copy={faqCopy} />
        </Suspense>
      </>
    );
  }

  if (isErfahrungenPage(page)) {
    return (
      <>
        {breadcrumbContent}
        <Suspense
          fallback={
            <main className="static-page" aria-busy="true">
              <div className="static-page__article container mx-auto" />
            </main>
          }
        >
          <CustomerReviewsPage
            hero={customerReviewsHero}
            reviews={customerReviews}
            reviewsSectionTitle={customerReviewsSectionTitle}
            steps={customerReviewsSteps}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      {breadcrumbContent}
      <main className="static-page">
        <article className="static-page__article container mx-auto">
          <header className="static-page__header">
            <h1 className="static-page__title">{page.title}</h1>
          </header>
          <div
            className="static-page__content"
            dangerouslySetInnerHTML={{__html: page.body}}
          />
        </article>
      </main>
    </>
  );
}

const KONTAKT_QUERY = `#graphql
  query KontaktPageDetails(
    $language: LanguageCode
    $country: CountryCode
    $kontaktType: String!
    $addressKey: String!
    $mobileKey: String!
    $mailKey: String!
    $linksKey: String!
    $googleMapsKey: String!
  )
  @inContext(language: $language, country: $country) {
    kontaktPageDetails: metaobjects(first: 1, type: $kontaktType) {
      nodes {
        address: field(key: $addressKey) {
          value
        }
        mobile: field(key: $mobileKey) {
          value
        }
        mail: field(key: $mailKey) {
          value
        }
        links: field(key: $linksKey) {
          references(first: 50) {
            nodes {
              ... on Page {
                id
                handle
                title
              }
            }
          }
        }
        googleMaps: field(key: $googleMapsKey) {
          value
        }
      }
    }
  }
` as const;

const FAQ_QUERY = `#graphql
  query FAQ(
    $language: LanguageCode
    $country: CountryCode
    $faqCategoryType: String!
    $faqItemType: String!
    $titleKey: String!
    $orderKey: String!
    $questionKey: String!
    $answerKey: String!
    $categoryKey: String!
  )
  @inContext(language: $language, country: $country) {
    faqCategories: metaobjects(first: 250, type: $faqCategoryType) {
      nodes {
        id
        title: field(key: $titleKey) {
          value
        }
        order: field(key: $orderKey) {
          value
        }
      }
    }
    faqItems: metaobjects(first: 250, type: $faqItemType) {
      nodes {
        id
        question: field(key: $questionKey) {
          value
        }
        answer: field(key: $answerKey) {
          value
        }
        category: field(key: $categoryKey) {
          reference {
            ... on Metaobject {
              id
            }
          }
        }
        order: field(key: $orderKey) {
          value
        }
      }
    }
  }
` as const;

const PAGE_QUERY = `#graphql
  fragment CustomerReviewsPageMetaobject on Metaobject {
    id
    handle
    type
      fields {
        key
        value
        type
        reference {
          ... on MediaImage {
            id
            image {
              url
              altText
              width
              height
            }
          }
          ... on GenericFile {
            id
            url
          }
        }
        references(first: 50) {
        nodes {
          ... on MediaImage {
            id
            image {
              url
              altText
              width
              height
            }
          }
          ... on GenericFile {
            id
            url
          }
        }
      }
    }
  }

  query Page(
    $language: LanguageCode,
    $country: CountryCode,
    $handle: String!
  )
  @inContext(language: $language, country: $country) {
    page(handle: $handle) {
      handle
      id
      title
      body
      pageType: metafield(namespace: "custom", key: "page_type") {
        value
      }
      erfahrungenHero: metafield(
        namespace: "custom"
        key: "erfahrungen_hero"
      ) {
        type
        reference {
          ...CustomerReviewsPageMetaobject
        }
      }
      customerReviews: metafield(
        namespace: "custom"
        key: "reviews_page_comments"
      ) {
        type
        reference {
          ...CustomerReviewsPageMetaobject
        }
        references(first: 5) {
          nodes {
            ...CustomerReviewsPageMetaobject
          }
        }
      }
      erfahrungenSteps: metafield(
        namespace: "custom"
        key: "erfahrungen_steps"
      ) {
        type
        reference {
          ...CustomerReviewsPageMetaobject
        }
      }
      seo {
        description
        title
      }
    }
  }
` as const;
