/**
 * The flagged pattern sets that add the caller's own crisis to a text score, in the order they are
 * read (crisis-imminent-raise.ts). A new set joins OWN_RAISES here, so detectCrisis gains no line.
 *
 * @module services/safety/crisis-own-raises
 */
import type { Env } from '../../config/env-flag.js';
import { withCloseDown, type Beside } from './crisis-caller-check.js';
import { raiseOwnCrisis, type RaisableScore } from './crisis-imminent-raise.js';
import { SPANISH_IMMINENT } from './crisis-spanish-imminent.js';

const OWN_RAISES = [SPANISH_IMMINENT];

/** A text score both steps read. */
type TurnScore = Parameters<typeof withCloseDown>[1] & RaisableScore;

/**
 * The text score with someone close going down (withCloseDown), then each flagged set's raise of
 * the caller's own crisis. Never lower than the score it was given.
 */
export const withCloseDownAndRaises = <T extends TurnScore>(
  text: string,
  score: T,
  env?: Env
): T & { beside?: Beside } => raiseOwnCrisis(text, withCloseDown(text, score), OWN_RAISES, env);
