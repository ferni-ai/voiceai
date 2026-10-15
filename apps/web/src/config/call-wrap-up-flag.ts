/**
 * Call wrap-up flag. Off by default.
 *
 * When on, a planned goodbye (services/planned-goodbye.ts), the server closing the
 * room after one, and a hang-up all run the same graceful end (button back to
 * Call, mic released, after-call card, `ferni:disconnected`) and the agent's
 * goodbye gets the full ceremony. Any other end never hangs up: the reconnect
 * prompt (#1328), which this flag turns on, offers Reconnect or End call.
 * Turn it on for a build with VITE_CALL_WRAP_UP=true, or for one browser with
 * localStorage `ferni:flag:call-wrap-up` = 'true' ('false' forces it off on a
 * build that has it on).
 *
 * @module config/call-wrap-up-flag
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('CallWrapUpFlag');

export const CALL_WRAP_UP_STORAGE_KEY = 'ferni:flag:call-wrap-up';

export function isCallWrapUpEnabled(): boolean {
  try {
    const override = localStorage.getItem(CALL_WRAP_UP_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for call wrap-up flag', { error: String(error) });
  }
  return import.meta.env.VITE_CALL_WRAP_UP === 'true';
}
