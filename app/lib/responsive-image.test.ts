import {describe, expect, it} from 'vitest';
import {
  responsiveImageProps,
  shopifyImageLoader,
  shopifyImageWidth,
} from './responsive-image';

const source =
  'https://cdn.shopify.com/s/files/1/0123/4567/files/room.jpg?v=42&width=2000&format=webp#preview';

describe('Shopify image variants', () => {
  it('replaces width while retaining version, format and fragment in every candidate', () => {
    const props = responsiveImageProps(
      {url: source, width: 1000, height: 600},
      '400px',
    );
    if (!('srcSet' in props)) throw new Error('Expected Shopify variants');
    for (const candidate of props.srcSet.split(', ')) {
      const [src, descriptor] = candidate.split(' ');
      const url = new URL(src);
      expect(url.pathname).toBe(new URL(source).pathname);
      expect(url.searchParams.getAll('width')).toEqual([
        descriptor.slice(0, -1),
      ]);
      expect(url.searchParams.get('v')).toBe('42');
      expect(url.searchParams.get('format')).toBe('webp');
      expect(url.hash).toBe('#preview');
      expect(Number(descriptor.slice(0, -1))).toBeLessThanOrEqual(1000);
    }
    expect(props.srcSet).toContain('1000w');
    expect(props.srcSet.match(/1000w/g)).toHaveLength(1);
    expect(props).toMatchObject({width: 1000, height: 600, sizes: '400px'});
    expect(new URL(props.src).searchParams.get('width')).toBe('800');
  });

  it.each([
    '/images/room.jpg',
    '//cdn.shopify.com/s/files/1/room.jpg',
    'data:image/png;base64,AAAA',
    'https://example.com/room.jpg?v=1',
    'https://cdn.shopify.com.evil.example/s/files/1/room.jpg',
    'https://cdn.shopify.com/s/files/1/logo.svg',
    'https://cdn.shopify.com/videos/room.jpg',
    'https://cdn.shopify.com/s/files/1/room.jpg?height=300',
    'https://cdn.shopify.com/s/files/1/room.jpg?crop=center',
    'https://cdn.shopify.com/s/files/1/room.jpg?signature=abc',
    'not a URL',
  ])('keeps unsupported URLs unchanged: %s', (url) => {
    expect(shopifyImageWidth(url, 480)).toBe(url);
    expect(shopifyImageLoader({src: url, width: 480})).toBe(url);
    expect(responsiveImageProps({url}, '400px')).toEqual({src: url});
  });

  it('supports Shopify store image paths without adding a server-side crop', () => {
    const url = 'https://example.myshopify.com/cdn/shop/files/room.png?v=7';
    const result = new URL(shopifyImageLoader({src: url, width: 640}));
    expect(result.searchParams.get('width')).toBe('640');
    expect(result.searchParams.get('v')).toBe('7');
    expect(result.searchParams.has('height')).toBe(false);
    expect(result.searchParams.has('crop')).toBe(false);
  });
});
