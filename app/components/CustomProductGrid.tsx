import React from 'react';
import { CustomProductCard } from './CustomProductCard';

export function CustomProductGrid({ products }) {
  return (
    <div className="custom-products-grid">
      {products.map((product) => (
        <CustomProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
