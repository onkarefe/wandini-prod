import React from 'react';
import {CustomProductCard} from './CustomProductCard';

type CustomProductGridItem = {
  id: string;
  title: string;
  description?: string | null;
  images?: Array<{
    url: string;
    altText?: string | null;
  }> | null;
  productUrl?: string;
  handle?: string;
};

interface CustomProductGridProps {
  products: CustomProductGridItem[];
}

export function CustomProductGrid({products}: CustomProductGridProps) {
  return (
    <div className="custom-products-grid">
      {products.map((product) => {
        const productUrl =
          product.productUrl ??
          (product.handle ? `/products/${product.handle}` : '');

        return (
          <CustomProductCard
            key={product.id}
            title={product.title}
            description={product.description ?? undefined}
            images={
              product.images?.map((image) => ({
                url: image.url,
                altText: image.altText ?? undefined,
              })) ?? []
            }
            productUrl={productUrl}
          />
        );
      })}
    </div>
  );
}
