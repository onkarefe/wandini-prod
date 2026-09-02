export const NORMAL_COLLECTION_IMAGE_COUNT = 3;
export const ROOM_COLLECTION_IMAGE_COUNT = 10;

export type RoomCode =
  | 'WOHN'
  | 'KUEC'
  | 'FLUR'
  | 'BADZ'
  | 'KIND'
  | 'SCHL'
  | 'JUGD';

const ROOM_CODE_BY_COLLECTION_HANDLE: Readonly<Record<string, RoomCode>> = {
  'fototapeten-wohnzimmer': 'WOHN',
  'fototapeten-kueche': 'KUEC',
  'fototapeten-kuche': 'KUEC',
  'fototapeten-flur': 'FLUR',
  'fototapeten-badezimmer': 'BADZ',
  'fototapeten-kinderzimmer': 'KIND',
  'fototapeten-schlafzimmer': 'SCHL',
  'fototapeten-jugendzimmer': 'JUGD',
  'living-room-wall-murals': 'WOHN',
  'kitchen-wall-murals': 'KUEC',
  'hallway-wall-murals': 'FLUR',
  'bathroom-wall-murals': 'BADZ',
  'kids-room-wall-murals': 'KIND',
  'bedroom-wall-murals': 'SCHL',
  'youth-room-wall-murals': 'JUGD',
};

type ProductImage = {
  url: string;
  altText?: string | null;
};

type ProductWithImages<TImage extends ProductImage> = {
  images: {
    nodes: TImage[];
  };
};

export function resolveRoomCollection(handle: string): RoomCode | null {
  return ROOM_CODE_BY_COLLECTION_HANDLE[handle.trim().toLowerCase()] ?? null;
}

export function getCollectionImageCount(handle: string): number {
  return resolveRoomCollection(handle)
    ? ROOM_COLLECTION_IMAGE_COUNT
    : NORMAL_COLLECTION_IMAGE_COUNT;
}

export function isRoomMockupImage(url: string, roomCode: RoomCode): boolean {
  try {
    const pathname = new URL(url, 'https://cdn.shopify.com').pathname;
    const filename = pathname
      .slice(pathname.lastIndexOf('/') + 1)
      .toUpperCase();

    return filename.includes(`_MOCK_${roomCode}_`);
  } catch {
    return false;
  }
}

export function findRoomMockupImage<TImage extends ProductImage>(
  images: TImage[],
  roomCode: RoomCode,
): TImage | null {
  return images.find((image) => isRoomMockupImage(image.url, roomCode)) ?? null;
}

export function shapeCollectionProductsForRoom<
  TImage extends ProductImage,
  TProduct extends ProductWithImages<TImage>,
>(products: TProduct[], roomCode: RoomCode | null): TProduct[] {
  if (!roomCode) {
    return products;
  }

  return products.map((product) => {
    const primaryImage = product.images.nodes[0];

    if (!primaryImage) {
      return {
        ...product,
        images: {
          ...product.images,
          nodes: [],
        },
      };
    }

    const roomMockup = findRoomMockupImage(product.images.nodes, roomCode);
    const listingImage = roomMockup ?? product.images.nodes[1] ?? primaryImage;

    return {
      ...product,
      images: {
        ...product.images,
        nodes: [primaryImage, listingImage],
      },
    };
  });
}
