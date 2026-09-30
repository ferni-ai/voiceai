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

function saysName(text: string, name: string): boolean {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.length >= 2 && new RegExp(`\\b${escaped}\\b`, 'i').test(text);
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
