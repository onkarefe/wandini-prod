function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function getMetafieldTextValue(value?: {value?: string | null} | null) {
  if (typeof value?.value !== 'string') {
    return null;
  }

  const normalizedValue = normalizeWhitespace(value.value);
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function slugifySimilarPart(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSimilarProductsSlug({
  mainMotif,
  mainTheme,
  productCategory,
}: {
  mainMotif: string;
  mainTheme: string;
  productCategory: string;
}) {
  const motifSlug = slugifySimilarPart(mainMotif);
  const themeSlug = slugifySimilarPart(mainTheme);
  const categorySlug = slugifySimilarPart(productCategory);

  if (!motifSlug || !themeSlug || !categorySlug) {
    return null;
  }

  return `${motifSlug}-${themeSlug}-${categorySlug}`;
}

export function buildSimilarProductsPath(input: {
  mainMotif: string;
  mainTheme: string;
  productCategory: string;
}) {
  const slug = buildSimilarProductsSlug(input);
  return slug ? `/similar-products/${slug}` : null;
}

type StorefrontClientLike = {
  query: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<any>;
};

export type SimilarProductsBaseProduct = {
  id: string;
  handle: string;
  title: string;
  mainMotif?: {
    value?: string | null;
  } | null;
  mainTheme?: {
    value?: string | null;
  } | null;
  priceRange?: {
    minVariantPrice?: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
  images?: {
    nodes?: Array<{
      url: string;
      altText?: string | null;
    }>;
  } | null;
  collections?: {
    nodes?: Array<{
      handle?: string | null;
      title?: string | null;
    }>;
  } | null;
  options?: Array<{
    name?: string | null;
    optionValues?: Array<{
      name?: string | null;
      swatch?: {
        color?: string | null;
      } | null;
    }> | null;
  }> | null;
};

export async function fetchSimilarProductsBaseData({
  storefront,
  categoryHandle,
}: {
  storefront: StorefrontClientLike;
  categoryHandle: string;
}) {
  const products: SimilarProductsBaseProduct[] = [];
  let endCursor: string | null = null;
  let hasNextPage = true;
  let collectionTitle: string | null = null;

  while (hasNextPage) {
    const data = await storefront.query(SIMILAR_PRODUCTS_BASE_QUERY, {
      variables: {
        handle: categoryHandle,
        first: 100,
        after: endCursor,
      },
    });

    const collection = data.collection;

    if (!collection) {
      throw new Response(`Kollektion ${categoryHandle} wurde nicht gefunden.`, {
        status: 404,
      });
    }

    if (typeof collection.title === 'string') {
      collectionTitle = collection.title;
    }

    for (const product of collection.products?.nodes ?? []) {
      products.push(product as SimilarProductsBaseProduct);
    }

    hasNextPage = Boolean(collection.products?.pageInfo?.hasNextPage);
    endCursor =
      typeof collection.products?.pageInfo?.endCursor === 'string'
        ? collection.products.pageInfo.endCursor
        : null;
  }

  return {
    categoryHandle,
    collectionTitle,
    products,
  };
}

async function fetchCollectionHandles(storefront: StorefrontClientLike) {
  const handles: string[] = [];
  let endCursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await storefront.query(COLLECTION_HANDLES_QUERY, {
      variables: {
        first: 100,
        after: endCursor,
      },
    });

    for (const collection of data.collections?.nodes ?? []) {
      if (typeof collection.handle === 'string' && collection.handle.length > 0) {
        handles.push(collection.handle);
      }
    }

    hasNextPage = Boolean(data.collections?.pageInfo?.hasNextPage);
    endCursor =
      typeof data.collections?.pageInfo?.endCursor === 'string'
        ? data.collections.pageInfo.endCursor
        : null;
  }

  return handles.sort((left, right) => right.length - left.length);
}

function resolveCategoryHandleFromSlug(slug: string, collectionHandles: string[]) {
  return (
    collectionHandles.find((handle) => slug === handle || slug.endsWith(`-${handle}`)) ??
    null
  );
}

export function getLayer1SameMotifProducts({
  products,
  targetMainMotif,
}: {
  products: SimilarProductsBaseProduct[];
  targetMainMotif: string;
}) {
  const targetMotifKey = slugifySimilarPart(targetMainMotif);

  if (!targetMotifKey) {
    return [];
  }

  return products.filter((product) => {
    const productMainMotif = getMetafieldTextValue(product.mainMotif);

    if (!productMainMotif) {
      return false;
    }

    return slugifySimilarPart(productMainMotif) === targetMotifKey;
  });
}

export function getLayer2SameThemeProducts({
  products,
  targetMainTheme,
}: {
  products: SimilarProductsBaseProduct[];
  targetMainTheme: string;
}) {
  const targetThemeKey = slugifySimilarPart(targetMainTheme);

  if (!targetThemeKey) {
    return [];
  }

  return products.filter((product) => {
    const productMainTheme = getMetafieldTextValue(product.mainTheme);

    if (!productMainTheme) {
      return false;
    }

    return slugifySimilarPart(productMainTheme) === targetThemeKey;
  });
}

const ROOM_PATTERNS = [
  'living-room',
  'bedroom',
  'kids-room',
  'nursery',
  'dining-room',
  'bathroom',
  'kitchen',
  'office',
  'hallway',
  'entryway',
  'playroom',
] as const;

export function getProductRoom(product: SimilarProductsBaseProduct) {
  for (const collection of product.collections?.nodes ?? []) {
    const collectionHandle =
      typeof collection.handle === 'string' ? collection.handle : '';

    if (!collectionHandle) {
      continue;
    }

    for (const roomPattern of ROOM_PATTERNS) {
      if (collectionHandle.includes(roomPattern)) {
        return roomPattern;
      }
    }
  }

  for (const collection of product.collections?.nodes ?? []) {
    const collectionTitle =
      typeof collection.title === 'string' ? collection.title : '';
    const normalizedTitle = slugifySimilarPart(collectionTitle);

    if (!normalizedTitle) {
      continue;
    }

    for (const roomPattern of ROOM_PATTERNS) {
      if (normalizedTitle.includes(roomPattern)) {
        return roomPattern;
      }
    }
  }

  return null;
}

export function getLayer3SameRoomProducts({
  products,
  targetRoom,
}: {
  products: SimilarProductsBaseProduct[];
  targetRoom: string;
}) {
  const targetRoomKey = slugifySimilarPart(targetRoom);

  if (!targetRoomKey) {
    return [];
  }

  return products.filter((product) => {
    const productRoom = getProductRoom(product);

    if (!productRoom) {
      return false;
    }

    return slugifySimilarPart(productRoom) === targetRoomKey;
  });
}

export function getProductColors(product: SimilarProductsBaseProduct) {
  const colors = new Set<string>();

  for (const option of product.options ?? []) {
    const optionName = slugifySimilarPart(option.name ?? '');

    if (!optionName.includes('color')) {
      continue;
    }

    for (const optionValue of option.optionValues ?? []) {
      const valueName = slugifySimilarPart(optionValue.name ?? '');
      const swatchColor = slugifySimilarPart(optionValue.swatch?.color ?? '');

      if (valueName) {
        colors.add(valueName);
      }

      if (swatchColor) {
        colors.add(swatchColor);
      }
    }
  }

  return [...colors];
}

export function getLayer4SameColorProducts({
  products,
  targetColors,
}: {
  products: SimilarProductsBaseProduct[];
  targetColors: string[];
}) {
  const targetColorKeys = new Set(
    targetColors.map((color) => slugifySimilarPart(color)).filter(Boolean),
  );

  if (targetColorKeys.size === 0) {
    return [];
  }

  return products.filter((product) => {
    const productColors = getProductColors(product);

    if (productColors.length === 0) {
      return false;
    }

    return productColors.some((color) =>
      targetColorKeys.has(slugifySimilarPart(color)),
    );
  });
}

export function getLayer5FallbackProducts({
  products,
}: {
  products: SimilarProductsBaseProduct[];
}) {
  return products;
}

export function removeDuplicateProductsById(
  products: SimilarProductsBaseProduct[],
) {
  const seenProductIds = new Set<string>();

  return products.filter((product) => {
    if (seenProductIds.has(product.id)) {
      return false;
    }

    seenProductIds.add(product.id);
    return true;
  });
}

export function getInitialSimilarProductsPage({
  products,
  pageSize = 15,
}: {
  products: SimilarProductsBaseProduct[];
  pageSize?: number;
}) {
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const items = products.slice(0, normalizedPageSize);

  return {
    items,
    total: products.length,
    hasMore: products.length > normalizedPageSize,
    nextOffset: items.length,
  };
}

function getPaginatedSimilarProducts({
  products,
  offset = 0,
  pageSize = 15,
}: {
  products: SimilarProductsBaseProduct[];
  offset?: number;
  pageSize?: number;
}) {
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const items = products.slice(
    normalizedOffset,
    normalizedOffset + normalizedPageSize,
  );

  return {
    items,
    total: products.length,
    hasMore: normalizedOffset + items.length < products.length,
    nextOffset: normalizedOffset + items.length,
  };
}

export type SimilarProductsResolvedTarget = {
  slug: string;
  categoryHandle: string;
  collectionTitle: string | null;
  mainMotif: string;
  mainTheme: string;
  room: string | null;
  colors: string[];
};

type SimilarProductsSeoConfigEntry = {
  introContent: string;
  isWhitelisted: boolean;
  isSitemapIncluded?: boolean;
  lastModified?: string | null;
};

const SIMILAR_PRODUCTS_SEO_CONFIG: Record<string, SimilarProductsSeoConfigEntry> =
  {};

export type SimilarProductsSeoSignals = {
  layer1Count: number;
  layer2Count: number;
  layer1Plus2Count: number;
  layer3Count: number;
  layer4Count: number;
  layer5Count: number;
  totalUniqueCount: number;
  seoRelevantProductCount: number;
  fallbackProductCount: number;
  isFallbackHeavy: boolean;
  hasIntroContent: boolean;
  isWhitelistedCombination: boolean;
  seoEligible: boolean;
};

export type SimilarProductsSitemapEntry = {
  slug: string;
  url: string;
  lastModified?: string | null;
};

type SimilarProductsLayerBuckets = {
  layer1Products: SimilarProductsBaseProduct[];
  layer2Products: SimilarProductsBaseProduct[];
  layer3Products: SimilarProductsBaseProduct[];
  layer4Products: SimilarProductsBaseProduct[];
  layer5Products: SimilarProductsBaseProduct[];
  displayedProducts: SimilarProductsBaseProduct[];
  seoRelevantProducts: SimilarProductsBaseProduct[];
  supportProducts: SimilarProductsBaseProduct[];
  fallbackProducts: SimilarProductsBaseProduct[];
  seoSignals: SimilarProductsSeoSignals;
  introContent: string | null;
};

function getSimilarProductsSeoConfigEntry(slug: string) {
  return SIMILAR_PRODUCTS_SEO_CONFIG[slug] ?? null;
}

export function getSimilarProductsSitemapEntries(origin: string) {
  const normalizedOrigin = origin.replace(/\/+$/, '');

  if (!normalizedOrigin) {
    return [] as SimilarProductsSitemapEntry[];
  }

  return Object.entries(SIMILAR_PRODUCTS_SEO_CONFIG)
    .filter(([, entry]) => {
      const hasIntroContent =
        typeof entry.introContent === 'string' && entry.introContent.trim().length > 0;

      return (
        entry.isWhitelisted === true &&
        entry.isSitemapIncluded === true &&
        hasIntroContent
      );
    })
    .map(([slug, entry]) => ({
      slug,
      url: `${normalizedOrigin}/similar-products/${slug}`,
      lastModified:
        typeof entry.lastModified === 'string' && entry.lastModified.trim().length > 0
          ? entry.lastModified.trim()
          : null,
    }));
}

function resolveSimilarProductsTarget({
  slug,
  categoryHandle,
  collectionTitle,
  products,
}: {
  slug: string;
  categoryHandle: string;
  collectionTitle: string | null;
  products: SimilarProductsBaseProduct[];
}) {
  const matchingProducts = products.filter((product) => {
    const mainMotif = getMetafieldTextValue(product.mainMotif);
    const mainTheme = getMetafieldTextValue(product.mainTheme);

    if (!mainMotif || !mainTheme) {
      return false;
    }

    const productSlug = buildSimilarProductsSlug({
      mainMotif,
      mainTheme,
      productCategory: categoryHandle,
    });

    return productSlug === slug;
  });

  if (matchingProducts.length === 0) {
    throw new Response(`Ziel für ähnliche Produkte ${slug} wurde nicht gefunden.`, {
      status: 404,
    });
  }

  const primaryProduct = matchingProducts[0];
  const mainMotif = getMetafieldTextValue(primaryProduct.mainMotif);
  const mainTheme = getMetafieldTextValue(primaryProduct.mainTheme);

  if (!mainMotif || !mainTheme) {
    throw new Response(`Ziel für ähnliche Produkte ${slug} ist ungültig.`, {
      status: 404,
    });
  }

  const room =
    matchingProducts
      .map((product) => getProductRoom(product))
      .find(
        (
          value,
        ): value is NonNullable<ReturnType<typeof getProductRoom>> =>
          typeof value === 'string' && value.length > 0,
      ) ??
    null;
  const colors = [...new Set(matchingProducts.flatMap((product) => getProductColors(product)))];

  return {
    slug,
    categoryHandle,
    collectionTitle,
    mainMotif,
    mainTheme,
    room,
    colors,
  } satisfies SimilarProductsResolvedTarget;
}

function buildLayeredSimilarProducts({
  products,
  target,
  excludeProductId,
}: {
  products: SimilarProductsBaseProduct[];
  target: SimilarProductsResolvedTarget;
  excludeProductId?: string | null;
}) {
  const layer1Products = getLayer1SameMotifProducts({
    products,
    targetMainMotif: target.mainMotif,
  });
  const layer2Products = getLayer2SameThemeProducts({
    products,
    targetMainTheme: target.mainTheme,
  });
  const layer3Products = target.room
    ? getLayer3SameRoomProducts({
        products,
        targetRoom: target.room,
      })
    : [];
  const layer4Products =
    target.colors.length > 0
      ? getLayer4SameColorProducts({
          products,
          targetColors: target.colors,
        })
      : [];
  const layer5Products = getLayer5FallbackProducts({products});

  const excludedProductIds = new Set<string>();

  if (excludeProductId) {
    excludedProductIds.add(excludeProductId);
  }

  const seenProductIds = new Set<string>();
  const takeLayerProducts = (layerProducts: SimilarProductsBaseProduct[]) => {
    return layerProducts.filter((product) => {
      if (excludedProductIds.has(product.id) || seenProductIds.has(product.id)) {
        return false;
      }

      seenProductIds.add(product.id);
      return true;
    });
  };

  const uniqueLayer1Products = takeLayerProducts(layer1Products);
  const uniqueLayer2Products = takeLayerProducts(layer2Products);
  const uniqueLayer3Products = takeLayerProducts(layer3Products);
  const uniqueLayer4Products = takeLayerProducts(layer4Products);
  const uniqueLayer5Products = takeLayerProducts(layer5Products);

  const displayedProducts = [
    ...uniqueLayer1Products,
    ...uniqueLayer2Products,
    ...uniqueLayer3Products,
    ...uniqueLayer4Products,
    ...uniqueLayer5Products,
  ];
  const seoRelevantProducts = [...uniqueLayer1Products, ...uniqueLayer2Products];
  const supportProducts = [...uniqueLayer3Products, ...uniqueLayer4Products];
  const fallbackProducts = [...uniqueLayer5Products];
  const seoConfigEntry = getSimilarProductsSeoConfigEntry(target.slug);
  const introContent =
    typeof seoConfigEntry?.introContent === 'string' &&
    seoConfigEntry.introContent.trim().length > 0
      ? seoConfigEntry.introContent.trim()
      : null;
  const hasIntroContent = Boolean(introContent);
  const isWhitelistedCombination = seoConfigEntry?.isWhitelisted === true;
  const layer1Count = uniqueLayer1Products.length;
  const layer2Count = uniqueLayer2Products.length;
  const layer3Count = uniqueLayer3Products.length;
  const layer4Count = uniqueLayer4Products.length;
  const layer5Count = uniqueLayer5Products.length;
  const layer1Plus2Count = layer1Count + layer2Count;
  const totalUniqueCount = displayedProducts.length;
  const seoRelevantProductCount = seoRelevantProducts.length;
  const fallbackProductCount = fallbackProducts.length;
  const isFallbackHeavy = fallbackProductCount > seoRelevantProductCount;
  const seoEligible =
    layer1Count >= 4 &&
    layer1Plus2Count >= 8 &&
    totalUniqueCount >= 12 &&
    hasIntroContent &&
    isWhitelistedCombination;

  return {
    layer1Products: uniqueLayer1Products,
    layer2Products: uniqueLayer2Products,
    layer3Products: uniqueLayer3Products,
    layer4Products: uniqueLayer4Products,
    layer5Products: uniqueLayer5Products,
    displayedProducts,
    seoRelevantProducts,
    supportProducts,
    fallbackProducts,
    seoSignals: {
      layer1Count,
      layer2Count,
      layer1Plus2Count,
      layer3Count,
      layer4Count,
      layer5Count,
      totalUniqueCount,
      seoRelevantProductCount,
      fallbackProductCount,
      isFallbackHeavy,
      hasIntroContent,
      isWhitelistedCombination,
      seoEligible,
    },
    introContent,
  } satisfies SimilarProductsLayerBuckets;
}

export async function getSimilarProductsPageData({
  storefront,
  slug,
  offset = 0,
  pageSize = 15,
  excludeProductId,
}: {
  storefront: StorefrontClientLike;
  slug: string;
  offset?: number;
  pageSize?: number;
  excludeProductId?: string | null;
}) {
  const collectionHandles = await fetchCollectionHandles(storefront);
  const categoryHandle = resolveCategoryHandleFromSlug(slug, collectionHandles);

  if (!categoryHandle) {
    throw new Response(`Kategorie für ${slug} konnte nicht ermittelt werden.`, {
      status: 404,
    });
  }

  const {collectionTitle, products} = await fetchSimilarProductsBaseData({
    storefront,
    categoryHandle,
  });
  const target = resolveSimilarProductsTarget({
    slug,
    categoryHandle,
    collectionTitle,
    products,
  });
  const layeredProducts = buildLayeredSimilarProducts({
    products,
    target,
    excludeProductId,
  });

  return {
    target,
    seoSignals: layeredProducts.seoSignals,
    introContent: layeredProducts.introContent,
    ...getPaginatedSimilarProducts({
      products: layeredProducts.displayedProducts,
      offset,
      pageSize,
    }),
  };
}

const SIMILAR_PRODUCTS_BASE_QUERY = `#graphql
  query SimilarProductsBase(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int!
    $after: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      products(first: $first, after: $after) {
        nodes {
          id
          handle
          title
          mainMotif: metafield(namespace: "custom", key: "main_motif") {
            value
          }
          mainTheme: metafield(namespace: "custom", key: "main_theme") {
            value
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 3) {
            nodes {
              url
              altText
            }
          }
          collections(first: 20) {
            nodes {
              handle
              title
            }
          }
          options {
            name
            optionValues {
              name
              swatch {
                color
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
` as const;

const COLLECTION_HANDLES_QUERY = `#graphql
  query SimilarProductsCollectionHandles(
    $country: CountryCode
    $language: LanguageCode
    $first: Int!
    $after: String
  ) @inContext(country: $country, language: $language) {
    collections(first: $first, after: $after) {
      nodes {
        handle
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
` as const;
