/**
 * The flagged pattern sets that add the caller's own crisis to a text score, in the order they are
 * read (crisis-imminent-raise.ts). A new set joins OWN_RAISES here, so detectCrisis gains no line:
 * it passes the whole list.
 *
 * @module services/safety/crisis-own-raises
 */
import type { Env } from '../../config/env-flag.js';
import { withCloseDown, type Beside } from './crisis-caller-check.js';
import { raiseOwnCrisis, type CrisisRaise, type RaisableScore } from './crisis-imminent-raise.js';
import { SPANISH_IMMINENT } from './crisis-spanish-imminent.js';

/** Every set, read in this order. A row proves the whole list never lowers a read. */
export const OWN_RAISES: readonly CrisisRaise[] = [SPANISH_IMMINENT];

/** A text score both steps read. */
type TurnScore = Parameters<typeof withCloseDown>[1] & RaisableScore;

/**
 * The text score with someone close going down (withCloseDown), then each set's raise of the
 * caller's own crisis (OWN_RAISES in detectCrisis). Never lower than the score it was given.
 */
export const withCloseDownAndRaises = <T extends TurnScore>(
  text: string,
  score: T,
  raises: readonly CrisisRaise[],
  env?: Env
): T & { beside?: Beside } => raiseOwnCrisis(text, withCloseDown(text, score), raises, env);
