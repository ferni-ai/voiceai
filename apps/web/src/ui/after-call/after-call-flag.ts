/**
 * After-call card flag.
 *
 * On by default: the recap is the post-call moment. Turn it off for a build
 * with VITE_AFTER_CALL_CARD=false (the cost card comes back), or for one
 * browser with localStorage `ferni:flag:after-call-card` = 'false'
 * ('true' forces it on for a build that has it off).
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
  return import.meta.env.VITE_AFTER_CALL_CARD !== 'false';
}
