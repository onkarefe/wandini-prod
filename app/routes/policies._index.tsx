import {useLoaderData} from 'react-router';
import type {Route} from './+types/policies._index';
import type {PoliciesQuery, PolicyItemFragment} from 'storefrontapi.generated';
import {Link} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {getRobotsDirective} from '~/lib/seo';
import {buildCanonicalUrl} from '~/lib/seo';
import {buildCanonicalRequestUrl} from '~/lib/canonical-origin';
import {Breadcrumbs} from '~/components/ProductBreadcrumb';
import {
  buildBreadcrumbStructuredData,
  buildContentBreadcrumbItems,
} from '~/lib/breadcrumbs';
import breadcrumbStyles from '~/styles/product-breadcrumb.css?url';

export function links() {
  return [{rel: 'stylesheet', href: breadcrumbStyles}];
}

function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const meta: Route.MetaFunction = () => {
  return [{name: 'robots', content: getRobotsDirective('noindex,follow')}];
};

export async function loader({context, request}: Route.LoaderArgs) {
  const data: PoliciesQuery = await context.storefront.query(POLICIES_QUERY);

  const shopPolicies = data.shop;
  const policies: PolicyItemFragment[] = [
    shopPolicies?.privacyPolicy,
    shopPolicies?.shippingPolicy,
    shopPolicies?.termsOfService,
    shopPolicies?.refundPolicy,
    shopPolicies?.subscriptionPolicy,
  ].filter((policy): policy is PolicyItemFragment => policy != null);

  if (!policies.length) {
    throw new Response('No policies found', {status: 404});
  }

  return {
    policies,
    canonicalUrl: buildCanonicalUrl(
      buildCanonicalRequestUrl(
        request.url,
        context.env.PUBLIC_CANONICAL_ORIGIN,
      ),
    ),
  };
}

export default function Policies() {
  const {t} = useTranslation();
  const {policies, canonicalUrl} = useLoaderData<typeof loader>();
  const breadcrumbItems = buildContentBreadcrumbItems({
    canonicalUrl,
    currentName: t('policies.title'),
  });
  const breadcrumbJsonLd = buildBreadcrumbStructuredData(breadcrumbItems);

  return (
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
      <div className="policies">
        <h1>{t('policies.title')}</h1>
        <div>
          {policies.map((policy) => (
            <fieldset key={policy.id}>
              <Link to={`/policies/${policy.handle}`}>{policy.title}</Link>
            </fieldset>
          ))}
        </div>
      </div>
    </>
  );
}

const POLICIES_QUERY = `#graphql
  fragment PolicyItem on ShopPolicy {
    id
    title
    handle
  }
  query Policies ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    shop {
      privacyPolicy {
        ...PolicyItem
      }
      shippingPolicy {
        ...PolicyItem
      }
      termsOfService {
        ...PolicyItem
      }
      refundPolicy {
        ...PolicyItem
      }
      subscriptionPolicy {
        id
        title
        handle
      }
    }
  }
` as const;
