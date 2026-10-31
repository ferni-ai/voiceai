/**
 * CRISIS_CLASSIFIER_CHECK (crisis-classifier-check.ts): whether the caller may be a minor, who
 * never gets the check and never clears one. Eval of #2961: a bare "15." after "How old are
 * you?" and a session MINOR_CARE already held both got the check.
 *
 * @module CrisisClassifierCheckMinor
 */

import { likelyMinor, statesUnder18, userHeld } from '../../utils/minor-care.js';

/** The call's lines, oldest first, by speaker (crisis-gate-words.ts callTranscript). */
export type Lines = ReadonlyArray<{ speaker: 'caller' | 'ferni'; text: string }>;

/** Who is calling: the session, its user, and every line said so far. */
export interface Caller {
  call?: string;
  userId?: string;
  latest: string;
  earlier?: readonly string[];
  companion?: string;
  lines?: Lines;
  env?: Record<string, string | undefined>;
}

/**
 * The caller may be a minor: MINOR_CARE holds the session or its user, or a line says under 18,
 * read with the Ferni line it answers (a bare "15." after "How old are you?").
 */
export function soundsMinor(c: Caller): boolean {
  if (likelyMinor(c.call) || userHeld(c.userId, c.env)) return true;
  const said: Array<[string, string | undefined]> = [[c.latest, c.companion]];
  for (const line of c.earlier ?? []) said.push([line, undefined]);
  let ferni: string | undefined;
  for (const line of c.lines ?? []) {
    if (line.speaker === 'ferni') ferni = line.text;
    else said.push([line.text, ferni]);
  }
  return said.some(([line, q]) => statesUnder18(line) || statesUnder18(line, q));
}
