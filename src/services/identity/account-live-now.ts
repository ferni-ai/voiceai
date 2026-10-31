/**
 * Is this Firebase account live right now? Asked of Firebase Auth itself, uncached, for a
 * caller about to create something for the account that a cached token check would let
 * through: a token keeps verifying on other instances for a while after the account is
 * erased, and an erased account's records must not come back (#2966).
 *
 * gone: Firebase has no such user (an erasure finished, or the id was never Firebase's).
 * disabled: the account is switched off. unavailable: the lookup failed, so nothing is known;
 * a caller that would create a record treats that as a refusal, never as live.
 */

import { getFirebaseUserOrThrow } from './firebase-auth.js';

export type AccountNow = 'live' | 'gone' | 'disabled' | 'unavailable';

export async function accountLiveNow(uid: string): Promise<AccountNow> {
  try {
    const user = await getFirebaseUserOrThrow(uid);
    if (!user) return 'gone';
    return user.disabled ? 'disabled' : 'live';
  } catch {
    return 'unavailable';
  }
}
