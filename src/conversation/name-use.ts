/**
 * Using the caller's name the way a friend does: rarely.
 *
 * Language models say your name every other reply ("That's great, Sam! You
 * know, Sam..."), which reads as a sales script. Friends use a name at hello,
 * for emphasis, or in a tender moment. When a recent reply already used it,
 * the next one leaves it out.
 *
 * Pure: matching and wording.
 *
 * @module conversation/name-use
 */

/** Replies back to look at: a name every few replies at most. */
export const NAME_WINDOW = 3;

export const NAME_REST_CUE =
  '[THEIR NAME] You used their name recently; leave it out of this reply. Friends use a name rarely.';

/** Names that are also everyday words: only a capitalized use is the name. */
const WORD_NAMES = new Set(
  'will hope grace mark joy faith bill rose jack may june april dawn ray rob sky art sunny summer autumn'.split(
    ' '
  )
);

function saysName(text: string, name: string): boolean {
  // The first name is what people say ("Seth", not "Seth Smith")
  const first = name.trim().split(/\s+/)[0] ?? '';
  if (first.length < 2) return false;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = WORD_NAMES.has(first.toLowerCase()) ? 'u' : 'iu';
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags).test(text);
}

/**
 * The cue for the next reply, or null when the name has not been used in the
 * last few replies (or is unknown).
 */
export function nameRestCue(
  name: string | undefined,
  recentAgentReplies: readonly string[]
): string | null {
  if (!name?.trim()) return null;
  const recent = recentAgentReplies.slice(-NAME_WINDOW);
  return recent.some((r) => saysName(r, name)) ? NAME_REST_CUE : null;
}
