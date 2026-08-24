import {useLoaderData} from 'react-router';
import {lazy, Suspense} from 'react';
import type {Route} from './+types/pages.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import staticPagesStyles from '~/styles/staticPages.css?url';
import {getRobotsDirective} from '~/lib/seo';
import type {
  FAQCategory,
  FAQContactActionData,
  FAQCopy,
} from '~/components/FAQ';
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
const PAGE_META_DESCRIPTION_MAX_LENGTH = 160;
const ERFAHRUNGEN_PAGE_TYPE = 'erfahrungen';
const FAQ_PAGE_TYPE = 'faq';

const FAQ = lazy(() => import('~/components/FAQ'));

const CustomerReviewsPage = lazy(
  () => import('~/components/customer-reviews-page'),
);

type PageMetaInput = {
  title?: string | null;
  body?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
};

type PageWithType = {
  pageType?: {value?: string | null} | null;
};

function isErfahrungenPage(page?: PageWithType | null) {
  return page?.pageType?.value?.trim().toLowerCase() === ERFAHRUNGEN_PAGE_TYPE;
}

function isFaqPage(page?: PageWithType | null) {
  return page?.pageType?.value?.trim().toLowerCase() === FAQ_PAGE_TYPE;
}

const FAQ_COPY: FAQCopy = {
  contactEyebrow: 'Kontakt',
  contactTitle: 'Ihre Frage ist noch offen?',
  contactDescription:
    'Schreiben Sie uns. Unser Team hilft Ihnen persönlich und zuverlässig weiter.',
  fullNameLabel: 'Vor- und Nachname',
  emailLabel: 'E-Mail-Adresse',
  phoneLabel: 'Telefonnummer',
  questionLabel: 'Ihre Frage',
  submitLabel: 'Frage senden',
  submittingLabel: 'Wird gesendet…',
};

const FAQ_ACTION_MESSAGES = {
  required: 'Bitte füllen Sie dieses Feld aus.',
  invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  invalidQuestion: 'Ihre Frage muss mindestens 10 Zeichen enthalten.',
  success: 'Vielen Dank. Ihre Frage wurde erfolgreich gesendet.',
  error:
    'Ihre Frage konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.',
} as const;

function normalizeMetaText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMetaDescription(value: string) {
  if (value.length <= PAGE_META_DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  const clipped = value.slice(0, PAGE_META_DESCRIPTION_MAX_LENGTH + 1);
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const truncated =
    lastSpaceIndex > 80
      ? clipped.slice(0, lastSpaceIndex)
      : clipped.slice(0, PAGE_META_DESCRIPTION_MAX_LENGTH);

  return `${truncated.trim()}...`;
}

function getPageMetaTitle(page?: PageMetaInput | null) {
  const seoTitle = normalizeMetaText(page?.seo?.title);

  if (seoTitle) {
    return seoTitle;
  }

  const pageTitle = normalizeMetaText(page?.title);

  if (!pageTitle) {
    return PAGE_META_BRAND;
  }

  return pageTitle.toLowerCase().includes(PAGE_META_BRAND.toLowerCase())
    ? pageTitle
    : `${pageTitle} | ${PAGE_META_BRAND}`;
}

function getPageMetaDescription(page?: PageMetaInput | null) {
  const description =
    normalizeMetaText(page?.seo?.description) || normalizeMetaText(page?.body);

  return description ? truncateMetaDescription(description) : null;
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

  return description ? truncateMetaDescription(description) : null;
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
  return [{rel: 'stylesheet', href: staticPagesStyles}];
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const page = data?.page;
  const title = getPageMetaTitle(page);
  const description =
    getPageMetaDescription(page) ||
    (isFaqPage(page)
      ? getFAQMetaDescription(page?.title, data?.faqCategories ?? [])
      : null);
  const canonicalUrl = data?.canonicalUrl ?? `/pages/${params.handle ?? ''}`;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {name: 'robots', content: getRobotsDirective()},
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    ...(description
      ? [{property: 'og:description', content: description}]
      : []),
    {property: 'og:url', content: canonicalUrl},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    ...(description
      ? [{name: 'twitter:description', content: description}]
      : []),
  ];
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

export async function action({
  context,
  request,
}: Route.ActionArgs): Promise<Response> {
  const messages = FAQ_ACTION_MESSAGES;

  if (request.method !== 'POST') {
    return Response.json({ok: false, message: messages.error}, {status: 405});
  }

  const formData = await request.formData();
  if (readFAQFormValue(formData, 'intent') !== 'faq-contact') {
    return Response.json({ok: false, message: messages.error}, {status: 400});
  }

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
  const fieldErrors: NonNullable<FAQContactActionData['fieldErrors']> = {};

  if (fullName.length < 2 || fullName.length > 120) {
    fieldErrors.fullName = messages.required;
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = messages.invalidEmail;
  }
  if (!phone || phone.length > 40) {
    fieldErrors.phone = messages.required;
  }
  if (question.length < 10 || question.length > 3000) {
    fieldErrors.question = messages.invalidQuestion;
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
    'contact[body]': question,
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
  const url = new URL(request.url);
  const customerReviewsMetaobject =
    page.customerReviews?.reference ??
    page.customerReviews?.references?.nodes?.[0] ??
    null;
  const customerReviewsHeroMetaobject = page.erfahrungenHero?.reference ?? null;
  const customerReviewsStepsMetaobject =
    page.erfahrungenSteps?.reference ?? null;

  return {
    canonicalUrl: `${url.origin}${url.pathname}`,
    faqCategories: parseFAQMetaobjects(faqMetaobjects),
    faqCopy: FAQ_COPY,
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
    customerReviews,
    customerReviewsHero,
    customerReviewsSectionTitle,
    customerReviewsSteps,
    faqCategories,
    faqCopy,
    page,
  } = useLoaderData<typeof loader>();

  if (isFaqPage(page)) {
    const faqJsonLd = buildFAQJsonLd(faqCategories);

    return (
      <>
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
    );
  }

  return (
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
  );
}

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
