/**
 * Did any piece of the caller's words survive? A test that only looks for the
 * whole sentinel passes when a 30-character slice of it was stored (#2759's
 * verifier found exactly that), so this checks every run of WINDOW characters.
 */

/** Synthetic words a caller might say: no label or field name contains a piece of it. */
export const SENTINEL = 'my sister Dolores has stage-three lupus and I keep thinking about her';

/** Short enough to catch a truncated or nested slice, long enough not to hit a label. */
export const WINDOW = 10;

/** 30-character slices from the start, the middle and the end. */
export const PARTIALS = [SENTINEL.slice(0, 30), SENTINEL.slice(20, 50), SENTINEL.slice(-30)];

/** Every WINDOW-character piece of `sentinel` found in `value` (JSON of it). */
export function leakedPieces(value: unknown, sentinel = SENTINEL): string[] {
  const text = (typeof value === 'string' ? value : (JSON.stringify(value) ?? '')).toLowerCase();
  const found = new Set<string>();
  for (let i = 0; i + WINDOW <= sentinel.length; i++) {
    const piece = sentinel.slice(i, i + WINDOW).toLowerCase();
    if (text.includes(piece)) found.add(piece);
  }
  return [...found];
}
