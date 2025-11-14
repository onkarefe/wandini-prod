import React from 'react';

export function CustomProductImage({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="custom-product-images" style={{ display: 'flex', gap: '1rem' }}>
      {images.slice(0, 3).map((img) => (
        <img
          key={img.id}
          src={img.url}
          alt={img.altText || ''}
          style={{ width: 200, height: 'auto', borderRadius: 8 }}
          className="custom-product-image"
        />
      ))}
    </div>
  );
}
