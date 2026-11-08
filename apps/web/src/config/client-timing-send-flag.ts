/**
 * Call-start timing flag (CLIENT_TIMING_SEND). Off by default.
 *
 * When on, each call sends the agent one message with its start moments (the
 * tap, the room join, Ferni's first audio track and his audio playing) so the
 * agent's "Time to first word" line (TTFW_METRIC, server side) can show tap to
 * first audible word (services/client-timing.ts). Moments only: no ids, names
 * or text. Off: nothing is sent.
 * Turn it on for a build with VITE_CLIENT_TIMING_SEND=true, or for one browser
 * with localStorage `ferni:flag:client-timing-send` = 'true' ('false' forces it
 * off on a build that has it on).
 *
 * @module config/client-timing-send-flag
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('ClientTimingSendFlag');

export const CLIENT_TIMING_SEND_STORAGE_KEY = 'ferni:flag:client-timing-send';

export function isClientTimingSendOn(): boolean {
  try {
    const override = localStorage.getItem(CLIENT_TIMING_SEND_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for the call-start timing flag', {
      error: String(error),
    });
  }
  return import.meta.env.VITE_CLIENT_TIMING_SEND === 'true';
}
