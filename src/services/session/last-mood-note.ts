/**
 * The last call's mood, as Ferni's own sense of it, never as how they were.
 *
 * Prod call 2026-10-14 (#1415): the caller said they were doing pretty good
 * and Ferni answered that it was a lot better than yesterday. The caller had
 * said nothing about yesterday. A returning caller's system prompt states
 * Ferni's own mood tracking (humanizingState.lastMood, from getMoodShift) as
 * a fact about them ("Last time they seemed a bit tired - be gentle."), next
 * to "You talked yesterday." This labels it as Ferni's sense and says not to
 * tell it back to them. The summary line beside it gets caller provenance
 * from #1469 (lastCallerSummary). LAST_MOOD_AS_SENSE=off gives the old line.
 *
 * @module services/session/last-mood-note
 */
import { flagOn, type Env } from '../../config/env-flag.js';

/** The last-call mood lines as they were (LAST_MOOD_AS_SENSE=off). */
const MOOD_CONTEXT: Record<string, string> = {
  tired_but_present: 'Last time they seemed a bit tired - be gentle.',
  reflective: 'Last time they were in a reflective mood.',
  philosophical: 'Last time they were in a thoughtful, philosophical space.',
  energized: 'Last time they were full of energy!',
  grounded: 'Last time they seemed calm and grounded.',
  playful: 'Last time they were in a playful mood.',
  nostalgic: 'Last time they were feeling nostalgic.',
};

/** The same moods as Ferni's own sense of them. */
const MOOD_SENSE: Record<string, string> = {
  tired_but_present: 'a bit tired',
  reflective: 'reflective',
  philosophical: 'thoughtful',
  energized: 'full of energy',
  grounded: 'calm and grounded',
  playful: 'playful',
  nostalgic: 'nostalgic',
};

/** The last-call mood line for the system prompt, or none. Spread into the list. */
export function lastMoodNote(mood: string | undefined, env: Env = process.env): string[] {
  if (!mood || !Object.hasOwn(MOOD_CONTEXT, mood)) return [];
  if (!flagOn('LAST_MOOD_AS_SENSE', env)) return [MOOD_CONTEXT[mood]];
  return [
    `Your own sense last time, not something they said: they seemed ${MOOD_SENSE[mood]}. ` +
      'Let it shape your tone; never tell them how they were or how their day went unless they say so on this call.',
  ];
}
