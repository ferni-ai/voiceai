/**
 * Sign out of Ferni on this browser.
 *
 * Releases this browser's push subscription first (so the next person here
 * doesn't get this person's notifications), signs out of Firebase, then clears
 * everything the app kept locally and reloads to the sign-in screen, so a
 * shared device starts clean.
 *
 * If signing out fails, nothing is cleared: wiping local data and reloading
 * while the session survives would look signed out without being so.
 */

import { clearAllUserData } from '../config/storage-keys.js';
import { t } from '../i18n/index.js';
import { toast } from '../ui/whisper.ui.js';
import { createLogger } from '../utils/logger.js';
import { signOutReleasingPush } from './push-preference.js';

const log = createLogger('SignOut');

export async function signOutOfThisBrowser(reload: () => void = () => window.location.reload()): Promise<boolean> {
  try {
    await signOutReleasingPush();
  } catch (error) {
    log.error('Sign out failed', error);
    toast.error(t('auth.signOutFailed'));
    return false;
  }
  clearAllUserData();
  reload();
  return true;
}
