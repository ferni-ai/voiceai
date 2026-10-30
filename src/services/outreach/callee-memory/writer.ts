/**
 * The one writer of call_memories (store.ts): once per completed on-behalf call, from
 * captureCallResult (call-result-capture.ts), keep what the person who answered said
 * (extract.ts) under the owner who asked for the call.
 *
 * CALLEE_MEMORY (default off): off, nothing is written. Only a verified member's own
 * record: never an onbehalf:, anon:, phone: or device: id, so the callee's session can
 * never write here, and the shared placeholder buckets never fill. Nothing when MINOR_CARE
 * holds the callee's session or the owner (writeHeld). That hold is only seen in the process
 * that heard the call (the agent job); the Twilio fallback captures in the API server, where
 * extract.ts's child-relation and minor-text refusals still apply. Never throws: the
 * call's report must not depend on this. Logs ids and counts, never words.
 *
 * @module services/outreach/callee-memory/writer
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/index.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { isMemberIdentity } from '../../identity/member-identity.js';
import { isUnverifiedUserId } from '../../identity/unverified-user-id.js';
import { calleeMemoryFrom } from './extract.js';
import { saveCallMemory } from './store.js';

const log = createLogger({ module: 'callee-memory' });

export function calleeMemoryOn(env: Env = process.env): boolean {
  return flagOn('CALLEE_MEMORY', env);
}

/**
 * The owner's own verified record, never a placeholder's or a third party's: isMemberIdentity
 * refuses the callee's onbehalf: session id compared as comparableId gives it, as
 * isThirdPartyCallUser (memory/third-party-call.ts) does, so 'ONBEHALF:x' is refused too.
 */
function isOwner(userId: string | undefined): userId is string {
  const id = userId?.trim();
  return isMemberIdentity(id) && !isUnverifiedUserId(id);
}

/** Keep what they said on this call, if anything may be kept. Resolves true when a row was written. */
export async function rememberCallee(
  callId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest,
  now: Date = new Date()
): Promise<boolean> {
  try {
    if (!calleeMemoryOn() || !isOwner(request.userId)) return false;
    // MINOR_CARE's one check: the callee's session (onbehalf:<callId>) or the owner is held.
    if (writeHeld(request.userId.trim(), `onbehalf:${callId}`)) return false;
    const memory = calleeMemoryFrom({ callId, outcome, request, now });
    if (!memory) return false;
    const saved = await saveCallMemory(request.userId.trim(), memory);
    log.info(
      { callId, saved, said: memory.said.length, asked: Boolean(memory.asked) },
      'callee memory kept'
    );
    return saved;
  } catch (error) {
    log.warn({ callId, error: (error as Error)?.name ?? 'error' }, 'callee memory not kept');
    return false;
  }
}
