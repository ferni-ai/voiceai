/**
 * Push Preference
 *
 * Turning notifications on has to subscribe this browser on the server, or
 * nothing can ever be delivered; turning them off removes the subscription.
 *
 * A browser subscription belongs to one account. Signing out releases it, and
 * if a different account signs in on this browser without a sign-out (e.g. a
 * new sign-in over an expired session), the subscription is either moved to
 * the new account (the server allows that because the keys match) or dropped,
 * so the previous account's notifications never reach the new person.
 */

import { toast } from '../ui/whisper.ui.js';
import { isNative } from '../utils/platform.js';
import { getFirebaseUid, onAuthStateChange, signOut } from './firebase-auth.service.js';
import { getPushNotificationsService } from './push-notifications.service.js';

/** The account this browser's push subscription is registered to. */
const OWNER_KEY = 'ferni:push-owner';

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null; // storage blocked (private mode): nothing recorded
  }
}

function writeOwner(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(OWNER_KEY, uid);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // storage blocked (private mode): the server-side ownership check still applies
  }
}

export async function applyPushPreference(enabled: boolean): Promise<void> {
  const service = getPushNotificationsService();
  if (!enabled) {
    await service.unsubscribe();
    writeOwner(null);
    return;
  }

  // Native registers asynchronously through its token listener, so null is expected there.
  const subscription = await service.subscribe();
  if (subscription) writeOwner(getFirebaseUid());
  if (subscription || isNative()) return;

  if (service.getPermissionStatus() !== 'granted') {
    toast.error('Notifications are blocked. Allow them in your browser settings.');
  } else {
    toast.error("Notifications aren't available right now.");
  }
}

/**
 * Sign out, first dropping this browser's push subscription while the token
 * still works, so whoever uses this browser next doesn't get this user's
 * notifications.
 */
export async function signOutReleasingPush(): Promise<void> {
  await getPushNotificationsService()
    .unsubscribe()
    .catch(() => false);
  writeOwner(null);
  await signOut();
}

/**
 * When `uid` isn't the account this browser's subscription belongs to, move it
 * to `uid` (if they have notifications on) or unsubscribe it. Unsubscribing in
 * the browser kills the endpoint, so the old account's record can't deliver.
 */
export async function syncPushOwner(uid: string | null): Promise<void> {
  const owner = readOwner();
  if (!uid || !owner || owner === uid) return;

  const service = getPushNotificationsService();
  const keep = service.getPreferences().enabled && service.getPermissionStatus() === 'granted';
  // Re-posting the same browser subscription: same keys, so the server moves it.
  const moved = keep ? await service.subscribe() : null;
  if (!moved) await service.unsubscribe();
  writeOwner(moved ? uid : null);
}

/** Keep the browser's push subscription with whoever is signed in. */
export function watchPushOwnership(): void {
  onAuthStateChange((state) => void syncPushOwner(state.uid));
}
