import {Await, useLoaderData, useRouteLoaderData} from 'react-router';
import type { Route } from './+types/_index';
import { Suspense } from 'react';
import { Image } from '@shopify/hydrogen';
import {Link} from '~/lib/i18n-router';
import type {RootLoader} from '~/root';
import type {
  FeaturedCollectionFragment,
  RecommendedProductsQuery,
} from 'storefrontapi.generated';
import { ProductItem } from '~/components/ProductItem';
import HeroSection from '~/components/HeroSection';
import UspBar from '~/components/UspBar';
import AllProdutsNew, {
  type BestsellerProduct,
} from '~/components/AllProdutsNew';
import CustomGrid, {type CustomGridItem} from '~/components/CustomGrid';
import CustomOrder from '~/components/CustomOrder';
import UberUnsHomepage from '~/components/UberUnsHomepage';
import CustomerRevs from '~/components/CustomerRevs';
import homepageStyles from '~/styles/homepage.css?url';
import {
  buildCanonicalUrl,
  buildSeoMetadata,
  normalizeSeoText as normalizeMetaText,
} from '~/lib/seo';
import {createTranslator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';
import {getLocaleFromI18n} from '~/lib/locale';

const HOMEPAGE_META_BRAND = 'Wandini';

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

type HomepageShopInput = {
  name?: string | null;
  description?: string | null;
  brand?: {
    logo?: {
      image?: {
        url?: string | null;
      } | null;
    } | null;
  } | null;
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

function getShopName(shop?: HomepageShopInput | null) {
  return normalizeMetaText(shop?.name) || HOMEPAGE_META_BRAND;
}

function getShopLogoUrl(shop?: HomepageShopInput | null) {
  return shop?.brand?.logo?.image?.url ?? null;
}

function buildWebsiteJsonLd({
  canonicalUrl,
  shop,
}: {
  canonicalUrl: string;
  shop?: HomepageShopInput | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: getShopName(shop),
    url: canonicalUrl,
  };
}

function buildOrganizationJsonLd({
  canonicalUrl,
  shop,
}: {
  canonicalUrl: string;
  shop?: HomepageShopInput | null;
}) {
  const logo = getShopLogoUrl(shop);

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: getShopName(shop),
    url: canonicalUrl,
    ...(logo ? {logo} : {}),
  };
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = ({data}) => {
  return buildSeoMetadata({
    title: {fallback: data?.hero?.title},
    description: {fallback: getHomepageMetaDescription(data?.hero)},
    canonicalUrl: data?.canonicalUrl ?? '/',
    image: getHomepageImageUrl(data?.hero),
  });
};

export function links() {
  return [{ rel: 'stylesheet', href: homepageStyles }];
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return { ...deferredData, ...criticalData };
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
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({ context, request }: Route.LoaderArgs) {
  const t = createTranslator(getLocaleFromI18n(context.storefront.i18n));
  const [
    { collections },
    heroRes,
    uspRes,
    bestsellerRes,
    customGridRes,
    stepByStepRes,
    uberUnsRes,
    customerReviewsRes,
  ] = await Promise.all([
    context.storefront.query(FEATURED_COLLECTION_QUERY),
    context.storefront.query(HERO_QUERY),
    context.storefront.query(USPBAR_QUERY),
    context.storefront.query(BESTSELLER_PRODUCTS_QUERY),
    context.storefront.query(CUSTOM_GRID_QUERY),
    context.storefront.query(STEP_BY_STEP_QUERY),
    context.storefront.query(UBER_UNS_QUERY),
    context.storefront.query(CUSTOMER_REVIEWS_QUERY),
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

  const uspNodes = uspRes?.metaobjects?.nodes ?? [];
  const uspNode =
    uspNodes.find((n: any) => n.handle === 'main' || n.handle === 'homepage') ??
    uspNodes[0] ??
    null;

  // fields -> key/value map
  const uspMap = Object.fromEntries(
    (uspNode?.fields ?? []).map((f: any) => [f.key, f.value]),
  );

  // Admin’de ‘usp_subtitles’ yerine yanlışlıkla ‘ust_subtitles’ kaydı olabilir, ikisini de dene
  const titles = safeJsonArray(uspMap.usp_titles);
  const subtitles = safeJsonArray(uspMap.usp_subtitles ?? uspMap.ust_subtitles);
  const iconIds = safeJsonArray(uspMap.usp_icons);

  // GID -> MediaImage.image çöz
  const iconsRes =
    iconIds.length > 0
      ? await context.storefront.query(USPBAR_ICONS_QUERY, {
        variables: { ids: iconIds },
      })
      : { nodes: [] };

  const imagesById: Record<string, any> = Object.fromEntries(
    (iconsRes?.nodes ?? [])
      .filter(Boolean)
      .map((n: any) => [n.id, n.image ?? null]),
  );

  // Dizileri hizala (kısaya göre kırp)
  const count = Math.min(
    titles.length || 0,
    subtitles.length || 0,
    iconIds.length || 0,
  );

  const uspItems =
    count > 0
      ? Array.from({ length: count }).map((_, i) => ({
        icon: imagesById[iconIds[i]] ?? null, // {url,altText,width,height}
        title: titles[i] ?? '',
        subtitle: subtitles[i] ?? '',
      }))
      : [];

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
    canonicalUrl: buildCanonicalUrl(request.url),
    hero,
    featuredCollection: collections.nodes[0],
    uspItems,
    uspNode,
    bestsellerProducts,
    bestsellerSectionTitle,
    customGridItems,
    customGridSectionTitle,
    stepByStep,
    uberUns,
    customerReviews,
    customerReviewsSectionTitle,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({ context }: Route.LoaderArgs) {
  const recommendedProducts = context.storefront
    .query(RECOMMENDED_PRODUCTS_QUERY)
    .catch((error: Error) => {
      // Log query errors, but don't throw them so the page can still render
      console.error(error);
      return null;
    });

  return {
    recommendedProducts,
  };
}

export default function Homepage() {
  const data = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const shop = rootData?.header?.shop;
  const websiteJsonLd = buildWebsiteJsonLd({
    canonicalUrl: data.canonicalUrl,
    shop,
  });
  const organizationJsonLd = buildOrganizationJsonLd({
    canonicalUrl: data.canonicalUrl,
    shop,
  });

  return (
    <div className="home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(websiteJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: stringifyJsonLd(organizationJsonLd)}}
      />
      <HeroSection
        title={data.hero.title}
        st1={data.hero.st1}
        st2={data.hero.st2}
        buttonText={data.hero.buttonText}
        buttonAction={data.hero.buttonAction}
        backgroundImage={data.hero.backgroundImage}
      />
      <UspBar items={data.uspItems} node={data.uspNode} />
      <AllProdutsNew
        products={data.bestsellerProducts ?? []}
        sectionTitle={data.bestsellerSectionTitle}
      />
      <CustomGrid
        items={data.customGridItems ?? []}
        sectionTitle={data.customGridSectionTitle}
      />
      <CustomOrder content={data.stepByStep} />
      <UberUnsHomepage content={data.uberUns} />
      <CustomerRevs
        reviews={data.customerReviews ?? []}
        sectionTitle={data.customerReviewsSectionTitle}
      />
    </div>
  );
}

function FeaturedCollection({
  collection,
}: {
  collection: FeaturedCollectionFragment;
}) {
  if (!collection) return null;
  const image = collection?.image;
  return (
    <Link
      className="featured-collection"
      to={`/collections/${collection.handle}`}
    >
      {image && (
        <div className="featured-collection-image">
          <Image data={image} sizes="100vw" />
        </div>
      )}
      <h1>{collection.title}</h1>
    </Link>
  );
}

function RecommendedProducts({
  products,
}: {
  products: Promise<RecommendedProductsQuery | null>;
}) {
  const {t} = useTranslation();

  return (
    <div className="recommended-products">
      <h2>{t('home.recommendedProducts')}</h2>
      <Suspense fallback={<div>{t('common.loading')}</div>}>
        <Await resolve={products}>
          {(response) => (
            <div className="recommended-products-grid">
              {response
                ? response.products.nodes.map((product) => (
                  <ProductItem key={product.id} product={product} />
                ))
                : null}
            </div>
          )}
        </Await>
      </Suspense>
      <br />
    </div>
  );
}

// --- HERO METAOBJECT QUERY ---
const HERO_QUERY = `#graphql
  query HeroSections($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    metaobjects(type: "hero_div", first: 10) {
      nodes {
        id
        handle
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image { url altText width height }
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
  query UspBarMetaobjects($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    metaobjects(type: "uspbar", first: 5) {
      nodes {
        id
        handle
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image { url altText width height }
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

const USPBAR_ICONS_QUERY = `#graphql
  query UspBarIcons(
    $country: CountryCode
    $ids: [ID!]!
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on MediaImage {
        id
        image { url altText width height }
      }
    }
  }
` as const;

const BESTSELLER_PRODUCTS_QUERY = `#graphql
  query BestsellerProductsHomepage(
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: "bestseller") {
      id
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
  query CustomGridMetaobjects($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    metaobjects(type: "custom_grid", first: 1) {
      nodes {
        id
        handle
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
            ... on Collection {
              id
              handle
              title
            }
          }
          references(first: 6) {
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
              ... on Collection {
                id
                handle
                title
              }
            }
          }
        }
      }
    }
  }
` as const;

const STEP_BY_STEP_QUERY = `#graphql
  query StepByStepMetaobject($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    metaobjects(type: "step_by_step", first: 1) {
      nodes {
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
            ... on Collection {
              id
              handle
              title
            }
          }
          references(first: 10) {
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
              ... on Collection {
                id
                handle
                title
              }
            }
          }
        }
      }
    }
  }
` as const;

const UBER_UNS_QUERY = `#graphql
  query UberUnsHomepageMetaobject(
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    metaobjects(type: "uber_uns", first: 1) {
      nodes {
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
        }
      }
    }
  }
` as const;

const CUSTOMER_REVIEWS_QUERY = `#graphql
  query CustomerReviewsMetaobject(
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    metaobjects(type: "customer_reviews", first: 1) {
      nodes {
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
          references(first: 10) {
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
    }
  }
` as const;

const FEATURED_COLLECTION_QUERY = `#graphql
  fragment FeaturedCollection on Collection {
    id
    title
    image {
      id
      url
      altText
      width
      height
    }
    handle
  }
  query FeaturedCollection($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 1, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        ...FeaturedCollection
      }
    }
  }
` as const;

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  fragment RecommendedProduct on Product {
    id
    title
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    featuredImage {
      id
      url
      altText
      width
      height
    }
  }
  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 4, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        ...RecommendedProduct
      }
    }
  }
` as const;
