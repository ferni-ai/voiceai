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

/** The wording two loops are compared by: case, spacing and end punctuation ignored. */
export function loopKey(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** The first loop with the same wording as `content`, if any. */
export function sameLoop<T extends { content: string }>(
  loops: readonly T[],
  content: string
): T | undefined {
  const key = loopKey(content);
  return loops.find((l) => loopKey(l.content) === key);
}

/** One loop per wording, keeping the first (callers pass newest first). */
export function oneLoopPerWording<T extends { content: string }>(loops: readonly T[]): T[] {
  const seen = new Set<string>();
  return loops.filter((l) => {
    const key = loopKey(l.content);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * `content` carried on to the end of its clause in `context` (the next . ! ? ; or line
 * break). When the clause runs past the part of the words that was kept, nothing is
 * added: a longer fragment is still a fragment.
 */
export function wholeClause(content: string, context: string | undefined): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!context) return text;
  const words = context.replace(/\s+/g, ' ');
  const at = words.toLowerCase().indexOf(text.toLowerCase());
  if (at < 0) return text;
  const rest = words.slice(at + text.length);
  const end = rest.search(/[.!?;\n]/);
  const kept = context.length < LOOP_CONTEXT_CHARS;
  const tail = end >= 0 ? rest.slice(0, end) : kept ? rest : '';
  return `${text}${tail}`.trim().replace(/[\s,:-]+$/, '');
}
