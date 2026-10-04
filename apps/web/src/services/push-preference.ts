/**
 * Push Preference
 *
 * Turning notifications on has to subscribe this browser on the server, or
 * nothing can ever be delivered; turning them off removes the subscription.
 */

import { toast } from '../ui/whisper.ui.js';
import { isNative } from '../utils/platform.js';
import { signOut } from './firebase-auth.service.js';
import { getPushNotificationsService } from './push-notifications.service.js';

export async function applyPushPreference(enabled: boolean): Promise<void> {
  const service = getPushNotificationsService();
  if (!enabled) {
    await service.unsubscribe();
    return;
  }

  // Native registers asynchronously through its token listener, so null is expected there.
  const subscription = await service.subscribe();
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
  await signOut();
}
