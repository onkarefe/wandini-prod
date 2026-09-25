import {WishlistServiceError} from '~/lib/wishlist-errors.server';
import {
  createAdminGraphqlClient,
  type ShopifyAdminEnv as WishlistEnv,
} from '~/lib/shopify-admin.server';

const WISHLIST_NAMESPACE = 'custom';
const WISHLIST_KEY = 'wishlist';
const WISHLIST_TYPE = 'list.product_reference';
const WISHLIST_MAX_ITEMS = 128;
const MAX_STALE_WRITE_RETRIES = 3;

type CustomerWishlistQuery = {
  customer: {
    metafield: {
      value: string;
      compareDigest: string;
    } | null;
  } | null;
};

type MetafieldsSetMutation = {
  metafieldsSet: {
    metafields: Array<{
      key: string;
      namespace: string;
      value: string;
    }>;
    userErrors: Array<{
      field: string[] | null;
      message: string;
      code?: string | null;
    }>;
  };
};

type WishlistSnapshot = {
  productIds: string[];
  compareDigest: string | null;
};

type WishlistResult = {
  wishlist: string[];
  wishlisted: boolean;
};

const adminGraphql = createAdminGraphqlClient(WishlistServiceError, 'Wishlist');

function isProductGid(value: unknown): value is string {
  return (
    typeof value === 'string' && /^gid:\/\/shopify\/Product\/\d+$/.test(value)
  );
}

function normalizeWishlistProductIds(productIds: unknown[]) {
  const uniqueIds = new Set<string>();

  for (const productId of productIds) {
    if (!isProductGid(productId)) continue;
    uniqueIds.add(productId);
    if (uniqueIds.size >= WISHLIST_MAX_ITEMS) break;
  }

  return Array.from(uniqueIds);
}

function parseWishlistValue(value: string | undefined) {
  if (!value) return [];

  try {
    const parsedValue: unknown = JSON.parse(value);
    return Array.isArray(parsedValue)
      ? normalizeWishlistProductIds(parsedValue)
      : [];
  } catch {
    return [];
  }
}

async function getCustomerWishlistSnapshot({
  env,
  customerId,
}: {
  env: WishlistEnv;
  customerId: string;
}): Promise<WishlistSnapshot> {
  const data = await adminGraphql<CustomerWishlistQuery>({
    env,
    query: `
      query CustomerWishlist($customerId: ID!) {
        customer(id: $customerId) {
          metafield(namespace: "${WISHLIST_NAMESPACE}", key: "${WISHLIST_KEY}") {
            value
            compareDigest
          }
        }
      }
    `,
    variables: {customerId},
  });

  return {
    productIds: parseWishlistValue(data.customer?.metafield?.value),
    compareDigest: data.customer?.metafield?.compareDigest ?? null,
  };
}

class WishlistStaleWriteError extends WishlistServiceError {
  constructor() {
    super('STALE_WRITE_ERROR', 'Wishlist write conflicted with a newer value.', {
      retryable: true,
      shopifyCodes: ['STALE_OBJECT'],
    });
  }
}

async function setCustomerWishlist({
  env,
  customerId,
  productIds,
  compareDigest,
}: {
  env: WishlistEnv;
  customerId: string;
  productIds: string[];
  compareDigest: string | null;
}) {
  const data = await adminGraphql<MetafieldsSetMutation>({
    env,
    query: `
      mutation SetCustomerWishlist($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    variables: {
      metafields: [
        {
          ownerId: customerId,
          namespace: WISHLIST_NAMESPACE,
          key: WISHLIST_KEY,
          type: WISHLIST_TYPE,
          value: JSON.stringify(productIds),
          compareDigest,
        },
      ],
    },
  });

  const userErrors = data.metafieldsSet.userErrors;
  if (userErrors.length === 0) return;

  if (userErrors.some((error) => error.code === 'STALE_OBJECT')) {
    throw new WishlistStaleWriteError();
  }

  throw new WishlistServiceError(
    'METAFIELD_WRITE_ERROR',
    'Wishlist could not be saved.',
    {
      shopifyCodes: userErrors.flatMap((error) =>
        error.code ? [error.code] : [],
      ),
    },
  );
}

export async function getCustomerWishlistProductIds({
  env,
  customerId,
}: {
  env: WishlistEnv;
  customerId: string;
}) {
  const snapshot = await getCustomerWishlistSnapshot({env, customerId});
  return snapshot.productIds;
}

export async function addProductToCustomerWishlist({
  env,
  customerId,
  productId,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
}): Promise<WishlistResult> {
  return toggleProductInCustomerWishlist({
    env,
    customerId,
    productId,
    desiredWishlisted: true,
  });
}

export async function toggleProductInCustomerWishlist({
  env,
  customerId,
  productId,
  desiredWishlisted,
}: {
  env: WishlistEnv;
  customerId: string;
  productId: string;
  desiredWishlisted?: boolean;
}): Promise<WishlistResult> {
  if (!/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)) {
    throw new WishlistServiceError(
      'INVALID_CUSTOMER',
      'Invalid wishlist customer.',
    );
  }
  if (!isProductGid(productId)) {
    throw new WishlistServiceError(
      'INVALID_PRODUCT',
      'Invalid wishlist product.',
    );
  }

  for (let attempt = 0; attempt < MAX_STALE_WRITE_RETRIES; attempt += 1) {
    const snapshot = await getCustomerWishlistSnapshot({env, customerId});
    const isCurrentlyWishlisted = snapshot.productIds.includes(productId);
    const wishlisted = desiredWishlisted ?? !isCurrentlyWishlisted;

    if (wishlisted === isCurrentlyWishlisted) {
      return {wishlist: snapshot.productIds, wishlisted};
    }

    const nextWishlist = wishlisted
      ? normalizeWishlistProductIds([productId, ...snapshot.productIds])
      : snapshot.productIds.filter((id) => id !== productId);

    try {
      await setCustomerWishlist({
        env,
        customerId,
        productIds: nextWishlist,
        compareDigest: snapshot.compareDigest,
      });
      return {wishlist: nextWishlist, wishlisted};
    } catch (error) {
      if (
        !(error instanceof WishlistStaleWriteError) ||
        attempt === MAX_STALE_WRITE_RETRIES - 1
      ) {
        throw error;
      }
    }
  }

  throw new WishlistServiceError(
    'STALE_WRITE_ERROR',
    'Wishlist could not be saved after conflict retries.',
    {retryable: true, shopifyCodes: ['STALE_OBJECT']},
  );
}
