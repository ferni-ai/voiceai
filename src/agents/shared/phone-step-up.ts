/**
 * PHONE_STEP_UP (off by default): a caller Ferni knows by their verified
 * number (caller-recognition.ts 'known') talks like a friend, but only the
 * phone-safe tools are open to them (phone-safe-tools.ts): calling, texting
 * and emailing people wait for a step-up the phone alone can't give. The owner
 * chose that step-up (2026-11-18): a code texted to the account's verified
 * phone, said back once per call.
 *
 * This module says which calls may be offered it: the verified owner phoned
 * in themselves. A call Ferni placed never is, since whoever answered is not
 * proven to be the owner (PLACED_CALL_NOT_OWNER_PROOF). Recognition lives in a
 * higher layer, so it sets that check here when it loads; until it does, no
 * call is offered one. Flag off: none, and the call goes exactly as before.
 *
 * @module agents/shared/phone-step-up
 */
import { flagOn, type Env } from '../../config/env-flag.js';

let phoneInOwner: (sessionId: string) => boolean = () => false;

/** caller-recognition.ts: the verified owner phoned in on this session. */
export function setPhoneInOwnerCheck(check: (sessionId: string) => boolean): void {
  phoneInOwner = check;
}

/** This call may be offered a code texted to the owner's verified phone. */
export function stepUpOffered(sessionId: string | undefined, env: Env = process.env): boolean {
  return flagOn('PHONE_STEP_UP', env) && sessionId !== undefined && phoneInOwner(sessionId);
}
