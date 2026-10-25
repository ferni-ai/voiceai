/**
 * CALL_RESULT_LIVE_REPORT: when a call Ferni placed for the owner ends while
 * the owner's own call (the one that asked for it) is still on, Ferni tells
 * them there, at a pause, in its own words: "Your mom picked up, she said ..."
 * or "Went to voicemail, I left a message".
 *
 * Prod 2026-10-24 (phone-calls audit, row 12): the result was looked up by
 * originalSessionId = "ferni" (an agent id, not a session), found no call,
 * and was written to pending_notifications, which nothing reads. The owner
 * heard nothing until a later call's opener.
 *
 * It goes through the call's alert speaker (agents/shared/call-alerts.ts,
 * waits for a pause, retries once if cut) by `triggerVoiceCallback` with the
 * call's own AgentSession. The wording rules are the opener's
 * (pending-call-results.ts): what the other person said is quoted in a
 * "Reported from Ferni's call" block under CALLER_TEXT_GUARD, never as
 * instructions, and their pass-on words are screened (callResultDetails).
 * With no live call in this process it returns false and the result stays in
 * While You Were Away for the next call.
 *
 * @module services/outreach/call-result-live
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { triggerVoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { CALLER_TEXT_GUARD, reportedFromCall } from './caller-text.js';
import { callResultDetails } from './call-result-text.js';
import { liveSessionFor } from '../../tools/registry/live-session.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';

const log = createLogger({ module: 'call-result-live' });

export function callResultLiveReportOn(env?: Record<string, string | undefined>): boolean {
  return flagOn('CALL_RESULT_LIVE_REPORT', env);
}

const STATUS_LINE: Record<CallOutcome['status'], string> = {
  completed: 'They picked up',
  voicemail: 'It went to voicemail',
  no_answer: 'No answer',
  busy: 'The line was busy',
  failed: "The call didn't connect",
};

/** What Ferni is asked to pass on: the outcome, framed as reported words, never instructions. */
export function liveReportMessage(contactName: string, outcome: CallOutcome): string {
  const lines = [`${STATUS_LINE[outcome.status]}: ${outcome.outcome}`];
  const details = callResultDetails(contactName, outcome);
  if (details) lines.push(details);
  if (outcome.callbackRequired) lines.push('They want a call back.');
  return [
    `the call you placed for them to ${contactName} just ended.`,
    CALLER_TEXT_GUARD,
    ...reportedFromCall(contactName, lines),
  ].join('\n');
}

/**
 * Tell the owner in their live call. True when that call is on in this process
 * and the report was handed to its speaker (CALL_ALERT_SPOKEN / _DROPPED log
 * whether it was heard); false when there is no such call.
 */
export function reportCallResultLive(request: OnBehalfCallRequest, outcome: CallOutcome): boolean {
  const session = liveSessionFor(request.originalSessionId);
  if (!session) {
    log.info({ callId: outcome.callId }, 'CALL_RESULT_LIVE_REPORT: owner not live here');
    return false;
  }
  const contactName = request.resolvedContact?.name || request.contactQuery;
  const handed = triggerVoiceCallback({
    type: 'call_outcome',
    userId: request.userId,
    message: liveReportMessage(contactName, outcome),
    priority: 'high',
    session,
  });
  // The speaker waits for a pause; the rest of the capture (stores, email) does not wait on it.
  void handed.then(
    (ok) => log.info({ callId: outcome.callId, handed: ok }, 'CALL_RESULT_LIVE_REPORT'),
    (error: unknown) =>
      log.warn({ callId: outcome.callId, error: String(error) }, 'CALL_RESULT_LIVE_REPORT failed')
  );
  return true;
}
