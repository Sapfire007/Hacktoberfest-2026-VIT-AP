/**
 * Input hygiene shared by the routes and services.
 *
 * Request bodies are caller-controlled JSON: a field the app always sends as a string can
 * arrive as a number, an object or ten megabytes of text. These helpers turn that into
 * something safe to store, and recognise the image and document bytes the app actually
 * sends, so nothing else - an HTML page, an SVG with a script in it - is stored as an "ID
 * photo" and later rendered in the admin console.
 */

/** A trimmed string, cut to `max` characters. Anything that is not a string becomes ''. */
export function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Firestore's own document size limit. A data URI this large could never be saved anyway. */
export const MAX_DATA_URI_CHARS = 1_048_576;

export type FileKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf';

/** What the leading bytes of a file say it is, regardless of what the client labelled it. */
export function detectFileKind(bytes: Buffer): FileKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const IMAGE_DATA_URI = /^data:image\/(jpeg|jpg|png|webp);base64,/i;

/** The first bytes of a base64 string, without decoding the whole thing. */
function leadingBytes(base64: string): Buffer {
  return Buffer.from(base64.slice(0, 24), 'base64');
}

/**
 * Whether `value` is a photo the gate app could have taken: a JPEG, PNG or WebP data URI
 * under Firestore's size limit. The bytes are checked, not just the label - the web picker
 * labels a PNG as jpeg, which is harmless, but a label is no evidence of what is inside.
 */
export function isImageDataUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_DATA_URI_CHARS) return false;
  const match = IMAGE_DATA_URI.exec(value);
  if (!match) return false;
  const body = value.slice(match[0].length);
  if (body.length < 16 || !BASE64_BODY.test(body)) return false;
  const kind = detectFileKind(leadingBytes(body));
  return kind === 'jpeg' || kind === 'png' || kind === 'webp';
}

/** Storage references the backend itself produces. Anything else is not stored. */
export function isStorageUri(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2048 &&
    (value.startsWith('https://firebasestorage.googleapis.com/') || value.startsWith('gs://'))
  );
}
