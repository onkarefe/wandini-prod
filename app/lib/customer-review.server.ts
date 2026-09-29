// Uploaded bytes stay request-local and are only forwarded after validation.
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_REVIEW_REQUEST_BYTES = MAX_REVIEW_PHOTO_BYTES + 64 * 1024;

export type ReviewField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'rating'
  | 'comment'
  | 'photo'
  | '_form';
export type ReviewError =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'rating'
  | 'comment'
  | 'photoEmpty'
  | 'photoType'
  | 'photoSize'
  | 'photoCount'
  | 'malformed'
  | 'requestSize'
  | 'method'
  | 'contentType'
  | 'locale'
  | 'delivery';
export type ReviewFieldErrors = Partial<Record<ReviewField, ReviewError>>;
export type CustomerReviewActionData =
  | {ok: true}
  | {ok: false; fieldErrors: ReviewFieldErrors};

export type ValidatedReviewPhoto = {
  format: 'jpeg' | 'png' | 'webp';
  bytes: Uint8Array;
};

export function validateReviewFields(form: FormData) {
  const fieldErrors: ReviewFieldErrors = {};
  const read = (name: Exclude<ReviewField, 'photo' | '_form'>) => {
    const entries = form.getAll(name);
    if (
      entries.length > 1 ||
      entries.some((entry) => typeof entry !== 'string')
    ) {
      fieldErrors[name] = name;
      return '';
    }
    return String(entries[0] ?? '').trim();
  };
  const locales = form.getAll('locale');
  if (locales.length !== 1 || (locales[0] !== 'DE' && locales[0] !== 'EN')) {
    fieldErrors._form = 'locale';
  }
  const value = {
    firstName: read('firstName'),
    lastName: read('lastName'),
    email: read('email').toLowerCase(),
    phone: read('phone'),
    rating: read('rating'),
    comment: read('comment'),
    locale: locales[0] === 'EN' ? ('EN' as const) : ('DE' as const),
  };
  if (value.firstName.length < 2 || value.firstName.length > 80)
    fieldErrors.firstName = 'firstName';
  if (value.lastName.length > 80) fieldErrors.lastName = 'lastName';
  if (
    value.email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.email)
  )
    fieldErrors.email = 'email';
  if (value.phone.length > 40) fieldErrors.phone = 'phone';
  if (!/^[1-5]$/.test(value.rating)) fieldErrors.rating = 'rating';
  if (value.comment.length < 10 || value.comment.length > 3000)
    fieldErrors.comment = 'comment';
  return {value: {...value, rating: Number(value.rating)}, fieldErrors};
}

// Binary signature/container checks, not image decoding. Browser MIME types and
// extensions are deliberately ignored. No uploaded bytes are rendered.
function detectPhotoFormat(
  bytes: Uint8Array,
): ValidatedReviewPhoto['format'] | false {
  const matches = (offset: number, signature: number[]) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  const ascii = (offset: number, text: string) =>
    matches(
      offset,
      Array.from(text, (char) => char.charCodeAt(0)),
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (matches(0, [0xff, 0xd8, 0xff])) {
    // Walk bounded JPEG segments up to the first scan, requiring a frame and EOI.
    let offset = 2;
    let hasFrame = false;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) return false;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (offset + 2 > bytes.length) return false;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return false;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (
          length < 8 ||
          !view.getUint16(offset + 3) ||
          !view.getUint16(offset + 5)
        )
          return false;
        hasFrame = true;
      }
      if (marker === 0xda) {
        return hasFrame &&
          length >= 6 &&
          offset + length < bytes.length - 2 &&
          matches(bytes.length - 2, [0xff, 0xd9])
          ? 'jpeg'
          : false;
      }
      if (marker === 0 || marker === 0xd8 || marker === 0xd9) return false;
      offset += length;
    }
    return false;
  }

  if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    if (
      bytes.length < 45 ||
      view.getUint32(8) !== 13 ||
      !ascii(12, 'IHDR') ||
      !view.getUint32(16) ||
      !view.getUint32(20)
    )
      return false;
    let offset = 33;
    let hasImageData = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) return false;
      if (ascii(offset + 4, 'IDAT') && length > 0) hasImageData = true;
      if (ascii(offset + 4, 'IEND'))
        return hasImageData && length === 0 && end === bytes.length
          ? 'png'
          : false;
      offset = end;
    }
    return false;
  }

  if (bytes.length >= 26 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (view.getUint32(4, true) !== bytes.length - 8) return false;
    if (!['VP8 ', 'VP8L', 'VP8X'].some((type) => ascii(12, type))) return false;
    const checkChunks = (
      start: number,
      limit: number,
      allowAnimation: boolean,
    ): boolean => {
      let offset = start;
      let hasImageData = false;
      while (offset + 8 <= limit) {
        const length = view.getUint32(offset + 4, true);
        const end = offset + 8 + length + (length % 2);
        if (end > limit) return false;
        if (ascii(offset, 'VP8 ')) {
          if (length < 10 || !matches(offset + 11, [0x9d, 0x01, 0x2a]))
            return false;
          hasImageData = true;
        }
        if (ascii(offset, 'VP8L')) {
          if (length < 5 || bytes[offset + 8] !== 0x2f) return false;
          hasImageData = true;
        }
        if (ascii(offset, 'VP8X') && length !== 10) return false;
        if (ascii(offset, 'ANIM') && length !== 6) return false;
        if (ascii(offset, 'ANMF')) {
          // Animation frames contain a 16-byte header followed by image chunks.
          if (
            !allowAnimation ||
            length < 24 ||
            !checkChunks(offset + 24, offset + 8 + length, false)
          )
            return false;
          hasImageData = true;
        }
        offset = end;
      }
      return hasImageData && offset === limit;
    };
    return checkChunks(12, bytes.length, true) ? 'webp' : false;
  }
  return false;
}

export async function validateReviewPhoto(
  form: FormData,
): Promise<ReviewError | ValidatedReviewPhoto | undefined> {
  const photos = form.getAll('photo');
  if (photos.length > 1) return 'photoCount';
  const photo = photos[0];
  if (photo === undefined) return;
  if (typeof photo === 'string') return 'photoType';
  // An unselected browser file input is serialized as an unnamed, empty File.
  if (photo.size === 0 && photo.name === '') return;
  if (photo.size === 0) return 'photoEmpty';
  if (photo.size > MAX_REVIEW_PHOTO_BYTES) return 'photoSize';
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const format = detectPhotoFormat(bytes);
  return format ? {format, bytes} : 'photoType';
}

export async function readReviewForm(
  request: Request,
): Promise<FormData | ReviewError> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return 'contentType';
  if (Number(request.headers.get('Content-Length')) > MAX_REVIEW_REQUEST_BYTES)
    return 'requestSize';
  if (!request.body) return 'malformed';

  // Count streamed bytes before native multipart parsing. Content-Length is
  // only an early rejection hint, never the authoritative cap.
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REVIEW_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        return 'requestSize';
      }
      chunks.push(new Uint8Array(value));
    }
    return await new Response(new Blob(chunks), {
      headers: {'Content-Type': contentType},
    }).formData();
  } catch {
    return 'malformed';
  } finally {
    reader.releaseLock();
  }
}
