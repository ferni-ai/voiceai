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
import { createLogger } from '../utils/logger.js';
import { getFirebaseUid, onAuthStateChange, signOut } from './firebase-auth.service.js';
import { getPushNotificationsService } from './push-notifications.service.js';

const log = createLogger('PushPreference');

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

/** This browser's live push subscription, if any. */
async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch (err) {
    log.warn('Could not read the browser push subscription', err);
    return null;
  }
}

/**
 * Drop the subscription: tell the server, then ALWAYS unsubscribe in the
 * browser, whatever the server call did. Killing the endpoint is what
 * guarantees nothing addressed to the previous account can arrive.
 */
async function releasePush(): Promise<void> {
  try {
    await getPushNotificationsService().unsubscribe();
  } catch (err) {
    log.warn('Server push unsubscribe failed; killing the endpoint anyway', err);
  } finally {
    try {
      await (await getBrowserSubscription())?.unsubscribe();
    } catch (err) {
      log.error('Browser push unsubscribe failed', err);
    }
  }
}

export async function applyPushPreference(enabled: boolean): Promise<void> {
  const service = getPushNotificationsService();
  if (!enabled) {
    await releasePush();
    writeOwner(null);
    return;
  }

  const subscription = await service.subscribe();
  if (subscription) {
    writeOwner(getFirebaseUid());
    return;
  }

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
  await releasePush();
  writeOwner(null);
  await signOut();
}

/**
 * Make sure this browser's subscription belongs to `uid`. If it belongs to
 * someone else, or nobody is recorded (blocked storage, or subscribed before
 * ownership was tracked), it is re-posted for `uid` when they want
 * notifications (same keys, so the server binds it to them) and otherwise, or
 * on any failure, unsubscribed. It is never left as it was.
 */
export async function syncPushOwner(uid: string | null): Promise<void> {
  if (!uid) return;
  const owner = readOwner();
  if (owner === uid) return;
  // Nothing to hand over without a subscription.
  if (!owner && !(await getBrowserSubscription())) return;

  const service = getPushNotificationsService();
  const keep = service.getPreferences().enabled && service.getPermissionStatus() === 'granted';
  let moved = false;
  if (keep) {
    try {
      moved = Boolean(await service.subscribe());
    } catch (err) {
      log.warn('Could not move the push subscription to the new account', err);
    }
  }
  if (!moved) await releasePush();
  writeOwner(moved ? uid : null);
}

/** Keep the browser's push subscription with whoever is signed in. */
export function watchPushOwnership(): void {
  onAuthStateChange((state) => void syncPushOwner(state.uid));
}
