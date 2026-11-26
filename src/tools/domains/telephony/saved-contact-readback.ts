/**
 * CALL_READBACK_SAVED_NAME_ONLY (default off). Owner decision 2026-11-26: no human assistant
 * recites Mom's number back before calling her, so a call to a saved contact is read back by
 * who and why only. A number the owner gave (or one with no saved name to say instead) is still
 * read back in full: there a misheard digit must be caught before anything rings. The number is
 * left with the model for "which number?", and the confirmed call dials exactly it either way.
 *
 * @module tools/domains/telephony/saved-contact-readback
 */

import { flagOn } from '../../../config/env-flag.js';

/**
 * `at` follows the name in the read-back (" at 303-555-0100", or nothing); `aside` is for the
 * model only, never read out (ConfirmSpec `aside`): the number, if they ask for it.
 * `savedName`: the contact's own saved name; '' for a number the owner gave or typed.
 */
export function readBackNumber(spoken: string, savedName: string): { at: string; aside?: string } {
  if (!savedName.trim() || !flagOn('CALL_READBACK_SAVED_NAME_ONLY')) return { at: ` at ${spoken}` };
  return { at: '', aside: `If they ask which number, it's ${spoken}. Otherwise leave it out.` };
}
