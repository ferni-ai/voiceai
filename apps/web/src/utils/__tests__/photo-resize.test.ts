/**
 * Contact photos are shrunk before upload. The encoder here is sharp, a real
 * JPEG encoder, standing in for the browser canvas (jsdom has none).
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  PHOTO_MAX_SIDE_PX,
  PHOTO_TARGET_BYTES,
  encodeUnderTarget,
  fitWithin,
  type JpegEncoder,
} from '../photo-resize.js';

/** Random noise: the hardest photo there is to compress. */
function noise(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[i] = seed >> 16;
  }
  return pixels;
}

function sharpEncoder(
  pixels: Buffer,
  width: number,
  height: number
): { encode: JpegEncoder; calls: Array<[number, number, number]> } {
  const calls: Array<[number, number, number]> = [];
  const encode: JpegEncoder = async (w, h, quality) => {
    calls.push([w, h, quality]);
    const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .resize(w, h)
      .jpeg({ quality: Math.round(quality * 100) })
      .toBuffer();
    return new Blob([new Uint8Array(jpeg)]);
  };
  return { encode, calls };
}

describe('contact photo resize', () => {
  it('turns a large, hard-to-compress photo into a JPEG under the target', async () => {
    const width = 4032;
    const height = 3024; // a 12 MP phone photo
    const { encode, calls } = sharpEncoder(noise(width, height), width, height);

    const blob = await encodeUnderTarget(width, height, encode);

    expect(blob.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    for (const [w, h] of calls) expect(Math.max(w, h)).toBeLessThanOrEqual(PHOTO_MAX_SIDE_PX);
    expect(calls[0]).toEqual([512, 384, 0.85]);
  }, 60_000);

  it('steps quality down, then size, until the photo fits', async () => {
    // An encoder whose output only fits at the smallest quality of the half size.
    const seen: Array<[number, number, number]> = [];
    const encode: JpegEncoder = async (w, h, q) => {
      seen.push([w, h, q]);
      return new Blob([new Uint8Array(w === 256 && q === 0.4 ? 10 : 10 * PHOTO_TARGET_BYTES)]);
    };

    const blob = await encodeUnderTarget(1024, 1024, encode);

    expect(blob.size).toBe(10);
    expect(seen.slice(0, 5)).toEqual([
      [512, 512, 0.85],
      [512, 512, 0.7],
      [512, 512, 0.55],
      [512, 512, 0.4],
      [256, 256, 0.85],
    ]);
  });

  it('refuses rather than uploading a photo it cannot get under the target', async () => {
    const encode: JpegEncoder = async () => new Blob([new Uint8Array(PHOTO_TARGET_BYTES + 1)]);
    await expect(encodeUnderTarget(4000, 3000, encode)).rejects.toThrow('small enough');
  });

  it('never enlarges a small photo', () => {
    expect(fitWithin(300, 200, PHOTO_MAX_SIDE_PX)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(3000, 1000, PHOTO_MAX_SIDE_PX)).toEqual({ width: 512, height: 171 });
  });
});
