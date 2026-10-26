/**
 * A "call me" text. Until 2026-10-25 every one got "I'd love to talk. Let me
 * call you now..." and no call was placed (shouldInitiateCall had no reader).
 *
 * SMS_CALL_ME=on: the call goes through callUserAdapter.call, the same path as
 * "Ferni, call me" on a call, so calling hours, the MINOR_CARE own-call rule
 * and the live agent (CALL_USER_LIVE_AGENT) all apply. They asked for it, so no
 * standing opt-in is needed, but only a text from the account's own verified
 * phone rings that phone: an unverified or different sender gets no call.
 *
 * Whatever happens, the reply says only what was done.
 *
 * @module services/outreach/sms-call-me
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callUserAdapter } from './call-user-adapter.js';
import { toE164 } from './checkin-replies.js';

const log = createLogger({ module: 'SmsCallMe' });

export const CALLING = 'Calling you now.';
/** Calling hours or quiet hours deferred it (scheduleProactiveCall status 'scheduled'). */
export const CALL_SCHEDULED = "It's outside your calling hours, so I'll call when they start.";
/** No call is placed: an invitation, not a promise. */
export const NO_CALL = "I'd love to talk. Open Ferni whenever you're ready.";

type Caller = Pick<typeof callUserAdapter, 'verifiedPhone' | 'call'>;

/** The reply to a "call me" text from `from`, placing the call when it may. */
export async function answerCallMe(
  userId: string,
  from: string,
  personaId: string,
  caller: Caller = callUserAdapter
): Promise<string> {
  // Without CALL_HOURS_GUARD a quiet-hours call is saved as pending with nothing
  // that dials it later, so "I'll call when they start" could be false.
  if (!flagOn('SMS_CALL_ME') || !flagOn('CALL_HOURS_GUARD')) return NO_CALL;
  const phone = await caller.verifiedPhone(userId);
  if (!phone || toE164(from) !== phone) {
    log.info({ userId, tail: from.slice(-2) }, 'Call-me text not from the verified phone; no call');
    return NO_CALL;
  }
  try {
    const result = await caller.call({
      userId,
      phoneNumber: phone,
      message: 'You texted asking me to call.',
      personaId,
    });
    if (!result.success) {
      log.warn({ userId, error: result.error }, 'Call-me text: call not placed');
      return NO_CALL;
    }
    return result.status === 'scheduled' ? CALL_SCHEDULED : CALLING;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Call-me text: call threw');
    return NO_CALL;
  }
}
