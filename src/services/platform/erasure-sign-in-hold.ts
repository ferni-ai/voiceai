/**
 * The sign-ins a data-only erasure ("delete my data", the account kept) holds while it
 * runs (#3292): the user's and each linked phone profile's. deleteAllData owns one and
 * releases it exactly once, however the erasure ends, so a failed erasure never leaves
 * its hold behind. The refusing itself lives in identity/token-revocation.ts.
 *
 * @module services/platform/erasure-sign-in-hold
 */

import { flagOn } from '../../config/env-flag.js';
import {
  holdSignIn,
  releaseSignIn,
  type ErasureHold,
  type ErasureOutcome,
} from '../identity/token-revocation.js';

export interface SignInHold {
  /**
   * Holds these sign-ins until release. False with DATA_ERASE_KEEPS_SIGNIN off: nothing
   * is held, and the caller ends the sign-ins for good, as before.
   */
  hold: (userIds: readonly string[]) => boolean;
  /** Ends the hold (see releaseSignIn); a second call does nothing */
  release: (outcome: ErasureOutcome) => void;
}

export function signInHold(): SignInHold {
  let held: ErasureHold[] = [];
  return {
    hold: (userIds) => {
      if (!flagOn('DATA_ERASE_KEEPS_SIGNIN')) return false;
      held = [...held, ...userIds.map((uid) => holdSignIn(uid))];
      return true;
    },
    release: (outcome) => {
      for (const hold of held) releaseSignIn(hold, outcome);
      held = [];
    },
  };
}

/** 'erased' only when every step reported its data gone; one false leaves data behind */
export function erasureOutcome(results: Record<string, boolean>): ErasureOutcome {
  return Object.values(results).includes(false) ? 'failed' : 'erased';
}
