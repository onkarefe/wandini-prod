import React from 'react';

type CustomProductImageItem = {
  id?: string;
  url: string;
  altText?: string | null;
};

interface CustomProductImageProps {
  images?: CustomProductImageItem[] | null;
}

export function CustomProductImage({images}: CustomProductImageProps) {
  if (!images || images.length === 0) {
    return null;
  }

  return (
    <div
      className="custom-product-images"
      style={{display: 'flex', gap: '1rem'}}
    >
      {images.slice(0, 3).map((image) => (
        <img
          key={image.id ?? image.url}
          src={image.url}
          alt={image.altText ?? ''}
          style={{width: 200, height: 'auto', borderRadius: 8}}
          className="custom-product-image"
        />
      ))}
    </div>
  );
}
