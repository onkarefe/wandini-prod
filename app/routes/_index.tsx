import {useLoaderData, useRouteLoaderData} from 'react-router';
import type { Route } from './+types/_index';
import type {RootLoader} from '~/root';
import HeroSection from '~/components/HeroSection';
import UspBar from '~/components/UspBar';
import AllProdutsNew, {
  type BestsellerProduct,
} from '~/components/AllProdutsNew';
import CustomGrid, {type CustomGridItem} from '~/components/CustomGrid';
import CustomOrder from '~/components/CustomOrder';
import ExampleSetHomepage from '~/components/ExampleSetHomepage';
import UberUnsHomepage from '~/components/UberUnsHomepage';
import CustomerRevs from '~/components/CustomerRevs';
import homepageStyles from '~/styles/homepage.css?url';
import {
  buildCanonicalUrl,
  buildFixedSeoAlternateUrls,
  buildSeoMetadata,
} from '~/lib/seo';
import {createTranslator} from '~/i18n';
import {getLocaleFromI18n} from '~/lib/locale';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import {loadShopifySeoPage} from '~/lib/shopify-marketing-seo.server';
import {
  getShopifyGlobalSeoSettingsFromMatches,
  resolveShopifyMarketingSeo,
} from '~/lib/shopify-marketing-seo';
import {
  buildOnlineStoreJsonLd,
  buildWebsiteJsonLd,
} from '~/lib/store-schema';

type HomepageImageLike = {
  url?: string | null;
};

type HomepageHeroInput = {
  title?: string | null;
  st1?: string | null;
  st2?: string | null;
  buttonText?: string | null;
  buttonAction?: string | null;
  backgroundImage?: HomepageImageLike | string | null;
};

function getHomepageMetaDescription(hero?: HomepageHeroInput | null) {
  return [hero?.st1, hero?.st2].filter(Boolean).join(' ');
}

function getHomepageImageUrl(hero?: HomepageHeroInput | null) {
  const backgroundImage = hero?.backgroundImage;

  if (backgroundImage && typeof backgroundImage === 'object') {
    return backgroundImage.url ?? null;
  }

  return typeof backgroundImage === 'string' && /^https?:\/\//i.test(backgroundImage)
    ? backgroundImage
    : null;
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data, matches}) => {
  const marketingSeo = resolveShopifyMarketingSeo({
    settings: getShopifyGlobalSeoSettingsFromMatches(matches),
    page: data?.shopifySeoPage,
    fallbackTitle: data?.hero?.title,
    fallbackDescription: getHomepageMetaDescription(data?.hero),
    fallbackImage: getHomepageImageUrl(data?.hero),
  });

  return buildSeoMetadata({
    title: {explicit: marketingSeo.title},
    description: marketingSeo.description
      ? {explicit: marketingSeo.description}
      : undefined,
    canonicalUrl: data?.canonicalUrl ?? '/',
    alternates: buildFixedSeoAlternateUrls(data?.canonicalUrl ?? '/', '/'),
    robots: marketingSeo.noindex ? 'noindex,follow' : 'index,follow',
    image: marketingSeo.image,
    openGraph: {
      title: marketingSeo.openGraphTitle,
      description: marketingSeo.openGraphDescription,
      image: marketingSeo.image,
    },
  });
};

export function links() {
  return [{ rel: 'stylesheet', href: homepageStyles }];
}

export async function loader(args: Route.LoaderArgs) {
  // Keep CMS-dependent section heights in the initial HTML. Null Suspense
  // fallbacks would move subsequent sections and the footer when data arrives.
  const [criticalData, shopifySeoPage] = await Promise.all([
    loadCriticalData(args),
    loadShopifySeoPage(args.context.storefront, 'homepage'),
  ]);

  return { ...criticalData, shopifySeoPage };
}

