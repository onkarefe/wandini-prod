type ImageSource = {
  url: string;
  width?: number | null;
  height?: number | null;
};

// Keep arbitrary CMS URLs and existing cropped derivatives untouched. Hydrogen's
// default loader appends transforms to every URL, including external images.
function shopifyImageUrl(src: string): URL | null {
  try {
    const url = new URL(src);
    const supportedHost =
      url.hostname === 'cdn.shopify.com' ||
      url.hostname.endsWith('.myshopify.com');
    if (
      !supportedHost ||
      !['https:', 'http:'].includes(url.protocol) ||
      !/^\/(s\/files\/|cdn\/shop\/(files|products)\/)/.test(url.pathname) ||
      !/\.(jpe?g|png|webp|avif|gif)$/i.test(url.pathname) ||
      ['height', 'crop', 'hmac', 'signature'].some((key) =>
        url.searchParams.has(key),
      )
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function shopifyImageWidth(src: string, width: number): string {
  const url = shopifyImageUrl(src);
  if (!url) return src;
  url.searchParams.set('width', String(Math.round(width)));
  return url.toString();
}

// Hydrogen loader for editorial images: preserve the original aspect ratio and
// CSS cropping, and don't append transforms to unsupported CMS image URLs.
export function shopifyImageLoader({
  src = '',
  width,
}: {
  src?: string;
  width?: number;
}) {
  return width ? shopifyImageWidth(src, width) : src;
}

const CARD_WIDTHS = [240, 320, 480, 640, 800, 960, 1200, 1440];

export function responsiveImageProps(
  image: ImageSource,
  sizes: string,
  widths: readonly number[] = CARD_WIDTHS,
) {
  const dimensions = {
    width: image.width ?? undefined,
    height: image.height ?? undefined,
  };
  if (!shopifyImageUrl(image.url)) return {src: image.url, ...dimensions};

  // Avoid width descriptors larger than a known source (Shopify won't upscale).
  const candidates = [
    ...new Set(
      widths.map((width) =>
        image.width && image.width > 0 ? Math.min(width, image.width) : width,
      ),
    ),
  ];
  const fallbackWidth = Math.min(800, candidates[candidates.length - 1]);
  return {
    ...dimensions,
    src: shopifyImageWidth(image.url, fallbackWidth),
    srcSet: candidates
      .map((width) => `${shopifyImageWidth(image.url, width)} ${width}w`)
      .join(', '),
    sizes,
  };
}

// Tailwind container widths; customProductCard.css uses 1/2/3 columns,
// 32px padding below 1024px, 16/24px gaps and a 1px card border.
export const PRODUCT_CARD_SIZES =
  '(min-width: 1536px) 494px, (min-width: 1280px) 409px, ' +
  '(min-width: 1024px) 324px, (min-width: 768px) 358px, ' +
  '(min-width: 640px) 606px, calc(100vw - 34px)';

// zubehor-collection.css caps the container at viewport minus 32px and
// switches from one to two to four columns with 16px gaps.
export const ACCESSORY_CARD_SIZES =
  '(min-width: 1536px) calc((min(1536px, 100vw - 32px) - 48px) / 4 - 2px), ' +
  '(min-width: 1280px) calc((min(1280px, 100vw - 32px) - 48px) / 4 - 2px), ' +
  '(min-width: 1024px) calc((min(1024px, 100vw - 32px) - 48px) / 4 - 2px), ' +
  '(min-width: 768px) calc((min(768px, 100vw - 32px) - 16px) / 2 - 2px), ' +
  '(min-width: 640px) calc(min(640px, 100vw - 32px) - 2px), calc(100vw - 34px)';
