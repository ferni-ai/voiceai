/**
 * Sameness across posts. The 2026-10-21 review found the same sentences in
 * every auto-drafted post ("a reply takes around two seconds", "a composite we
 * wrote, not a real person") and a changelog repeating 6 of the previous one's
 * 9 items. A draft that shares any run of PHRASE_WORDS words with one of the
 * last RECENT_POSTS posts in its blog is rejected.
 */

export const PHRASE_WORDS = 8;
export const RECENT_POSTS = 10;

/** The label the drafter puts on every letter (team-letter.ts): the same each time by design. */
const CHARACTER_LABEL = /^\*[^\n]*\bis a character, not a real person\.\*[ \t]*$/gm;

/** The words a reader reads, lower-cased: no code, link targets, URLs or PR references. */
export function words(markdown: string): string[] {
  return markdown
    .replace(CHARACTER_LABEL, ' ')
    .replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+/g, ' ')
    .replace(/\]\([^)]*\)/g, ' ')
    .replace(/\[?#\d+\]?/g, ' ')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const runs = (w: string[], n: number): string[] =>
  Array.from({ length: Math.max(0, w.length - n + 1) }, (_, i) => w.slice(i, i + n).join(' '));

/**
 * Each stretch of the draft that repeats an earlier post, as one phrase:
 * overlapping 8-word runs merge, so a repeated sentence is reported once.
 */
export function repeatedPhrases(body: string, recent: string[], n = PHRASE_WORDS): string[] {
  const seen = new Set(recent.flatMap((post) => runs(words(post), n)));
  const w = words(body);
  const hit = new Array<boolean>(w.length).fill(false);
  runs(w, n).forEach((run, i) => {
    if (seen.has(run)) hit.fill(true, i, i + n);
  });
  const phrases: string[] = [];
  let start = -1;
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length && hit[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      phrases.push(w.slice(start, i).join(' '));
      start = -1;
    }
  }
  return phrases;
}

/** PR numbers a post's body mentions: `#N`, `[#N]` or a /pull/N link. */
export function mentionedPrs(body: string): Set<number> {
  const found = [...body.matchAll(/(?<![\w&])#(\d+)\b|\/pull\/(\d+)\b/g)];
  return new Set(found.map((m) => Number(m[1] ?? m[2])));
}
