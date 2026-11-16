/**
 * One item per wording, for lists the server may send a line twice in.
 *
 * 2026-11-16 audit: Story So Far listed each open loop twice and GET /api/team-insights
 * carried the same team note six times. The server now saves and reads one per wording;
 * a list drawn here still never shows the same line twice.
 *
 * Two lines are the same wording when they differ only in case, spacing, end
 * punctuation, or a spaced hyphen or dash standing in for a comma.
 */

export function wordingKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+[-–—]+\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** The first item of each key, in order. */
export function onePerKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The first item of each wording, in order. `textOf` names the line an item shows. */
export function onePerWording<T>(items: readonly T[], textOf: (item: T) => string): T[] {
  return onePerKey(items, (item) => wordingKey(textOf(item)));
}
