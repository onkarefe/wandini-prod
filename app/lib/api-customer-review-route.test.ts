import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {action, loader} from '~/routes/api.customer-review';
import {
  MAX_REVIEW_PHOTO_BYTES,
  MAX_REVIEW_REQUEST_BYTES,
  validateReviewFields,
} from '~/lib/customer-review.server';

// Real 1x1 encoded images; signatures are tested independently of names/MIME.
const images = {
  jpeg: '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==',
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT3sAAAAASUVORK5CYII=',
  webp: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
};
function bytes(format: keyof typeof images) {
  return new Uint8Array(Buffer.from(images[format], 'base64'));
}
function form(overrides: Record<string, string | null> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    firstName: 'Anna',
    lastName: '',
    email: 'anna@example.com',
    phone: '',
    rating: '5',
    comment: 'A beautiful room and a great experience.',
    company: '',
    ...overrides,
  })) {
    if (value !== null) data.set(key, value);
  }
  return data;
}
async function submit(body: BodyInit = form(), headers?: HeadersInit) {
  return action({
    request: new Request('https://example.com/api/customer-review', {
      method: 'POST',
      body,
      headers,
    }),
  } as Parameters<typeof action>[0]);
}
async function expectResult(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual(body);
}
const noExternalCall = vi.fn();
beforeEach(() => {
  noExternalCall.mockReset();
  vi.stubGlobal('fetch', noExternalCall);
});
afterEach(() => {
  expect(noExternalCall).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('isolated customer review endpoint', () => {
  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'rejects %s',
    async (method) => {
      const response = await action({
        request: new Request('https://example.com/api/customer-review', {
          method,
        }),
      } as Parameters<typeof action>[0]);
      expect(response.headers.get('Allow')).toBe('POST');
      await expectResult(response, 405, {
        ok: false,
        fieldErrors: {_form: 'method'},
      });
    },
  );
  it('rejects resource loader access', async () => {
    await expectResult(loader(), 405, {
      ok: false,
      fieldErrors: {_form: 'method'},
    });
  });
  it('accepts a valid submission without a photo or optional fields', async () => {
    await expectResult(
      await submit(form({lastName: null, phone: null, company: null})),
      200,
      {ok: true},
    );
  });
  it('trims fields and lowercases the normalized server email', () => {
    expect(
      validateReviewFields(
        form({
          firstName: '  Anna ',
          lastName: ' Example ',
          email: ' ANNA+Review@EXAMPLE.COM ',
          phone: ' +49 123 ',
          rating: ' 4 ',
          comment: ' A lovely experience. ',
        }),
      ),
    ).toEqual({
      value: {
        firstName: 'Anna',
        lastName: 'Example',
        email: 'anna+review@example.com',
        phone: '+49 123',
        rating: 4,
        comment: 'A lovely experience.',
      },
      fieldErrors: {},
    });
  });
  it.each([
    ['firstName', null, false],
    ['firstName', ' ', false],
    ['firstName', 'a', false],
    ['firstName', 'aa', true],
    ['firstName', 'a'.repeat(80), true],
    ['firstName', 'a'.repeat(81), false],
    ['lastName', '', true],
    ['lastName', 'a'.repeat(80), true],
    ['lastName', 'a'.repeat(81), false],
    ['email', null, false],
    ['email', 'bad', false],
    ['email', 'a@@b.com', false],
    ['email', 'a b@example.com', false],
    ['email', '<a>@example.com', false],
    ['email', 'a'.repeat(242) + '@example.com', true],
    ['email', 'a'.repeat(243) + '@example.com', false],
    ['phone', '', true],
    ['phone', '1'.repeat(40), true],
    ['phone', '1'.repeat(41), false],
    ['rating', null, false],
    ['rating', '0', false],
    ['rating', '6', false],
    ['rating', '2.5', false],
    ['rating', '3.0', false],
    ['rating', '1', true],
    ['rating', '2', true],
    ['rating', '3', true],
    ['rating', '4', true],
    ['rating', '5', true],
    ['comment', null, false],
    ['comment', 'a'.repeat(9), false],
    ['comment', 'a'.repeat(10), true],
    ['comment', 'a'.repeat(3000), true],
    ['comment', 'a'.repeat(3001), false],
  ] as const)(
    'validates %s boundary (case %#)',
    async (field, value, valid) => {
      await expectResult(
        await submit(form({[field]: value})),
        valid ? 200 : 400,
        valid ? {ok: true} : {ok: false, fieldErrors: {[field]: field}},
      );
    },
  );
  it.each(['jpeg', 'png', 'webp'] as const)(
    'accepts real %s regardless of declared MIME and filename',
    async (format) => {
      const data = form();
      data.set(
        'photo',
        new Blob([bytes(format)], {type: 'application/octet-stream'}),
        'untrusted.txt',
      );
      await expectResult(await submit(data), 200, {ok: true});
    },
  );
  it('accepts extended and animated WebP containers with real image chunks', async () => {
    const chunk = (type: string, data: Uint8Array) => {
      const result = new Uint8Array(8 + data.length + (data.length % 2));
      result.set(new TextEncoder().encode(type));
      new DataView(result.buffer).setUint32(4, data.length, true);
      result.set(data, 8);
      return result;
    };
    const imageChunk = bytes('webp').slice(12);
    for (const animated of [false, true]) {
      const extended = new Uint8Array(10);
      extended[0] = animated ? 2 : 0;
      const frame = new Uint8Array(16 + imageChunk.length);
      frame.set(imageChunk, 16);
      const chunks = [
        chunk('VP8X', extended),
        ...(animated
          ? [chunk('ANIM', new Uint8Array(6)), chunk('ANMF', frame)]
          : [imageChunk]),
      ];
      const container = new Uint8Array(
        12 + chunks.reduce((sum, value) => sum + value.length, 0),
      );
      container.set(new TextEncoder().encode('RIFF'));
      container.set(new TextEncoder().encode('WEBP'), 8);
      new DataView(container.buffer).setUint32(4, container.length - 8, true);
      let offset = 12;
      for (const value of chunks) {
        container.set(value, offset);
        offset += value.length;
      }
      const data = form();
      data.set('photo', new Blob([container]), 'photo.webp');
      await expectResult(await submit(data), 200, {ok: true});
    }
  });
  it('treats the empty browser file placeholder as no photo', async () => {
    const data = form();
    data.set('photo', new Blob([]), '');
    // Node's FormData encoder omits filename="" for this placeholder; browsers
    // include it. Exercise the actual browser multipart representation.
    const encoded = new Request('https://example.com', {
      method: 'POST',
      body: data,
    });
    const body = (await encoded.text()).replace(
      'name="photo"',
      'name="photo"; filename=""',
    );
    await expectResult(
      await submit(body, {
        'Content-Type': encoded.headers.get('Content-Type')!,
      }),
      200,
      {ok: true},
    );
  });
  it('rejects a selected zero-byte file', async () => {
    const data = form();
    data.set('photo', new Blob([]), 'empty.jpg');
    await expectResult(await submit(data), 400, {
      ok: false,
      fieldErrors: {photo: 'photoEmpty'},
    });
  });
  it.each([
    ['fake.jpg', 'just text'],
    [
      'image.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ],
    ['image.gif', 'GIF89a'],
    ['document.pdf', '%PDF-1.7'],
    ['page.html', '<html><script>alert(1)</script></html>'],
    ['program.exe', 'MZ executable'],
    ['binary.jpg', '\u0000\u0001\u0002\u0003'],
  ])(
    'rejects unsupported bytes in %s even with JPEG MIME',
    async (name, content) => {
      const data = form();
      data.set('photo', new Blob([content], {type: 'image/jpeg'}), name);
      await expectResult(await submit(data), 400, {
        ok: false,
        fieldErrors: {photo: 'photoType'},
      });
    },
  );
  it.each(['jpeg', 'png', 'webp'] as const)(
    'rejects truncated and corrupted %s signatures',
    async (format) => {
      for (const corrupt of [
        bytes(format).slice(0, 12),
        bytes(format).slice(1),
        bytes(format).slice(0, -2),
      ]) {
        const data = form();
        data.set('photo', new Blob([corrupt]), 'photo.' + format);
        await expectResult(await submit(data), 400, {
          ok: false,
          fieldErrors: {photo: 'photoType'},
        });
      }
    },
  );
  it('rejects a mismatched RIFF container size', async () => {
    const data = form();
    const invalid = bytes('webp');
    invalid[4] = 0;
    data.set('photo', new Blob([invalid]), 'photo.webp');
    await expectResult(await submit(data), 400, {
      ok: false,
      fieldErrors: {photo: 'photoType'},
    });
  });
  it('enforces the exact 5 MiB file boundary', async () => {
    for (const size of [MAX_REVIEW_PHOTO_BYTES, MAX_REVIEW_PHOTO_BYTES + 1]) {
      const photo = new Uint8Array(size);
      const jpeg = bytes('jpeg');
      photo.set(jpeg.slice(0, -2));
      photo.set([255, 217], size - 2);
      const data = form();
      data.set('photo', new Blob([photo]), 'photo.jpg');
      await expectResult(
        await submit(data),
        size === MAX_REVIEW_PHOTO_BYTES ? 200 : 413,
        size === MAX_REVIEW_PHOTO_BYTES
          ? {ok: true}
          : {ok: false, fieldErrors: {photo: 'photoSize'}},
      );
    }
  });
  it('rejects multiple photos including empty placeholders', async () => {
    const data = form();
    data.append('photo', new Blob([bytes('png')]), 'one.png');
    data.append('photo', new Blob([]), '');
    await expectResult(await submit(data), 400, {
      ok: false,
      fieldErrors: {photo: 'photoCount'},
    });
  });
  it.each(['company', ' '])(
    'returns identical apparent success for honeypot %j, skipping invalid fields/photo',
    async (company) => {
      const data = form({company, email: 'invalid', rating: '0'});
      data.set('photo', new Blob(['not an image']), 'fake.jpg');
      const response = await submit(data);
      await expectResult(response, 200, {ok: true});
    },
  );
  it('rejects duplicate text fields, file-valued text fields, unknown fields and text-valued photos', async () => {
    const duplicate = form();
    duplicate.append('email', 'second@example.com');
    const file = form();
    file.set('lastName', new Blob(['Example']), 'name.txt');
    const unknown = form({unexpected: 'data'});
    const photo = form({photo: 'not a file'});
    for (const [data, fieldErrors] of [
      [duplicate, {email: 'email'}],
      [file, {lastName: 'lastName'}],
      [unknown, {_form: 'malformed'}],
      [photo, {photo: 'photoType'}],
    ] as const) {
      await expectResult(await submit(data), 400, {ok: false, fieldErrors});
    }
  });
  it.each([
    ['multipart/form-data; boundary=missing', 'not multipart'],
    [
      'multipart/form-data; boundary=broken',
      '--broken\r\nContent-Disposition: form-data; name="photo"; filename="x.jpg"\r\n\r\nincomplete',
    ],
  ])('safely rejects malformed multipart %s', async (type, body) => {
    await expectResult(await submit(body, {'Content-Type': type}), 400, {
      ok: false,
      fieldErrors: {_form: 'malformed'},
    });
  });
  it('rejects unsupported content types', async () => {
    await expectResult(
      await submit('{}', {'Content-Type': 'application/json'}),
      415,
      {ok: false, fieldErrors: {_form: 'contentType'}},
    );
  });
  it('rejects a declared oversized body', async () => {
    await expectResult(
      await submit(form(), {
        'Content-Length': String(MAX_REVIEW_REQUEST_BYTES + 1),
      }),
      413,
      {ok: false, fieldErrors: {_form: 'requestSize'}},
    );
  });
  it('caps real streamed bytes without trusting absent or false Content-Length', async () => {
    for (const length of [undefined, '1']) {
      const cancel = vi.fn();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_REVIEW_REQUEST_BYTES + 1));
        },
        cancel,
      });
      const request = new Request('https://example.com/api/customer-review', {
        method: 'POST',
        body: stream,
        duplex: 'half',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=test',
          ...(length ? {'Content-Length': length} : {}),
        },
      } as RequestInit);
      await expectResult(
        await action({request} as Parameters<typeof action>[0]),
        413,
        {ok: false, fieldErrors: {_form: 'requestSize'}},
      );
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it('sanitizes read failures without reflecting or logging submitted data', async () => {
    const logs = ['log', 'warn', 'error', 'info'].map((name) =>
      vi.spyOn(console, name as 'log').mockImplementation(() => {}),
    );
    const request = new Request('https://example.com/api/customer-review', {
      method: 'POST',
      duplex: 'half',
      headers: {'Content-Type': 'multipart/form-data; boundary=test'},
      body: new ReadableStream({
        start(controller) {
          controller.error(
            new Error('private@example.com <script>private</script>'),
          );
        },
      }),
    } as RequestInit);
    await expectResult(
      await action({request} as Parameters<typeof action>[0]),
      400,
      {ok: false, fieldErrors: {_form: 'malformed'}},
    );
    await expectResult(
      await submit(form({comment: '<script>alert("private")</script>'})),
      200,
      {ok: true},
    );
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
