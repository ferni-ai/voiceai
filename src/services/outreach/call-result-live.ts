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
 * The owner's call may be in another worker than the one that captures the
 * result (LiveKit Cloud runs each call as its own job), so the call that placed
 * it also watches the result (call-result-watch.ts). Both paths claim the report
 * on the call record (`told.voice`) first, so the owner hears it once; neither
 * speaks while the owner's call has crisis risk (crisis-call-risk.ts): the
 * result waits for the next call's opener.
 *
 * @module services/outreach/call-result-live
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { triggerVoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import {
  CALLER_TEXT_GUARD,
  callerText,
  reportedFromCall,
  screenedCallerText,
} from './caller-text.js';
import { callResultDetails } from './call-result-text.js';
import { liveSessionFor } from '../../tools/registry/live-session.js';
import { crisisRiskThisCall } from '../safety/index.js';
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

/**
 * What Ferni is asked to pass on, framed as reported words, never instructions.
 * Every field the call produced (outcome, summary, quote, even the name) goes
 * through the same cleaner and money/credential screen as the opener's text:
 * one plain line each, instruction phrases removed, and Ferni's own fixed line
 * in place of anything about money, an account, a number or a code.
 */
export function liveReportMessage(contactName: string, outcome: CallOutcome): string {
  const name = callerText(contactName, 60) || 'them';
  const said = (text: string | undefined): string => screenedCallerText(text, name, 600);
  const lines = [`${STATUS_LINE[outcome.status]}: ${said(outcome.outcome)}`];
  const details = said(callResultDetails(name, outcome));
  if (details) lines.push(details);
  if (outcome.callbackRequired) lines.push('They want a call back.');
  return [
    `the call you placed for them to ${name} just ended.`,
    CALLER_TEXT_GUARD,
    ...reportedFromCall(name, lines),
  ].join('\n');
}

/** A stored call result's outcome, when it has one Ferni can report. */
export function reportableOutcome(value: unknown): CallOutcome | null {
  const outcome = (value as { outcome?: Partial<CallOutcome> } | null | undefined)?.outcome;
  return outcome && typeof outcome.status === 'string' && outcome.status in STATUS_LINE
    ? (outcome as CallOutcome)
    : null;
}

/** Claims this process already made, so its two paths never both speak (oldest dropped first). */
const claimedHere = new Set<string>();
const CLAIMS_KEPT = 500;

/**
 * Claim the spoken report of this call, once across paths and workers: false when
 * it is already claimed (`told.voice`) or the owner was already texted (`delivered`).
 * Never throws. The other path that could speak this report runs where the owner's
 * call is, which is this process (liveSessionFor), so with no call record (stored in
 * memory) or a failed transaction, this process's own claim decides.
 */
export async function claimVoiceReport(userId: string, callId: string): Promise<boolean> {
  const key = `${userId}/${callId}`;
  if (claimedHere.has(key)) return false;
  claimedHere.add(key);
  if (claimedHere.size > CLAIMS_KEPT) claimedHere.delete(claimedHere.values().next().value ?? '');
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return true;
    const ref = db.collection('bogle_users').doc(userId).collection('on_behalf_calls').doc(callId);
    return await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return true;
      const data = fresh.data() as { told?: { voice?: unknown }; delivered?: unknown } | undefined;
      if (Boolean(data?.told?.voice) || Boolean(data?.delivered)) return false;
      tx.update(ref, { 'told.voice': new Date().toISOString() });
      return true;
    });
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'CALL_RESULT_LIVE_REPORT claim failed; told here');
    return true;
  }
}

type LiveTold = 'handed' | 'crisis_hold' | 'already_told' | 'not_handed';

/**
 * Tell the owner in this live call, once: not on a call with crisis risk (held for
 * the next opener, re-checked when the speaker has its pause), and only if this
 * path wins the claim. Never throws.
 */
export async function tellLiveOnce(call: {
  session: object;
  sessionId: string;
  userId: string;
  contactName: string;
  outcome: CallOutcome;
}): Promise<LiveTold> {
  const { session, sessionId, userId, outcome } = call;
  try {
    const crisis = (): boolean => crisisRiskThisCall(sessionId);
    if (crisis()) return 'crisis_hold';
    if (!(await claimVoiceReport(userId, outcome.callId))) return 'already_told';
    const handed = await triggerVoiceCallback({
      type: 'call_outcome',
      userId,
      message: liveReportMessage(call.contactName, outcome),
      priority: 'high',
      session,
      holdIf: crisis,
    });
    return handed ? 'handed' : 'not_handed';
  } catch (error) {
    log.warn({ callId: outcome.callId, error: String(error) }, 'CALL_RESULT_LIVE_REPORT failed');
    return 'not_handed';
  }
}

/**
 * Tell the owner in their live call. True when that call is on in this process:
 * the report is claimed and handed to its speaker (CALL_ALERT_SPOKEN / _DROPPED log
 * whether it was heard), or held for the next opener on crisis risk; false when
 * there is no such call.
 */
export function reportCallResultLive(request: OnBehalfCallRequest, outcome: CallOutcome): boolean {
  const session = liveSessionFor(request.originalSessionId);
  if (!session) {
    log.info({ callId: outcome.callId }, 'CALL_RESULT_LIVE_REPORT: owner not live here');
    return false;
  }
  // The speaker waits for a pause; the rest of the capture (stores, email) does not wait on it.
  void tellLiveOnce({
    session,
    sessionId: request.originalSessionId,
    userId: request.userId,
    contactName: request.resolvedContact?.name || request.contactQuery,
    outcome,
  }).then((told) => log.info({ callId: outcome.callId, told }, 'CALL_RESULT_LIVE_REPORT'));
  return true;
}
