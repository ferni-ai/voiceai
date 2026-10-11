/**
 * CALL_OPENING_AMD: how a call Ferni places on someone's behalf opens.
 *
 * Off (the default): Ferni waits for the phone to be answered, then says the
 * fixed opener first (agents/shared/outbound-opener.ts).
 * On: LiveKit's answering-machine detection hears the first words. A person
 * says hello first and Ferni's reply is the opener; a silent pickup gets the
 * opener; a voicemail gets one short message and a hang-up; a full mailbox or
 * a phone menu gets a quiet hang-up (agents/outbound-call/call-opening.ts).
 *
 * Read on every call, so a test (or a restart with new env) sees the current
 * value. Set with `lk agent update-secrets --secrets "CALL_OPENING_AMD=on"`.
 *
 * @module config/call-opening-flag
 */

export const CALL_OPENING_AMD_ENV = 'CALL_OPENING_AMD';

/** True only when CALL_OPENING_AMD is 'on' or 'true'. */
export function isCallOpeningAmdEnabled(): boolean {
  const value = process.env[CALL_OPENING_AMD_ENV]?.trim().toLowerCase();
  return value === 'on' || value === 'true';
}

/**
 * Extra SIP dial options for the AMD opening: ring long enough for a voicemail
 * to pick up, and cap a call that never ends. Empty when the flag is off.
 */
export function callOpeningDialOptions(): { ringingTimeout?: number; maxCallDuration?: number } {
  return isCallOpeningAmdEnabled() ? { ringingTimeout: 45, maxCallDuration: 15 * 60 } : {};
}
