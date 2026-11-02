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
 * Which of the `planted` fragments a log carries: in a key, a string, or a number.
 * A bare `JSON.stringify(log).includes('555')` cannot tell a leaked phone from a
 * count, so a log holding a 555-token section estimate fails a no-PII test it
 * passes. `countKeys` names top-level fields of the log object that hold counts;
 * a number under one of them is skipped. Only the outermost object's own keys
 * qualify (arrays around it, such as logger call args, do not count as nesting),
 * so a `{ caller: { tokens: 5309 } }` is still caught. Every other number is read
 * as text, so a phone fragment logged as a number (a `last4: 5309`) is caught.
 * The value is read as it would be logged (JSON round-trip), so toJSON applies.
 */
export function plantedPiiIn(
  value: unknown,
  planted: readonly string[],
  countKeys: readonly string[] = []
): string[] {
  const texts: string[] = [];
  const walk = (v: unknown, inCount: boolean, topLevel: boolean): void => {
    if (typeof v === 'string') texts.push(v);
    else if (typeof v === 'number') {
      if (!inCount) texts.push(String(v));
    } else if (Array.isArray(v)) v.forEach((item) => walk(item, inCount, topLevel));
    else if (v !== null && typeof v === 'object')
      for (const [key, inner] of Object.entries(v)) {
        texts.push(key);
        walk(inner, inCount || (topLevel && countKeys.includes(key)), false);
      }
  };
  walk(JSON.parse(JSON.stringify(value) ?? 'null'), false, true);
  return planted.filter((p) => texts.some((t) => t.includes(p)));
}
