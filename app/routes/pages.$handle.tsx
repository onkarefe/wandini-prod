import {useLoaderData} from 'react-router';
import type {Route} from './+types/pages.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import staticPagesStyles from '~/styles/staticPages.css?url';

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

type PageMetaInput = {
  title?: string | null;
  body?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
};

function normalizeMetaText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
  return html.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match, quote, rawStyle) => {
    const sanitizedStyle = String(rawStyle)
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\1\s*\)/gi, '')
      .replace(/-moz-binding\s*:[^;]+;?/gi, '')
      .trim();

    return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : '';
  });
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

export function links() {
  return [{rel: 'stylesheet', href: staticPagesStyles}];
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const page = data?.page;
  const title = getPageMetaTitle(page);
  const description = getPageMetaDescription(page);
  const canonicalUrl = data?.canonicalUrl ?? `/pages/${params.handle ?? ''}`;

  return [
    {title},
    ...(description ? [{name: 'description', content: description}] : []),
    {name: 'robots', content: 'index,follow'},
    {
      tagName: 'link',
      rel: 'canonical',
      href: canonicalUrl,
    },
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    ...(description ? [{property: 'og:description', content: description}] : []),
    {property: 'og:url', content: canonicalUrl},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    ...(description ? [{name: 'twitter:description', content: description}] : []),
  ];
};

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
  const url = new URL(request.url);

  return {
    canonicalUrl: `${url.origin}${url.pathname}`,
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
  const {page} = useLoaderData<typeof loader>();

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

const PAGE_QUERY = `#graphql
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
      seo {
        description
        title
      }
    }
  }
` as const;
