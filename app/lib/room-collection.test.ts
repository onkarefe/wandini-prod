import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildCollectionItemListJsonLd} from '../routes/collections.$handle';
import {
  findRoomMockupImage,
  getCollectionImageCount,
  isRoomMockupImage,
  resolveRoomCollection,
  shapeCollectionProductsForRoom,
} from './room-collection';

const primaryImage = {
  url: 'https://cdn.shopify.com/files/WND_WLP_PRIMARY.jpg?v=1',
  altText: 'Primary',
};
const bathroomImage = {
  url: 'https://cdn.shopify.com/files/WND_WLP_ABS_KI00033_MOCK_BADZ_01.jpg?v=2',
  altText: 'Bathroom',
};
const kidsImage = {
  url: 'https://cdn.shopify.com/files/WND_WLP_KID_GIR_WEB_MOCK_KIND_01.jpg?v=3',
  altText: 'Kids room',
};
const hallwayImage = {
  url: 'https://cdn.shopify.com/files/WND_WLP_MAR_KI00042_WEB_MOCK_FLUR_01.jpg?v=4',
  altText: 'Hallway',
};
const listingImage = {
  url: 'https://cdn.shopify.com/files/WND_WLP_LISTING.jpg?v=5',
  altText: 'Listing',
};

function product(
  id: string,
  handle: string,
  title: string,
  images: Array<{url: string; altText?: string | null}>,
) {
  return {id, handle, title, images: {nodes: images}};
}

describe('room collection image matching', () => {
  it('finds the exact BADZ token while rejecting KIND and generic mockups', () => {
    expect(isRoomMockupImage(bathroomImage.url, 'BADZ')).toBe(true);
    expect(isRoomMockupImage(kidsImage.url, 'BADZ')).toBe(false);
    expect(
      isRoomMockupImage(
        'https://cdn.shopify.com/files/WND_WLP_ABS_KI00033_MOCK.png',
        'BADZ',
      ),
    ).toBe(false);
  });

  it('matches WEB room mockups and ignores CDN query strings', () => {
    expect(isRoomMockupImage(kidsImage.url, 'KIND')).toBe(true);
    expect(
      findRoomMockupImage([primaryImage, kidsImage], 'KIND'),
    ).toStrictEqual(kidsImage);
  });

  it('handles malformed image URLs safely', () => {
    expect(isRoomMockupImage('http://[invalid', 'BADZ')).toBe(false);
  });
});

describe('room collection resolution and payload size', () => {
  it.each([
    ['fototapeten-wohnzimmer', 'WOHN'],
    ['fototapeten-kueche', 'KUEC'],
    ['fototapeten-flur', 'FLUR'],
    ['fototapeten-badezimmer', 'BADZ'],
    ['fototapeten-kinderzimmer', 'KIND'],
    ['fototapeten-schlafzimmer', 'SCHL'],
  ] as const)('maps German handle %s to %s', (handle, roomCode) => {
    expect(resolveRoomCollection(handle)).toBe(roomCode);
  });

  it.each([
    ['living-room-wall-murals', 'WOHN'],
    ['kitchen-wall-murals', 'KUEC'],
    ['hallway-wall-murals', 'FLUR'],
    ['bathroom-wall-murals', 'BADZ'],
    ['kids-room-wall-murals', 'KIND'],
    ['bedroom-wall-murals', 'SCHL'],
  ] as const)('maps English handle %s to %s', (handle, roomCode) => {
    expect(resolveRoomCollection(handle)).toBe(roomCode);
  });

  it('prepares exact JUGD mappings in both languages', () => {
    expect(resolveRoomCollection('fototapeten-jugendzimmer')).toBe('JUGD');
    expect(resolveRoomCollection('youth-room-wall-murals')).toBe('JUGD');
  });

  it('uses 10 images only for exact room handles and 3 otherwise', () => {
    expect(getCollectionImageCount('bathroom-wall-murals')).toBe(10);
    expect(getCollectionImageCount('fototapeten-badezimmer')).toBe(10);
    expect(getCollectionImageCount('fototapeten-abstrakt')).toBe(3);
    expect(getCollectionImageCount('bestseller')).toBe(3);
    expect(getCollectionImageCount('zubehor')).toBe(3);
  });
});

