/**
 * Try-first flag. Off by default.
 *
 * When on, the sign-in gate offers "Talk to Ferni now": a short demo call with
 * no account (ui/try-first.ui.ts), then asks the visitor to sign in to keep
 * the conversation. Off, the gate is exactly the sign-in wall it was.
 * Turn it on for a build with VITE_TRY_FIRST=true, or for one browser with
 * localStorage `ferni:flag:try-first` = 'true' ('false' forces it off on a
 * build that has it on).
 *
 * @module config/try-first-flag
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('TryFirstFlag');

export const TRY_FIRST_STORAGE_KEY = 'ferni:flag:try-first';

export function isTryFirstEnabled(): boolean {
  try {
    const override = localStorage.getItem(TRY_FIRST_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for try-first flag', { error: String(error) });
  }
  return import.meta.env.VITE_TRY_FIRST === 'true';
}
