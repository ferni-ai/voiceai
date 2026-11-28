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
import { crisisRiskThisCall, offersCrisisLine } from '../../services/safety/index.js';

let phoneInOwner: (sessionId: string) => boolean = () => false;

/** caller-recognition.ts: the verified owner phoned in on this session. */
export function setPhoneInOwnerCheck(check: (sessionId: string) => boolean): void {
  phoneInOwner = check;
}

/**
 * This call may be offered a code texted to the owner's verified phone. Never on a call with
 * crisis risk: risk noted on any turn, or a read still in flight (crisis-call-risk.ts), since
 * presence after a crisis is a crisis turn and no tools run on one. `latest`, this turn's words,
 * leaves this turn's own read out, for a note built while it runs (phone-step-up-note.ts).
 */
export function stepUpOffered(
  sessionId: string | undefined,
  env: Env = process.env,
  latest?: string
): boolean {
  if (!flagOn('PHONE_STEP_UP', env) || sessionId === undefined) return false;
  return phoneInOwner(sessionId) && !crisisRiskThisCall(sessionId, latest);
}

/**
 * A claim's 'step_up' reason, unless its sentence names a crisis line: "I'll call 988 for you"
 * keeps today's honest line, so Ferni never implies a code lets him dial 988 (action-claim-guard.ts).
 */
export function keptStepUp<R extends string>(
  reason: R | null,
  sentence: string
): R | 'no_tool' | null {
  return reason === 'step_up' && offersCrisisLine(sentence) ? 'no_tool' : reason;
}

/** Why a call or send claim has no tool: a step-up could open it (offered), or none is open. */
export function noToolReason(kind: string, offered: boolean): 'step_up' | 'no_tool' {
  return offered && (kind === 'call' || kind === 'send') ? 'step_up' : 'no_tool';
}
