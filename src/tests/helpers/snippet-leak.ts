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

/**
 * Which of the `planted` fragments a log carries as text: in a key or a string
 * value. A bare `JSON.stringify(log).includes('555')` cannot tell a leaked phone
 * from a count, so a log that holds a 555-token section estimate or an 867 ms timing
 * fails a no-PII test it passes. Numbers are counts here; the one number that is
 * a leak, the planted phone's digits as a number, is caught through `digits`.
 * The value is read as it would be logged (JSON round-trip), so toJSON applies.
 */
export function plantedPiiIn(
  value: unknown,
  planted: readonly string[],
  digits?: string
): string[] {
  const texts: string[] = [];
  const numbers: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') texts.push(v);
    else if (typeof v === 'number') numbers.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object')
      for (const [key, inner] of Object.entries(v)) {
        texts.push(key);
        walk(inner);
      }
  };
  walk(JSON.parse(JSON.stringify(value) ?? 'null'));
  const found = planted.filter((p) => texts.some((t) => t.includes(p)));
  if (digits !== undefined && numbers.some((n) => n.includes(digits))) found.push(digits);
  return found;
}
