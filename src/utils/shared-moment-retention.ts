/**
 * How long, and how much of, the caller's own words a shared moment keeps (Seth, 2026-10-26):
 * at most 80 characters of what they said, and the moment expires a year after it is written.
 * Every store that keeps shared moments writes through clampMomentWords and momentExpireAt and
 * reads through unexpiredMoments:
 * - bogle_users/{uid}/shared_moments (context-builders/relationship/shared-moments.ts and
 *   services/superhuman/inside-joke-memory.ts): a Firestore TTL policy on expireAt deletes the
 *   docs, lazily (up to a day or more late), so readers drop them too
 * - bogle_users/{uid}/relationships/{persona}.sharedMoments (relationship engine) and
 *   bogle_users/{uid}/trust_profiles/inside_jokes (trust-systems/inside-jokes.ts): moments
 *   inside one document, so no TTL can reach them: reads drop expired ones and the next save
 *   leaves them out
 * - bogle_users/{uid}/human_signals/inside_jokes (memory/storage/human-signal-persistence.ts):
 *   one document too; reads drop expired jokes and the next save removes them
 * - bogle_users/{uid}/summaries insideJokes (memory/operations/inside-jokes.ts): a summary is
 *   written once, so recall drops expired bits and an after-call sweep takes them out
 *   (memory/storage/summary-joke-retention.ts)
 * Moments written before this have no expireAt and are kept as they are.
 *
 * @module utils/shared-moment-retention
 */

/** Characters (UTF-16 code units, what `.length` counts) of the caller's words a moment keeps */
export const MOMENT_WORDS_MAX = 80;

/** A shared moment expires this long after it is written */
export const MOMENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const ELLIPSIS = '…';
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * The caller's words, at most MOMENT_WORDS_MAX long: cut on a word boundary when one is in the
 * second half, else on a character (grapheme) boundary, so an emoji or accented letter is never
 * split; "…" marks a cut.
 */
export function clampMomentWords(text: string | undefined | null): string {
  const words = (text ?? '').trim();
  if (words.length <= MOMENT_WORDS_MAX) return words;
  const budget = MOMENT_WORDS_MAX - ELLIPSIS.length;
  let cut = '';
  for (const { segment } of graphemes.segment(words)) {
    if (cut.length + segment.length > budget) break;
    cut += segment;
  }
  const nextIsSpace = /\s/.test(words.charAt(cut.length));
  const lastSpace = cut.search(/\s\S*$/);
  if (!nextIsSpace && lastSpace > budget / 2) cut = cut.slice(0, lastSpace);
  cut = cut.trimEnd();
  return cut ? cut + ELLIPSIS : '';
}

/** When a moment written at `now` expires (a Date: Firestore stores it as a Timestamp) */
export function momentExpireAt(now: number = Date.now()): Date {
  return new Date(now + MOMENT_TTL_MS);
}

/**
 * Epoch ms of a stored expireAt: a Timestamp, Date, epoch ms, ISO string, or a Timestamp that
 * went through JSON ({_seconds}: the relationship engine's save does that); undefined if none
 */
function expiryMs(expireAt: unknown): number | undefined {
  if (expireAt === undefined || expireAt === null) return undefined;
  if (expireAt instanceof Date) return expireAt.getTime();
  if (typeof expireAt === 'number') return expireAt;
  if (typeof expireAt === 'string') return Date.parse(expireAt);
  const at = expireAt as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof at.toMillis === 'function') return at.toMillis();
  const seconds = at.seconds ?? at._seconds;
  return typeof seconds === 'number' ? seconds * 1000 : undefined;
}

/** Past its expireAt (a moment with none, written before the policy, never expires) */
export function isMomentExpired(moment: { expireAt?: unknown }, now: number = Date.now()): boolean {
  const at = expiryMs(moment.expireAt);
  return at !== undefined && !Number.isNaN(at) && at <= now;
}

/** These moments without the expired ones */
export function unexpiredMoments<T extends { expireAt?: unknown }>(
  moments: readonly T[],
  now: number = Date.now()
): T[] {
  return moments.filter((m) => !isMomentExpired(m, now));
}
