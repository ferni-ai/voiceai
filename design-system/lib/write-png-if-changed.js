/**
 * Render an SVG to a PNG, writing the file only when its pixels changed.
 *
 * Different libvips/zlib builds encode the same pixels to different bytes, and
 * the asset build's mtime check re-renders everything on a fresh checkout. So
 * each pre-commit asset build rewrote ~27 tracked favicon/logo/icon PNGs whose
 * pixels were identical (same size, different bytes), leaving the tree dirty.
 */
import fs from 'fs';

async function decode(sharp, input) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Whether two encoded images decode to the same pixels. */
export async function samePixels(sharp, a, b) {
  const [x, y] = await Promise.all([decode(sharp, a), decode(sharp, b)]);
  return (
    x.info.width === y.info.width &&
    x.info.height === y.info.height &&
    x.info.channels === y.info.channels &&
    x.data.equals(y.data)
  );
}

/** @returns {Promise<boolean>} whether the file was written */
export async function writePngIfChanged(sharp, svgPath, pngPath, size) {
  // Buffers, not paths: libvips caches decoded files by name.
  const png = await sharp(fs.readFileSync(svgPath)).resize(size, size).png().toBuffer();
  if (fs.existsSync(pngPath)) {
    try {
      if (await samePixels(sharp, png, fs.readFileSync(pngPath))) return false;
    } catch {
      // unreadable PNG: overwrite it
    }
  }
  fs.writeFileSync(pngPath, png);
  return true;
}
