import type {Storefront} from '@shopify/hydrogen';
import {
  DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS,
  type ShopifyGlobalSeoSettings,
  type ShopifySeoPage,
} from './shopify-marketing-seo';

type MarketingSeoField = {
  key: string;
  value?: string | null;
  reference?: {
    __typename?: string;
    image?: {url?: string | null} | null;
  } | null;
};

type MarketingSeoMetaobject = {
  fields?: MarketingSeoField[] | null;
};

type MarketingSeoMetaobjectsQuery = {
  metaobjects?: {nodes?: MarketingSeoMetaobject[] | null} | null;
};

function getFieldMap(metaobject?: MarketingSeoMetaobject | null) {
  return new Map(
    (metaobject?.fields ?? []).map((field) => [field.key, field]),
  );
}

function getFieldText(
  fields: Map<string, MarketingSeoField>,
  key: string,
) {
  const value = fields.get(key)?.value;
  return typeof value === 'string' && value.trim() ? value : null;
}

function getFieldImageUrl(
  fields: Map<string, MarketingSeoField>,
  key: string,
) {
  const field = fields.get(key);
  const referenceUrl = field?.reference?.image?.url;
  if (typeof referenceUrl === 'string' && referenceUrl.trim()) {
    return referenceUrl;
  }

  return typeof field?.value === 'string' && /^https?:\/\//i.test(field.value)
    ? field.value
    : null;
}

function getLocaleVariables(storefront: Storefront) {
  return {
    country: storefront.i18n.country,
    language: storefront.i18n.language,
  };
}

async function loadMarketingSeoMetaobjects(
  storefront: Storefront,
  type: 'seo_settings' | 'seo_pages',
  first: number,
) {
  const data = await storefront.query<MarketingSeoMetaobjectsQuery>(
    MARKETING_SEO_METAOBJECTS_QUERY,
    {
      cache: storefront.CacheLong(),
      variables: {
        type,
        first,
        ...getLocaleVariables(storefront),
      },
    },
  );

  return data.metaobjects?.nodes ?? [];
}

export async function loadShopifyGlobalSeoSettings(
  storefront: Storefront,
): Promise<ShopifyGlobalSeoSettings> {
  try {
    const [metaobject] = await loadMarketingSeoMetaobjects(
      storefront,
      'seo_settings',
      1,
    );
    const fields = getFieldMap(metaobject);

    return {
      siteName:
        getFieldText(fields, 'site_name') ??
        DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.siteName,
      defaultTitleSuffix:
        getFieldText(fields, 'default_title_suffix') ??
        DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.defaultTitleSuffix,
      defaultMetaDescription:
        getFieldText(fields, 'default_meta_description') ??
        DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.defaultMetaDescription,
      defaultSocialImage:
        getFieldImageUrl(fields, 'default_social_image') ??
        DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS.defaultSocialImage,
    };
  } catch {
    return {...DEFAULT_SHOPIFY_GLOBAL_SEO_SETTINGS};
  }
}

export async function loadShopifySeoPage(
  storefront: Storefront,
  routeKey: 'homepage' | 'collections' | 'blogs',
): Promise<ShopifySeoPage | null> {
  try {
    const metaobjects = await loadMarketingSeoMetaobjects(
      storefront,
      'seo_pages',
      50,
    );
    const fields = metaobjects
      .map(getFieldMap)
      .find(
        (fieldMap) => getFieldText(fieldMap, 'route_key') === routeKey,
      );

    if (!fields) return null;

    return {
      routeKey,
      seoTitle: getFieldText(fields, 'seo_title'),
      metaDescription: getFieldText(fields, 'meta_description'),
      openGraphTitle: getFieldText(fields, 'og_title'),
      openGraphDescription: getFieldText(fields, 'og_description'),
      openGraphImage: getFieldImageUrl(fields, 'og_image'),
      noindex: getFieldText(fields, 'noindex')?.toLowerCase() === 'true',
    };
  } catch {
    return null;
  }
}

const MARKETING_SEO_METAOBJECTS_QUERY = `#graphql
  query MarketingSeoMetaobjects(
    $type: String!
    $first: Int!
    $country: CountryCode!
    $language: LanguageCode!
  ) @inContext(country: $country, language: $language) {
    metaobjects(type: $type, first: $first) {
      nodes {
        fields {
          key
          value
          reference {
            __typename
            ... on MediaImage {
              image {
                url
              }
            }
          }
        }
      }
    }
  }
`;
