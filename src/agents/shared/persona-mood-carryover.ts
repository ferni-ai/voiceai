/**
 * The persona's own mood, carried from the last conversation into this one.
 *
 * profile.humanizingState.lastMood is the PERSONA's MoodState (written by
 * humanizing-context-builder), not the caller's. It used to be read as the
 * caller's ("Last time they seemed a bit tired"), which put words in their
 * mouth. Read correctly it gives the persona continuity: people do not reset
 * between calls, and a trace of how they left carries into the next hello.
 *
 * @module agents/shared/persona-mood-carryover
 */

import type { MoodState } from '../../types/humanizing-types.js';

const HOW_YOU_LEFT: Record<MoodState, string> = {
  energized: 'full of energy',
  reflective: 'in a reflective mood',
  playful: 'in a playful mood',
  grounded: 'calm and grounded',
  tired_but_present: 'a little tired but present',
  philosophical: 'in a thoughtful, big-picture mood',
  nostalgic: 'a bit nostalgic',
};

/** A context line for the persona's carried-over mood, or undefined for an unknown mood. */
export function personaMoodCarryover(mood: string | undefined): string | undefined {
  const how = mood ? HOW_YOU_LEFT[mood as MoodState] : undefined;
  if (!how) return undefined;
  return `You left your last conversation with them ${how}. A trace of that can carry into today if it fits; it is your mood, not theirs, so never attribute it to them.`;
}
