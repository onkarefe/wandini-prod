import {Await, useLoaderData} from 'react-router';
import type { Route } from './+types/_index';
import { Suspense } from 'react';
import { Image } from '@shopify/hydrogen';
import {Link} from '~/lib/i18n-router';
import type {
  FeaturedCollectionFragment,
  RecommendedProductsQuery,
} from 'storefrontapi.generated';
import { ProductItem } from '~/components/ProductItem';
import HeroSection from '~/components/HeroSection';
import UspBar from '~/components/UspBar';
import AllProduts from '~/components/AllProduts';
import CustomGrid from '~/components/CustomGrid';
import CustomOrder from '~/components/CustomOrder';
import CustomerRevs from '~/components/CustomerRevs';
import homepageStyles from '~/styles/homepage.css?url';

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Hydrogen | Home' }];
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
async function loadCriticalData({ context }: Route.LoaderArgs) {
  const [{ collections }, heroRes, uspRes, allProductsRes] = await Promise.all([
    context.storefront.query(FEATURED_COLLECTION_QUERY),
    context.storefront.query(HERO_QUERY),
    context.storefront.query(USPBAR_QUERY),
    context.storefront.query(GET_ALL_PRODUCTS_METAOBJECT_QUERY),
  ]);

  const nodes = heroRes?.metaobjects?.nodes ?? [];
  const heroNode =
    nodes.find((n: any) => n.handle === 'main') ?? // ← handle’ını farklı verdiysen burayı değiştir
    nodes[0] ??
    null;

  const heroMap = Object.fromEntries(
    (heroNode?.fields ?? []).map((f: any) => [
      f.key,
      // MediaImage.image || GenericFile.url || plain value
      f.reference?.image ?? (f.reference?.url ? { url: f.reference.url } : f.value),
    ]),
  );

  const hero = {
    title: heroMap.title ?? '',
    st1: heroMap.st1 ?? '',
    st2: heroMap.st2 ?? '',
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

  // --- all_products metaobject (map into typed array)
  // GET_ALL_PRODUCTS_METAOBJECT_QUERY returns edges[].node.fields[]
  type ProductGroup = {
    id: string;
    title?: string;
    subtitle?: string;
    image?: { url: string; altText?: string; width?: number; height?: number } | null;
    link?: string;
  };

  let allProducts: Array<{
    id: string;
    title: string;
    subtitle: string;
    image: { url: string; altText?: string; width?: number; height?: number } | null;
    link: string;
  }> = [];

  const allProductsNode = allProductsRes?.metaobjects?.edges?.[0]?.node;
  if (allProductsNode && Array.isArray(allProductsNode.fields)) {
    const groups: Record<string, ProductGroup> = {};
    for (const f of allProductsNode.fields) {
      const key = String(f.key || '');
      const m = key.match(/^prod(\d+)_(img|title|subtitle|link)$/i);
      if (!m) continue;
      const idx = m[1];
      const type = m[2].toLowerCase();
      const id = `prod${idx}`;
      groups[id] = groups[id] ?? { id };
      if (type === 'img') {
        const img = normalizeReferenceImage(f.reference, f.value ?? '');
        if (img) {
          groups[id].image = {
            url: img.url,
            altText: img.altText ?? '',
            width: img.width ?? undefined,
            height: img.height ?? undefined,
          };
        }
      } else if (type === 'title') {
        groups[id].title = f.value ?? '';
      } else if (type === 'subtitle') {
        groups[id].subtitle = f.value ?? '';
      } else if (type === 'link') {
        groups[id].link = f.value ?? '';
      }
    }
    allProducts = Object.keys(groups)
      .sort((a, b) => parseInt(a.replace('prod', ''), 10) - parseInt(b.replace('prod', ''), 10))
      .map((id) => {
        const g = groups[id];
        return {
          id,
          title: g.title ?? '',
          subtitle: g.subtitle ?? '',
          image: g.image ?? null,
          link: g.link ?? '',
        };
      });
  }

  return {
    hero,
    featuredCollection: collections.nodes[0],
    uspItems,
    uspNode,
    allProducts,
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
  return (
    <div className="home">
      <HeroSection
        title={data.hero.title}
        st1={data.hero.st1}
        st2={data.hero.st2}
        backgroundImage={data.hero.backgroundImage}
      />
      <UspBar items={data.uspItems} node={data.uspNode} />
      <AllProduts items={data.allProducts ?? []} />
      <CustomGrid />
      <CustomOrder />
      <CustomerRevs />
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
  return (
    <div className="recommended-products">
      <h2>Recommended Products</h2>
      <Suspense fallback={<div>Loading...</div>}>
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
  query HeroSections {
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
          }
        }
      }
    }
  }
` as const;

// usp query
const USPBAR_QUERY = `#graphql
  query UspBarMetaobjects {
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
  query UspBarIcons($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on MediaImage {
        id
        image { url altText width height }
      }
    }
  }
` as const;

//all products query

export const GET_ALL_PRODUCTS_METAOBJECT_QUERY = `#graphql
  query GetAllProductsMetaobject {
    metaobjects(type: "all_products", first: 15) {
      edges {
        node {
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
