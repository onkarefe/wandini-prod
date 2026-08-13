export type CustomerReviewImage = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
};

export type CustomerReview = {
  id: string;
  customerName: string;
  customerComment: string;
  image: CustomerReviewImage | null;
  stars: unknown;
};

export type CustomerReviewsHero = {
  title: string;
  description: string;
  buttonText: string;
  image: CustomerReviewImage | null;
};

export type CustomerReviewsStep = {
  id: string;
  title: string;
  description: string;
  image: CustomerReviewImage | null;
};

export type CustomerReviewsSteps = {
  title: string;
  description: string;
  steps: CustomerReviewsStep[];
};

type MetaobjectFieldLike = {
  key?: unknown;
  value?: unknown;
  type?: unknown;
  reference?: unknown;
  references?: {
    nodes?: unknown[] | null;
  } | null;
};

function safeJsonArray(input: unknown): string[] {
  if (typeof input !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(input);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function safeJsonUnknownArray(input: unknown): unknown[] {
  if (typeof input !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeReferenceImage(
  reference: unknown,
  fallbackAltText: string,
): CustomerReviewImage | null {
  if (!reference || typeof reference !== 'object') return null;

  const candidate = reference as {
    image?: {
      url?: unknown;
      altText?: unknown;
      width?: unknown;
      height?: unknown;
    } | null;
    url?: unknown;
  };
  const image = candidate.image;

  if (image && typeof image.url === 'string') {
    const altText =
      typeof image.altText === 'string' && image.altText.trim()
        ? image.altText.trim()
        : fallbackAltText || undefined;

    return {
      url: image.url,
      altText,
      width: typeof image.width === 'number' ? image.width : undefined,
      height: typeof image.height === 'number' ? image.height : undefined,
    };
  }

  if (typeof candidate.url === 'string') {
    return {
      url: candidate.url,
      altText: fallbackAltText || undefined,
    };
  }

  return null;
}

function getMetaobjectFields(metaobject: unknown): MetaobjectFieldLike[] {
  if (!metaobject || typeof metaobject !== 'object') return [];

  const fields = (metaobject as {fields?: unknown}).fields;
  return Array.isArray(fields) ? (fields as MetaobjectFieldLike[]) : [];
}

export function parseCustomerReviewsHeroMetaobject(
  metaobject: unknown,
): CustomerReviewsHero {
  const fields = getMetaobjectFields(metaobject);
  const fieldMap = new Map(
    fields
      .filter((field) => typeof field.key === 'string')
      .map((field) => [field.key as string, field]),
  );
  const getText = (...keys: string[]) => {
    for (const key of keys) {
      const value = fieldMap.get(key)?.value;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    return '';
  };
  const imageField = fieldMap.get('image');

  return {
    title: getText('title'),
    description: getText('description', 'decription'),
    buttonText: getText('button_text', 'buton_text'),
    image: normalizeReferenceImage(imageField?.reference, ''),
  };
}

export function getCustomerReviewRatingValue(stars: unknown): number {
  const fallbackMaximum = 5;

  if (typeof stars === 'number' || typeof stars === 'string') {
    const value = Number(stars);
    return Number.isFinite(value)
      ? Math.min(Math.max(value, 0), fallbackMaximum)
      : 0;
  }

  if (!stars || typeof stars !== 'object') return 0;

  const rating = stars as {value?: unknown; scale_max?: unknown};
  const value = Number(rating.value);
  const maximum = Number(rating.scale_max) || fallbackMaximum;

  if (!Number.isFinite(value) || maximum <= 0) return 0;
  return Math.min(Math.max((value / maximum) * fallbackMaximum, 0), 5);
}

export function parseCustomerReviewsMetaobject(
  metaobject: unknown,
): CustomerReview[] {
  const fields = getMetaobjectFields(metaobject);
  const fieldMap = new Map(
    fields
      .filter((field) => typeof field.key === 'string')
      .map((field) => [field.key as string, field]),
  );
  const customerNames = safeJsonArray(fieldMap.get('customer_name')?.value);
  const customerComments = safeJsonArray(
    fieldMap.get('customer_comment')?.value,
  );
  const customerImages =
    fieldMap.get('image')?.references?.nodes?.filter(Boolean) ?? [];
  const customerStars = safeJsonUnknownArray(fieldMap.get('stars')?.value).map(
    parseMaybeJsonValue,
  );
  const reviewCount = Math.max(
    customerNames.length,
    customerComments.length,
    customerImages.length,
    customerStars.length,
  );

  return Array.from({length: reviewCount})
    .map((_, index) => ({
      id: `customer-review-${index + 1}`,
      customerName: customerNames[index] ?? '',
      customerComment: customerComments[index] ?? '',
      image: normalizeReferenceImage(
        customerImages[index],
        customerNames[index] ?? '',
      ),
      stars: customerStars[index] ?? null,
    }))
    .filter(
      (review) =>
        review.customerName ||
        review.customerComment ||
        review.image ||
        review.stars,
    );
}

export function parseCustomerReviewsSectionTitle(metaobject: unknown): string {
  const sectionTitle = getMetaobjectFields(metaobject).find(
    (field) => field.key === 'section_title',
  )?.value;

  return typeof sectionTitle === 'string' ? sectionTitle.trim() : '';
}

export function parseCustomerReviewsStepsMetaobject(
  metaobject: unknown,
): CustomerReviewsSteps {
  const fields = getMetaobjectFields(metaobject);
  const fieldMap = new Map(
    fields
      .filter((field) => typeof field.key === 'string')
      .map((field) => [field.key as string, field]),
  );
  const getText = (key: string) => {
    const value = fieldMap.get(key)?.value;
    return typeof value === 'string' ? value.trim() : '';
  };
  const titles = safeJsonArray(fieldMap.get('box_title')?.value);
  const descriptions = safeJsonArray(fieldMap.get('box_description')?.value);
  const images =
    fieldMap.get('image')?.references?.nodes?.filter(Boolean) ?? [];
  const stepCount = Math.max(titles.length, descriptions.length, images.length);

  return {
    title: getText('main_title'),
    description: getText('main_description'),
    steps: Array.from({length: stepCount})
      .map((_, index) => ({
        id: `customer-experience-step-${index + 1}`,
        title: titles[index] ?? '',
        description: descriptions[index] ?? '',
        image: normalizeReferenceImage(images[index], titles[index] ?? ''),
      }))
      .filter((step) => step.title || step.description || step.image),
  };
}

export function formatCustomerReviewRating(stars: unknown): string {
  if (typeof stars === 'number' || typeof stars === 'string') {
    return String(stars);
  }

  if (!stars || typeof stars !== 'object') return '';

  const rating = stars as {value?: unknown; scale_max?: unknown};
  const value =
    typeof rating.value === 'number' || typeof rating.value === 'string'
      ? String(rating.value)
      : '';
  const maximum =
    typeof rating.scale_max === 'number' || typeof rating.scale_max === 'string'
      ? String(rating.scale_max)
      : '';

  if (!value) return '';
  return maximum ? `${value}/${maximum}` : value;
}
