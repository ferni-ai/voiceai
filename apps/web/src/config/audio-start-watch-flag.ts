/**
 * Silent-start notice flag (WEB_AUDIO_START_WATCH). Off by default.
 *
 * When on, a call where Ferni is here but none of his audio plays shows "The
 * sound didn't start. Try again in a moment." (services/audio-start-watch.ts).
 * Its Try again ends this call and starts a new one, so it stays off until the
 * join-to-first-track timing (services/audio-start-timing.ts, logged on every
 * call either way) shows the deadlines don't fire on calls that were fine.
 * Turn it on for a build with VITE_WEB_AUDIO_START_WATCH=true, or for one
 * browser with localStorage `ferni:flag:web-audio-start-watch` = 'true'
 * ('false' forces it off on a build that has it on).
 *
 * @module config/audio-start-watch-flag
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('AudioStartWatchFlag');

export const AUDIO_START_WATCH_STORAGE_KEY = 'ferni:flag:web-audio-start-watch';

export function isAudioStartWatchOn(): boolean {
  try {
    const override = localStorage.getItem(AUDIO_START_WATCH_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for the silent-start notice flag', {
      error: String(error),
    });
  }
  return import.meta.env.VITE_WEB_AUDIO_START_WATCH === 'true';
}
