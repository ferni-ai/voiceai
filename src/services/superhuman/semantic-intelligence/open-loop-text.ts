/**
 * What an open loop says, and when two loops say the same thing.
 *
 * Loops are detected with short patterns ("I need to" plus up to five words), so a
 * stored loop's `content` often stops mid-thought ("I'll follow up with you to see").
 * Its `context` keeps the first 200 characters of what the user said, which is where
 * the rest of the clause is.
 *
 * 2026-11-16 audit: Story So Far listed the same loop twice, three times over. Every
 * user turn ran open-loop detection twice (the turn handler and turn learning both
 * called processSemanticIntelligence), and each pass saved its own copy under a new
 * random id. One loop per wording is the rule here; createOpenLoop and the Story read
 * both apply it.
 *
 * @module services/superhuman/semantic-intelligence/open-loop-text
 */

/** How much of the user's words a loop keeps as `context` (open-loops.ts). */
export const LOOP_CONTEXT_CHARS = 200;

/** What two loops are compared by. */
export interface LoopWords {
  content: string;
  relatedPerson?: string;
}

/** Case, spacing and end punctuation ignored. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * The wording and who it is about: "I'll call her tomorrow" about a sister and about mom
 * are two loops; the same words with the same person (or none) are one.
 */
export function loopKey(loop: LoopWords): string {
  return `${plain(loop.content)}|${loop.relatedPerson ? plain(loop.relatedPerson) : ''}`;
}

/** The first loop with the same wording and person as `loop`, if any. */
export function sameLoop<T extends LoopWords>(loops: readonly T[], loop: LoopWords): T | undefined {
  const key = loopKey(loop);
  return loops.find((l) => loopKey(l) === key);
}

/** One loop per wording and person, keeping the first (callers pass newest first). */
export function oneLoopPerWording<T extends LoopWords>(loops: readonly T[]): T[] {
  const seen = new Set<string>();
  return loops.filter((l) => {
    const key = loopKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** How many words a clause may add to the detector's fragment. */
const MAX_ADDED_WORDS = 8;

/**
 * `content` carried on to the end of its clause in `context`: the next comma, semicolon,
 * colon, dash, sentence end or line break. Only a short clause is completed: when it runs
 * past the part of the words that was kept, or adds more than eight words, the fragment
 * stays as it is. The loop never carries the rest of a private sentence ("I need to call
 * the clinic, my test came back ..." reads "I need to call the clinic").
 */
export function wholeClause(content: string, context: string | undefined): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!context) return text;
  const words = context.replace(/\s+/g, ' ');
  const at = words.toLowerCase().indexOf(text.toLowerCase());
  if (at < 0) return text;
  const rest = words.slice(at + text.length);
  const end = rest.search(/[.!?;:,\n\u2013\u2014]|\s-+\s/);
  if (end < 0 && context.length >= LOOP_CONTEXT_CHARS) return text;
  const tail = end >= 0 ? rest.slice(0, end) : rest;
  if (tail.trim().split(' ').filter(Boolean).length > MAX_ADDED_WORDS) return text;
  return `${text}${tail}`.trim().replace(/[\s,:-]+$/, '');
}
