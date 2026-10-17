/**
 * Ferni's own mood from the last call is never told to him as the caller's.
 *
 * Prod call 2026-10-14 (#1415): the caller said they were doing pretty good
 * and Ferni answered that it was a lot better than yesterday. The caller had
 * said nothing about yesterday. A returning caller's system prompt carried
 * "Last time they seemed a bit tired - be gentle." next to "You talked
 * yesterday.", but humanizingState.lastMood is Ferni's own persona mood:
 * selectPersonaMood (persona-mood.ts) picks it at random, weighted by time of
 * day, weather and his call count, and process-turn.ts saves it as
 * currentMood (humanizing-state.ts). Nothing the caller said produced it, so
 * the line is dropped. The summary line beside it gets caller provenance
 * from #1469 (lastCallerSummary). PERSONA_MOOD_NOT_CALLERS=off gives the old line.
 *
 * @module services/session/last-mood-note
 */
import { flagOn, type Env } from '../../config/env-flag.js';

/** The last-call mood lines as they were (PERSONA_MOOD_NOT_CALLERS=off). */
const MOOD_CONTEXT: Record<string, string> = {
  tired_but_present: 'Last time they seemed a bit tired - be gentle.',
  reflective: 'Last time they were in a reflective mood.',
  philosophical: 'Last time they were in a thoughtful, philosophical space.',
  energized: 'Last time they were full of energy!',
  grounded: 'Last time they seemed calm and grounded.',
  playful: 'Last time they were in a playful mood.',
  nostalgic: 'Last time they were feeling nostalgic.',
};

/** The old last-call mood line, only with PERSONA_MOOD_NOT_CALLERS=off; otherwise none. */
export function lastMoodNote(mood: string | undefined, env: Env = process.env): string[] {
  if (!mood || !Object.hasOwn(MOOD_CONTEXT, mood) || flagOn('PERSONA_MOOD_NOT_CALLERS', env))
    return [];
  return [MOOD_CONTEXT[mood]];
}
