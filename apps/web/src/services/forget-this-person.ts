/**
 * Forget the signed-in person on this browser, then reload.
 *
 * Sign-out uses it, and so does any open page that sees someone else sign in or out
 * in another tab. It clears the person's keys (localStorage, and this tab's
 * sessionStorage, which a reload keeps), stops this page writing them back before it
 * goes, drops the service worker's API cache (offline copies of their profile and
 * relationship stage), and reloads, so the page rebuilds from the sign-in gate or as
 * the new person with nothing of the last one left over.
 */

import { clearAllUserData, sealUserData } from '../config/storage-keys.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ForgetThisPerson');

/** The service worker's API cache. public/sw.js can't import it; a test pins the two names. */
export const API_CACHE_NAME = 'ferni-api-v4';

export async function forgetThisPersonAndReload(
  reload: () => void = () => window.location.reload()
): Promise<void> {
  clearAllUserData();
  // Nothing this page still does before the reload (a module finishing its
  // start-up, a pending save) may put the person's data back.
  sealUserData();
  if ('caches' in self) {
    try {
      await caches.delete(API_CACHE_NAME);
    } catch (error) {
      log.warn('Offline API cache not cleared', error);
    }
  }
  reload();
}