describe('room collection product shaping', () => {
  const matchingProduct = product('gid://product/1', 'matching', 'Matching', [
    primaryImage,
    listingImage,
    bathroomImage,
  ]);
  const missingProduct = product('gid://product/2', 'missing', 'Missing', [
    primaryImage,
    listingImage,
    kidsImage,
  ]);

  it('keeps products without the requested room mockup visible and ordered', () => {
    const visible = shapeCollectionProductsForRoom(
      [matchingProduct, missingProduct],
      'BADZ',
    );

    expect(visible.map(({id}) => id)).toEqual([
      'gid://product/1',
      'gid://product/2',
    ]);
  });

  it('keeps the original primary at index 0 and matched mockup at index 1', () => {
    const [visible] = shapeCollectionProductsForRoom([matchingProduct], 'BADZ');

    expect(visible.images.nodes).toEqual([primaryImage, bathroomImage]);
  });

  it('uses the original second image when the requested room mockup is missing', () => {
    const [visible] = shapeCollectionProductsForRoom([missingProduct], 'FLUR');

    expect(visible.images.nodes).toEqual([primaryImage, listingImage]);
    expect(visible.images.nodes).not.toContain(kidsImage);
  });

  it('falls back to primary when neither a room mockup nor second image exists', () => {
    const primaryOnly = product(
      'gid://product/3',
      'primary-only',
      'Primary only',
      [primaryImage],
    );
    const [visible] = shapeCollectionProductsForRoom([primaryOnly], 'FLUR');

    expect(visible.images.nodes).toEqual([primaryImage, primaryImage]);
  });

  it('retains a product without a primary image without exposing candidates', () => {
    const noImages = product('gid://product/5', 'no-images', 'No images', []);
    const [visible] = shapeCollectionProductsForRoom([noImages], 'FLUR');

    expect(visible.id).toBe(noImages.id);
    expect(visible.images.nodes).toEqual([]);
  });

  it('uses an exact FLUR match as listing while preserving primary for hover', () => {
    const hallwayProduct = product('gid://product/4', 'hallway', 'Hallway', [
      primaryImage,
      listingImage,
      bathroomImage,
      hallwayImage,
    ]);
    const [visible] = shapeCollectionProductsForRoom([hallwayProduct], 'FLUR');

    expect(visible.images.nodes).toEqual([primaryImage, hallwayImage]);
  });

  it('keeps normal collection products and image ordering unchanged', () => {
    const products = [matchingProduct, missingProduct];

    expect(shapeCollectionProductsForRoom(products, null)).toBe(products);
    expect(shapeCollectionProductsForRoom(products, null)[0].images.nodes).toBe(
      matchingProduct.images.nodes,
    );
  });

  it('builds room ItemList data for matched and fallback products in order', () => {
    const visible = shapeCollectionProductsForRoom(
      [matchingProduct, missingProduct],
      'BADZ',
    );
    const jsonLd = buildCollectionItemListJsonLd(
      visible as never[],
      'https://www.wandini.de/collections/fototapeten-badezimmer',
      'BADZ',
    );

    expect(jsonLd?.itemListElement).toHaveLength(2);
    expect(jsonLd?.itemListElement[0]).toMatchObject({
      position: 1,
      name: 'Matching',
      image: bathroomImage.url,
      url: 'https://www.wandini.de/products/matching',
    });
    expect(jsonLd?.itemListElement[1]).toMatchObject({
      position: 2,
      name: 'Missing',
      image: listingImage.url,
      url: 'https://www.wandini.de/products/missing',
    });
  });

  it('retains all 9 Shopify room products without match-density filling', () => {
    const products = Array.from({length: 9}, (_, index) =>
      product(
        `gid://product/${index}`,
        `product-${index}`,
        `Product ${index}`,
        index % 2 === 0
          ? [primaryImage, listingImage, hallwayImage]
          : [primaryImage, listingImage, bathroomImage],
      ),
    );
    const visible = shapeCollectionProductsForRoom(products, 'FLUR');

    expect(visible).toHaveLength(9);
    expect(visible.map(({id}) => id)).toEqual(products.map(({id}) => id));
  });
});

describe('collection route and card wiring', () => {
  const routeSource = readFileSync(
    new URL('../routes/collections.$handle.tsx', import.meta.url),
    'utf8',
  );
  const cardSource = readFileSync(
    new URL('../components/CustomProductCard.tsx', import.meta.url),
    'utf8',
  );

  it('uses one dynamic image variable in the existing collection query', () => {
    expect(routeSource).toContain('images(first: $imageCount)');
    expect(routeSource).toContain('$imageCount: Int!');
    expect(routeSource).not.toContain('images(first: 10)');
  });

  it('keeps Shopify pageBy 9 and spreads the original cursor connection', () => {
    expect(routeSource).toContain(
      'getPaginationVariables(request, {pageBy: 9})',
    );
    expect(routeSource).toContain('...collection.products,');
    expect(routeSource).not.toContain('pageBy: 18');
    expect(routeSource).not.toMatch(
      /candidate|synthetic cursor|dense pagination/i,
    );
  });

  it('preserves the existing listing and primary-hover card contract', () => {
    expect(cardSource).toContain('const primaryImage = images[0] ?? null;');
    expect(cardSource).toContain(
      'const listingImage = images[1] ?? primaryImage;',
    );
    expect(cardSource).toContain('src={listingImage.url}');
    expect(cardSource).toContain('src={primaryImage.url}');
  });
});