function safeJsonArray(input: unknown): string[] {
  if (typeof input !== 'string') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeJsonUnknownArray(input: unknown): unknown[] {
  if (typeof input !== 'string') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonValue(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

type MetaobjectImageLike = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
};

function normalizeReferenceImage(
  reference: unknown,
  fallbackAltText?: string,
): MetaobjectImageLike | null {
  if (!reference || typeof reference !== 'object') {
    return null;
  }

  const imageReference =
    'image' in reference &&
    reference.image &&
    typeof reference.image === 'object' &&
    'url' in reference.image &&
    typeof reference.image.url === 'string'
      ? (reference.image as {
          url: string;
          altText?: unknown;
          width?: unknown;
          height?: unknown;
        })
      : null;

  if (imageReference) {
    return {
      url: imageReference.url,
      altText:
        'altText' in imageReference && typeof imageReference.altText === 'string'
          ? imageReference.altText
          : undefined,
      width:
        'width' in imageReference && typeof imageReference.width === 'number'
          ? imageReference.width
          : undefined,
      height:
        'height' in imageReference && typeof imageReference.height === 'number'
          ? imageReference.height
          : undefined,
    };
  }

  if ('url' in reference && typeof reference.url === 'string') {
    return {
      url: reference.url,
      altText: fallbackAltText,
    };
  }

  return null;
}

/**
 * Keep every active section in SSR because CMS content determines its height.
 * Hero and USP data are required; optional sections use their existing empty states.
 */
async function loadCriticalData({ context, request }: Route.LoaderArgs) {
  const t = createTranslator(getLocaleFromI18n(context.storefront.i18n));
  const [
    heroRes,
    uspItems,
    bestsellerRes,
    customGridRes,
    stepByStepRes,
    exampleSetHomepageRes,
    uberUnsRes,
    customerReviewsRes,
  ] = await Promise.all([
    context.storefront.query(HERO_QUERY, {
      cache: context.storefront.CacheLong(),
    }),
    loadUspItems(context),
    // Preserve the default product cache policy for bestseller prices.
    context.storefront.query(BESTSELLER_PRODUCTS_QUERY)
      .catch(homepageSectionFallback),
    context.storefront.query(CUSTOM_GRID_QUERY, {
      cache: context.storefront.CacheLong(),
    }).catch(homepageSectionFallback),
    context.storefront.query(STEP_BY_STEP_QUERY, {
      cache: context.storefront.CacheLong(),
    }).catch(homepageSectionFallback),
    context.storefront.query(EXAMPLE_SET_HOMEPAGE_QUERY, {
      cache: context.storefront.CacheLong(),
    }).catch(homepageSectionFallback),
    context.storefront.query(UBER_UNS_QUERY, {
      cache: context.storefront.CacheLong(),
    }).catch(homepageSectionFallback),
    context.storefront.query(CUSTOMER_REVIEWS_QUERY, {
      cache: context.storefront.CacheLong(),
    }).catch(homepageSectionFallback),
  ]);

  const nodes = heroRes?.metaobjects?.nodes ?? [];
  const heroNode =
    nodes.find((n: any) => n.handle === 'main') ?? // ← handle’ını farklı verdiysen burayı değiştir
    nodes[0] ??
    null;

  const heroMap = Object.fromEntries(
    (heroNode?.fields ?? []).map((f: any) => [
      f.key,
      // MediaImage.image || Collection route || GenericFile.url || plain value
      f.reference?.image ??
        (f.reference?.handle
          ? `/collections/${f.reference.handle}`
          : f.reference?.url
            ? {url: f.reference.url}
            : f.value),
    ]),
  );

  const hero = {
    title: heroMap.title ?? '',
    st1: heroMap.st1 ?? '',
    st2: heroMap.st2 ?? '',
    buttonText: heroMap.button_text ?? '',
    buttonAction: heroMap.button_action ?? '',
    backgroundImage: heroMap.background ?? null,
  };

  const bestsellerCollection = bestsellerRes?.collection ?? null;
  const bestsellerProducts: BestsellerProduct[] =
    bestsellerCollection?.products.nodes ?? [];
  const bestsellerSectionTitle =
    bestsellerCollection?.title ?? t('home.bestSelling');

  const customGridNode = customGridRes?.metaobjects?.nodes?.[0];
  const customGridFields = Array.isArray(customGridNode?.fields)
    ? customGridNode.fields
    : [];
  const customGridFieldMap = Object.fromEntries(
    customGridFields.map((field) => [field.key, field]),
  );
  const customGridSectionTitle =
    customGridFieldMap.section_title?.value ?? '';
  const customGridTitles = safeJsonArray(customGridFieldMap.titles?.value);
  const customGridButtonTexts = safeJsonArray(
    customGridFieldMap.button_text?.value,
  );
  const customGridLinks =
    customGridFieldMap.links?.references?.nodes?.filter(Boolean) ?? [];
  const customGridImages =
    customGridFieldMap.background_images?.references?.nodes?.filter(Boolean) ??
    [];

  const customGridItems: CustomGridItem[] = Array.from({length: 6})
    .map((_, index) => {
      const linkReference = customGridLinks[index];
      const collectionHandle =
        linkReference &&
        typeof linkReference === 'object' &&
        'handle' in linkReference &&
        typeof linkReference.handle === 'string'
          ? linkReference.handle
          : null;
      const image = normalizeReferenceImage(
        customGridImages[index],
        customGridTitles[index] ?? '',
      );

      return {
        id: `custom-grid-${index + 1}`,
        title: customGridTitles[index] ?? '',
        image,
        link: collectionHandle ? `/collections/${collectionHandle}` : '',
        buttonText: customGridButtonTexts[index] ?? '',
      };
    })
    .filter((item) => item.title || item.image || item.link);

  const stepByStepNode = stepByStepRes?.metaobjects?.nodes?.[0];
  const stepByStepFields = Array.isArray(stepByStepNode?.fields)
    ? stepByStepNode.fields
    : [];
  const stepByStepFieldMap = Object.fromEntries(
    stepByStepFields.map((field) => [field.key, field]),
  );
  const stepTitles = safeJsonArray(stepByStepFieldMap.box_title?.value);
  const stepDescriptions = safeJsonArray(
    stepByStepFieldMap.box_description?.value,
  );
  const stepImageReferences =
    stepByStepFieldMap.image?.references?.nodes?.filter(Boolean) ?? [];
  const stepCount = Math.min(
    4,
    Math.max(
      stepTitles.length,
      stepDescriptions.length,
      stepImageReferences.length,
    ),
  );
  const steps = Array.from({length: stepCount}).map((_, index) => ({
    id: `step-by-step-${index + 1}`,
    title: stepTitles[index] ?? '',
    description: stepDescriptions[index] ?? '',
    image:
      normalizeReferenceImage(
        stepImageReferences[index],
        stepTitles[index] ?? '',
      ) ?? null,
  }));

  const bulletTexts = safeJsonArray(stepByStepFieldMap.bullets?.value);
  const bulletIconReferences =
    stepByStepFieldMap.bullet_icons?.references?.nodes?.filter(Boolean) ?? [];
  const bulletCount = Math.min(
    4,
    Math.max(bulletTexts.length, bulletIconReferences.length),
  );
  const bullets = Array.from({length: bulletCount}).map((_, index) => ({
    id: `step-by-step-bullet-${index + 1}`,
    text: bulletTexts[index] ?? '',
    icon:
      normalizeReferenceImage(
        bulletIconReferences[index],
        bulletTexts[index] ?? '',
      ) ?? null,
  }));

  const ctaActionReference = stepByStepFieldMap.cta_action?.reference;
  const ctaCollectionHandle =
    ctaActionReference &&
    typeof ctaActionReference === 'object' &&
    'handle' in ctaActionReference &&
    typeof ctaActionReference.handle === 'string'
      ? ctaActionReference.handle
      : null;
  const stepByStep = {
    mainTitle: stepByStepFieldMap.main_title?.value ?? '',
    mainDescription: stepByStepFieldMap.main_description?.value ?? '',
    ctaText: stepByStepFieldMap.cta_buton?.value ?? '',
    ctaLink: ctaCollectionHandle
      ? `/collections/${ctaCollectionHandle}`
      : '',
    steps,
    bullets,
  };

  const exampleSetHomepageNode = exampleSetHomepageRes?.metaobjects?.nodes?.[0];
  const exampleSetHomepageFields = Array.isArray(exampleSetHomepageNode?.fields)
    ? exampleSetHomepageNode.fields
    : [];
  const exampleSetHomepageFieldMap = Object.fromEntries(
    exampleSetHomepageFields.map((field) => [field.key, field]),
  );
  const exampleSetHomepageTitle = exampleSetHomepageFieldMap.title?.value ?? '';
  const exampleSetHomepageCtaAction =
    exampleSetHomepageFieldMap.cta_action?.reference;
  const exampleSetHomepage = {
    title: exampleSetHomepageTitle,
    subdesc1: exampleSetHomepageFieldMap.subdesc1?.value ?? '',
    subdesc2: exampleSetHomepageFieldMap.subdesc2?.value ?? '',
    ctaText: exampleSetHomepageFieldMap.cta_text?.value ?? '',
    ctaAction:
      exampleSetHomepageCtaAction &&
      typeof exampleSetHomepageCtaAction === 'object' &&
      'handle' in exampleSetHomepageCtaAction
        ? exampleSetHomepageCtaAction
        : null,
    image:
      normalizeReferenceImage(
        exampleSetHomepageFieldMap.image?.reference,
        exampleSetHomepageTitle,
      ) ?? null,
  };

  const uberUnsNode = uberUnsRes?.metaobjects?.nodes?.[0];
  const uberUnsFields = Array.isArray(uberUnsNode?.fields)
    ? uberUnsNode.fields
    : [];
  const uberUnsFieldMap = Object.fromEntries(
    uberUnsFields.map((field: any) => [field.key, field]),
  );
  const uberUnsSectionTitle = uberUnsFieldMap.section_title?.value ?? '';
  const uberUnsImageField =
    uberUnsFieldMap.section_image ?? uberUnsFieldMap.section_i_mage;
  const uberUns = {
    sectionTitle: uberUnsSectionTitle,
    sectionContent: uberUnsFieldMap.section_content?.value ?? '',
    sectionImage:
      normalizeReferenceImage(
        uberUnsImageField?.reference,
        uberUnsSectionTitle,
      ) ?? null,
  };

  const customerReviewsNode = customerReviewsRes?.metaobjects?.nodes?.[0];
  const customerReviewsFields = Array.isArray(customerReviewsNode?.fields)
    ? customerReviewsNode.fields
    : [];
  const customerReviewsFieldMap = Object.fromEntries(
    customerReviewsFields.map((field: any) => [field.key, field]),
  );
  const customerReviewsSectionTitle =
    customerReviewsFieldMap.section_title?.value ?? '';
  const customerNames = safeJsonArray(
    customerReviewsFieldMap.customer_name?.value,
  );
  const customerComments = safeJsonArray(
    customerReviewsFieldMap.customer_comment?.value,
  );
  const customerCommentTitles = safeJsonArray(
    customerReviewsFieldMap.comment_title?.value,
  );
  const customerImages =
    customerReviewsFieldMap.image?.references?.nodes?.filter(Boolean) ?? [];
  const customerStars = safeJsonUnknownArray(
    customerReviewsFieldMap.stars?.value,
  ).map(parseMaybeJsonValue);
  const customerReviewCount = Math.max(
    customerNames.length,
    customerComments.length,
    customerCommentTitles.length,
    customerImages.length,
    customerStars.length,
  );
  const customerReviews = Array.from({length: customerReviewCount})
    .map((_, index) => ({
      id: `customer-review-${index + 1}`,
      customerName: customerNames[index] ?? '',
      customerComment: customerComments[index] ?? '',
      commentTitle: customerCommentTitles[index] ?? '',
      image:
        normalizeReferenceImage(
          customerImages[index],
          customerNames[index] ?? '',
        ) ?? null,
      stars: customerStars[index] ?? null,
    }))
    .filter(
      (review) =>
        review.customerName ||
        review.customerComment ||
        review.commentTitle ||
        review.image ||
        review.stars,
    );

  return {
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
    hero,
    uspItems,
    bestsellerProducts,
    bestsellerSectionTitle,
    customGridItems,
    customGridSectionTitle,
    stepByStep,
    exampleSetHomepage,
    uberUns,
    customerReviews,
    customerReviewsSectionTitle,
  };
}

function homepageSectionFallback(error: unknown) {
  console.error('Homepage section unavailable', error);
  return null;
}

async function loadUspItems(context: Route.LoaderArgs['context']) {
  const uspRes = await context.storefront.query(USPBAR_QUERY, {
    cache: context.storefront.CacheLong(),
  });
  const uspNodes = uspRes?.metaobjects?.nodes ?? [];
  const uspNode =
    uspNodes.find((node) => node.handle === 'main' || node.handle === 'homepage') ??
    uspNodes[0] ??
    null;
  const uspMap = Object.fromEntries(
    (uspNode?.fields ?? []).map((field) => [field.key, field.value]),
  );
  const titles = safeJsonArray(uspMap.usp_titles);
  const subtitles = safeJsonArray(uspMap.usp_subtitles ?? uspMap.ust_subtitles);
  const iconIds = safeJsonArray(uspMap.usp_icons);
  const count = Math.min(titles.length, subtitles.length, iconIds.length);
  if (!count) return [];

  // Start the dependent lookup as soon as USP data arrives, independently of
  // slower homepage sections. Fetch each displayed ID once; retain CMS order.
  const iconsRes = await context.storefront.query(USPBAR_ICONS_QUERY, {
    cache: context.storefront.CacheLong(),
    variables: {ids: [...new Set(iconIds.slice(0, count))]},
  }).catch(homepageSectionFallback);
  const imagesById = new Map(
    (iconsRes?.nodes ?? []).flatMap((node) =>
      node && 'id' in node && 'image' in node ? [[node.id, node.image] as const] : [],
    ),
  );
  return Array.from({length: count}, (_, index) => ({
    icon: imagesById.get(iconIds[index]) ?? null,
    title: titles[index] ?? '',
    subtitle: subtitles[index] ?? '',
  }));
}

export default function Homepage() {
  const data = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const shop = rootData?.header?.shop;
  const websiteJsonLd = buildWebsiteJsonLd({
    canonicalUrl: data.canonicalUrl,
    name: shop?.name,
  });
  const onlineStoreJsonLd = buildOnlineStoreJsonLd({
    canonicalUrl: data.canonicalUrl,
    name: shop?.name,
    logo: shop?.brand?.logo?.image?.url,
  });

  return (
    <div className="home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(websiteJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(onlineStoreJsonLd)}}
      />
      {!data.hero.title?.trim() ? <h1 className="sr-only">{shop?.name || 'Wandini'}</h1> : null}
      <HeroSection
        title={data.hero.title}
        st1={data.hero.st1}
        st2={data.hero.st2}
        buttonText={data.hero.buttonText}
        buttonAction={data.hero.buttonAction}
        backgroundImage={data.hero.backgroundImage}
      />
      <UspBar items={data.uspItems} />
      <AllProdutsNew
        products={data.bestsellerProducts ?? []}
        sectionTitle={data.bestsellerSectionTitle}
      />
      <CustomGrid
        items={data.customGridItems ?? []}
        sectionTitle={data.customGridSectionTitle}
      />
      <CustomOrder content={data.stepByStep} />
      <ExampleSetHomepage content={data.exampleSetHomepage} />
      <UberUnsHomepage content={data.uberUns} />
      <CustomerRevs
        reviews={data.customerReviews ?? []}
        sectionTitle={data.customerReviewsSectionTitle}
      />
    </div>
  );
}

// --- HERO METAOBJECT QUERY ---
const HERO_QUERY = `#graphql
  query HeroSections($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "hero_div", first: 10) {
      nodes {
        handle
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
            ... on GenericFile {
              url
            }
            ... on Collection {
              handle
            }
          }
        }
      }
    }
  }
` as const;

// usp query
const USPBAR_QUERY = `#graphql
  query UspBarMetaobjects($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "uspbar", first: 5) {
      nodes {
        handle
        fields {
          key
          value
        }
      }
    }
  }
` as const;

const USPBAR_ICONS_QUERY = `#graphql
  query UspBarIcons($country: CountryCode, $ids: [ID!]!, $language: LanguageCode) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on MediaImage {
        id
        image {
          url
          altText
          width
          height
        }
      }
    }
  }
` as const;

const BESTSELLER_PRODUCTS_QUERY = `#graphql
  query BestsellerProductsHomepage($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    collection(handle: "bestseller") {
      title
      products(first: 6) {
        nodes {
          id
          handle
          title
          images(first: 2) {
            nodes {
              id
              url
              altText
              width
              height
            }
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
` as const;

const CUSTOM_GRID_QUERY = `#graphql
  query CustomGridMetaobjects($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "custom_grid", first: 1) {
      nodes {
        fields {
          key
          value
          references(first: 6) {
            nodes {
              ... on MediaImage {
                image {
                  url
                  altText
                  width
                  height
                }
              }
              ... on GenericFile {
                url
              }
              ... on Collection {
                handle
              }
            }
          }
        }
      }
    }
  }
` as const;

const STEP_BY_STEP_QUERY = `#graphql
  query StepByStepMetaobject($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "step_by_step", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on Collection {
              handle
            }
          }
          references(first: 10) {
            nodes {
              ... on MediaImage {
                image {
                  url
                  altText
                  width
                  height
                }
              }
              ... on GenericFile {
                url
              }
            }
          }
        }
      }
    }
  }
` as const;

const EXAMPLE_SET_HOMEPAGE_QUERY = `#graphql
  query ExampleSetHomepageMetaobject($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "example_set_homepage", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
            ... on GenericFile {
              url
            }
            ... on Product {
              id
              handle
              title
            }
          }
        }
      }
    }
  }
` as const;

const UBER_UNS_QUERY = `#graphql
  query UberUnsHomepageMetaobject($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "uber_uns", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
            ... on GenericFile {
              url
            }
          }
        }
      }
    }
  }
` as const;

const CUSTOMER_REVIEWS_QUERY = `#graphql
  query CustomerReviewsMetaobject($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    metaobjects(type: "customer_reviews", first: 1) {
      nodes {
        fields {
          key
          value
          references(first: 10) {
            nodes {
              ... on MediaImage {
                image {
                  url
                  altText
                  width
                  height
                }
              }
              ... on GenericFile {
                url
              }
            }
          }
        }
      }
    }
  }
` as const;
