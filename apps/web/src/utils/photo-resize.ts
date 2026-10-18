/**
 * Shrink a contact photo in the browser before it is uploaded.
 *
 * The relationship card used to send the picked file as a data URL of up to 5 MB.
 * The server stores it inside the contact's Firestore document, which holds at
 * most 1 MiB, so a big photo failed to save while the card said it had. A JPEG
 * of at most 512 px on its longest side is plenty for an avatar and lands well
 * under the server's photo cap.
 */

/** Longest side of the uploaded photo, in pixels. */
export const PHOTO_MAX_SIDE_PX = 512;
/** Encoded size to stay under, in bytes. */
export const PHOTO_TARGET_BYTES = 200 * 1024;
/** JPEG qualities to try, best first, before the photo is made smaller. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];
/** Below this longest side the photo is no longer worth shrinking further. */
const MIN_SIDE_PX = 64;

/** Encodes the source photo at a size and JPEG quality. */
export type JpegEncoder = (width: number, height: number, quality: number) => Promise<Blob>;

interface Size {
  width: number;
  height: number;
}

/** `width` x `height` scaled down, never up, so its longest side is at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Every size and quality to try, in order: lower quality first, then half the size. */
function attempts(width: number, height: number): Array<Size & { quality: number }> {
  const list: Array<Size & { quality: number }> = [];
  let size = fitWithin(width, height, PHOTO_MAX_SIDE_PX);
  for (;;) {
    for (const quality of QUALITIES) list.push({ ...size, quality });
    const side = Math.max(size.width, size.height);
    if (side <= MIN_SIDE_PX) return list;
    size = fitWithin(size.width, size.height, Math.max(MIN_SIDE_PX, Math.floor(side / 2)));
  }
}

/**
 * The first encoding, from the list above, that fits in `targetBytes`. Rejects
 * if even the smallest one is too big.
 */
export async function encodeUnderTarget(
  width: number,
  height: number,
  encode: JpegEncoder,
  targetBytes = PHOTO_TARGET_BYTES
): Promise<Blob> {
  const tries = attempts(width, height);
  const tryAt = async (i: number): Promise<Blob> => {
    const attempt = tries[i];
    if (!attempt) throw new Error('Photo could not be made small enough to upload');
    const { width: w, height: h, quality } = attempt;
    const blob = await encode(w, h, quality);
    return blob.size <= targetBytes ? blob : tryAt(i + 1);
  };
  return tryAt(0);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo'));
    reader.readAsDataURL(blob);
  });
}

/** The photo as a JPEG data URL, at most 512 px on its longest side and under 200 KB. */
export async function resizePhotoToDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const encode: JpegEncoder = (width, height, quality) => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return Promise.reject(new Error('Canvas 2D is unavailable'));
      // JPEG has no transparency: paint a white backdrop so transparent PNGs don't turn black.
      context.fillStyle = 'white';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))),
          'image/jpeg',
          quality
        );
      });
    };
    return await blobToDataUrl(await encodeUnderTarget(bitmap.width, bitmap.height, encode));
  } finally {
    bitmap.close();
  }
}
