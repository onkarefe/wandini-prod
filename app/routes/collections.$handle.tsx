import { redirect, useLoaderData } from 'react-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterBar } from '~/components/filterBar';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Route } from './+types/collections.$handle';
import { getPaginationVariables, Analytics } from '@shopify/hydrogen';
import { PaginatedResourceSection } from '~/components/PaginatedResourceSection';
import { redirectIfHandleIsLocalized } from '~/lib/redirect';
import CustomProductCard from '~/components/CustomProductCard';
import '../styles/collections.css';
// ...existing code...

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `Hydrogen | ${data?.collection.title ?? ''} Collection` }];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return { ...deferredData, ...criticalData };
}

/**
 * Üst katman (above-the-fold) için kritik veri
 */
async function loadCriticalData({ context, params, request }: Route.LoaderArgs) {
  const { handle } = params;
  const { storefront } = context;

  if (!handle) {
    throw redirect('/collections');
  }

  const paginationVariables = getPaginationVariables(request, { pageBy: 9 });
  const url = new URL(request.url);

  // --- f= paramı tabanlı filtre okuma ---
  // each "f" is a JSON string that matches Storefront API ProductFilter
  const shopifyFilters: any[] = [];
  for (const v of url.searchParams.getAll('f')) {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object') {
        shopifyFilters.push(parsed);
      }
    } catch {
      // ignore invalid JSON
    }
  }

  // İsteğe bağlı: Eski key=value yaklaşımından basit bir fallback
  if (shopifyFilters.length === 0) {
    url.searchParams.forEach((value, key) => {
      if (key === 'f') return;
      if (key === 'productVendor') shopifyFilters.push({ productVendor: value });
      else if (key === 'productType') shopifyFilters.push({ productType: value });
      else if (key.startsWith('variantOption-')) {
        const name = key.replace('variantOption-', '');
        shopifyFilters.push({ variantOption: { name, value } });
      } else if (key === 'price') {
        const [minStr, maxStr] = value.split('-');
        const min = Number(minStr);
        const max = Number(maxStr);
        shopifyFilters.push({
          price: {
            min: Number.isFinite(min) ? min : undefined,
            max: Number.isFinite(max) ? max : undefined,
          },
        });
      }
    });
  }

  // Sort parametresi oku
  const sortParam = url.searchParams.get('sort') || 'BEST_SELLING';
  // Fiyat azalan için reverse true
  const reverse = sortParam === 'PRICE_DESC';

  const [{ collection }] = await Promise.all([
    storefront.query(CUSTOM_COLLECTION_QUERY, {
      variables: {
        handle,
        ...paginationVariables,
        filters: shopifyFilters.length ? shopifyFilters : undefined,
        sortKey: sortParam === 'PRICE_DESC' ? 'PRICE' : sortParam,
        reverse,
      },
    }),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, { status: 404 });
  }

  // Lokalize handle için yönlendirme (yardımcı fonksiyon içerde throw/return edebilir)
  redirectIfHandleIsLocalized(request, { handle, data: collection });

  return { collection };
}

/**
 * Sayfa altı (below-the-fold) için ertelenen veri
 */
function loadDeferredData({ }: Route.LoaderArgs) {
  return {};
}

export default function Collection() {
  const { collection } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();

  // Filtre barı state ve fonksiyonları FilterBar componentine taşındı.

  // Filtreler var mı?
  const hasFilters = useMemo(
    () => Array.isArray(collection?.products?.filters) && collection?.products?.filters?.length > 0,
    [collection?.products?.filters]
  );

  // Sort seçenekleri
  const sortOptions = [
    { label: 'Best Selling', value: 'BEST_SELLING' },
    { label: 'Newest', value: 'CREATED' },
    { label: 'Price: Low to High', value: 'PRICE' },
    { label: 'Price: High to Low', value: 'PRICE_DESC' },
    { label: 'A-Z', value: 'TITLE' },
    { label: 'Relevance', value: 'RELEVANCE' },
    { label: 'Default', value: 'COLLECTION_DEFAULT' },
    { label: 'ID', value: 'ID' },
    { label: 'Last Updated', value: 'UPDATED' },
    { label: 'Vendor', value: 'VENDOR' },
  ];

  // URL parametresini güncelleyen fonksiyon
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(location.search);
    params.set('sort', e.target.value);
    navigate(`${location.pathname}?${params.toString()}`);
  };

  return (
    <div className="collection">
      <div
        className="collectionMainHeroDiv"
        style={
          collection?.image?.url
            ? {
              backgroundImage: `url('${collection.image.url}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
            : {}
        }
      >
        <h1>{collection?.title ?? ''}</h1>
        <p>{collection?.description ?? ''}</p>
      </div>

      <div className="container mx-auto">
        {/* Filtre barı */}
        {hasFilters && Array.isArray(collection?.products?.filters) && (
          <FilterBar filters={collection.products.filters as any[]} />
        )}
        {/* Sort dropdown */}
        <div className="sort-Main">
          <label htmlFor="sort-select">Sort:</label>
          <select
            id="sort-select"
            value={new URLSearchParams(location.search).get('sort') || 'BEST_SELLING'}
            onChange={handleSortChange}
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* <PaginatedResourceSection<any>
        connection={collection?.products}
        resourcesClassName="products-grid"
      > bu orjinali gerekirse buraya dön !!!! */}
      {collection?.products && (
        <PaginatedResourceSection<any>
          connection={collection.products}
          resourcesClassName="custom-products-grid container mx-auto"
        >
          {({ node: product }) => (
            <CustomProductCard
              key={product.id}
              title={product.title}
              description={product.description}
              images={product.images?.nodes?.map((img: any) => ({ url: img.url, altText: img.altText })) || []}
              productUrl={`/products/${product.handle}`}
            />
          )}
        </PaginatedResourceSection>
      )}

      <Analytics.CollectionView
        data={{
          collection: {
            id: collection?.id ?? '',
            handle: collection?.handle ?? '',
          },
        }}
      />
    </div>
  );
}

const CUSTOM_PRODUCT_CARD_FRAGMENT = `#graphql
  fragment CustomProductCardFields on Product {
    id
    handle
    title
    description
    images(first: 3) {
      nodes {
        url
        altText
      }
    }
  }
` as const;

const CUSTOM_COLLECTION_QUERY = `#graphql
  ${CUSTOM_PRODUCT_CARD_FRAGMENT}
  query CustomCollection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
        altText
        width
        height
      }
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        filters: $filters,
        sortKey: $sortKey,
        reverse: $reverse
      ) {
        filters {
          id
          label
          type
          values {
            id
            label
            count
            input
          }
        }
        nodes {
          ...CustomProductCardFields
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }
      }
    }
  }
` as const;
