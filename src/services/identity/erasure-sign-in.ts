/**
 * An account deletion switches the person's Firebase sign-in off before any data goes, and
 * deletes it last. In between (and for good, if that last delete fails) the account reads as
 * disabled, not live, so nothing that checks it (account-live-now.ts: a web hang-up making a
 * first user record) brings the erased person back (#2966).
 *
 * The person's right to erase wins: a sign-in that can't be switched off is logged with a
 * reason and a count (no ids) and the erasure goes on; the last step tries again. An erasure
 * that fails switches back on a sign-in this deletion switched off, so the person can retry,
 * as the routes tell them. Only account deletion uses this: "delete my data"
 * (DELETE /api/export/all) erases the data and keeps the account.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { assertErased } from '../platform/erasure-step.js';
import {
  deleteFirebaseUser,
  getFirebaseUserOrThrow,
  setFirebaseUserDisabled,
} from './firebase-auth.js';

const log = createLogger({ module: 'erasure-sign-in' });

type Failure = 'disable_failed' | 'final_disable_failed' | 'restore_failed';
const failures = new Map<Failure, number>();

function countFailure(reason: Failure): void {
  const count = (failures.get(reason) ?? 0) + 1;
  failures.set(reason, count);
  log.error({ event: 'ERASURE_SIGN_IN', reason, count }, 'Account deletion: sign-in not switched');
}

/** Off before the erasure. True when this call switched it off (it was on, and known to be). */
async function switchOff(uid: string): Promise<boolean> {
  let wasOn: boolean | null = null; // null: the lookup failed, so it isn't known
  try {
    const user = await getFirebaseUserOrThrow(uid);
    if (!user || user.disabled) return false; // no Firebase user, or already off
    wasOn = true;
  } catch {
    // Unknown state: switch it off anyway, and never switch it back on
  }
  const result = await setFirebaseUserDisabled(uid, true);
  if (result === 'failed') countFailure('disable_failed');
  return result === 'done' && wasOn === true;
}

/**
 * Run an account deletion's erasure with the sign-in off: off first, then `erase`, whose
 * results must show every step done (assertErased). A failed erasure switches the sign-in
 * back on if this switched it off, then throws.
 */
export async function eraseWithSignInOff(
  uid: string,
  erase: () => Promise<Record<string, boolean>>
): Promise<Record<string, boolean>> {
  const switchedOff = await switchOff(uid);
  try {
    const results = await erase();
    assertErased(results);
    return results;
  } catch (error) {
    if (switchedOff && (await setFirebaseUserDisabled(uid, false)) === 'failed') {
      countFailure('restore_failed');
    }
    throw error;
  }
}

/**
 * The last step: delete the Firebase user. If that fails, switch the sign-in off (again, or
 * for the first time when the start couldn't), so the account stays not live.
 */
export async function deleteSignInAfterErasure(uid: string): Promise<boolean> {
  let deleted = false;
  try {
    deleted = await deleteFirebaseUser(uid);
  } finally {
    if (!deleted && (await setFirebaseUserDisabled(uid, true)) === 'failed') {
      countFailure('final_disable_failed');
    }
  }
  return deleted;
}
