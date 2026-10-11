/**
 * After-call card flag.
 *
 * Off by default. Turn it on for a build with VITE_AFTER_CALL_CARD=true, or
 * for one browser with localStorage `ferni:flag:after-call-card` = 'true'
 * (set it to 'false' to force it off on a build that has it on).
 *
 * @module ui/after-call/after-call-flag
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('AfterCallFlag');

export const AFTER_CALL_CARD_STORAGE_KEY = 'ferni:flag:after-call-card';

export function isAfterCallCardEnabled(): boolean {
  try {
    const override = localStorage.getItem(AFTER_CALL_CARD_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for after-call flag', { error: String(error) });
  }
  return import.meta.env.VITE_AFTER_CALL_CARD === 'true';
}
