/**
 * Promise outcomes as log lines (promise ledger, phase 0). The executor that
 * keeps "I'll call her at 9" or "I'll remind you Friday" knows what happened and
 * used to drop it. Each now logs PROMISE_OUTCOME { kind, outcome, reason, ids }
 * once per outcome, and each scheduled job logs PROMISE_JOB_RUN { job, due, done,
 * failed, held, missed } once per run, zero due included, so a job that stops
 * (or whose query throws) shows as absence. monitoring/promise-* alert on them.
 *
 * No words, names or numbers: ids only; `reason` is a closed enum (the metric
 * label). `cancelled` means a person said stop; a system skip is `failed` with
 * its own reason. Mapping: promise-ledger DESIGN.md 3.1.
 *
 * @module services/follow-through/promise-outcomes
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PromiseOutcome' });

export type PromiseKind =
  'deferred-call' | 'scheduled-outreach' | 'reminder' | 'follow-through-text' | 'on-behalf-call';

export type OutcomeState = 'pending' | 'held' | 'done' | 'failed' | 'cancelled';

export const OUTCOME_REASONS = [
  'no-answer',
  'busy',
  'voicemail',
  'declined',
  'wrong-number',
  'call-hours',
  'quiet-hours',
  'rate-gap',
  'awaiting-approval',
  'awaiting-yes',
  'already-set',
  'opted-out',
  'bad-number',
  'no-verified-phone',
  'flag-off',
  'not-configured',
  'send-failed',
  'provider-error',
  'store-error',
  'missed-window',
  'job-not-run',
  'user-cancelled',
  'unknown',
] as const;
export type OutcomeReason = (typeof OUTCOME_REASONS)[number];

/** CallOutcome['status'] (tools/domains/telephony/types.ts), without importing a tool's types. */
export type CallStatus = 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';

export interface PromiseOutcome {
  outcome: OutcomeState;
  reason?: OutcomeReason;
}

/** Ids only, under the names each module already logs them. Never a name, number or text. */
export type OutcomeIds = Partial<
  Record<'userId' | 'id' | 'callId' | 'reminderId' | 'followUpId', string>
>;

export function logPromiseOutcome(
  kind: PromiseKind,
  o: PromiseOutcome,
  ids: OutcomeIds = {}
): void {
  const reason = o.reason ? { reason: o.reason } : {};
  log.info(
    { event: 'PROMISE_OUTCOME', kind, outcome: o.outcome, ...reason, ...ids },
    'PROMISE_OUTCOME'
  );
}

export type PromiseJob =
  'deferred-calls' | 'scheduled-outreach' | 'deliver-reminders' | 'follow-through';

export interface PromiseJobCounts {
  due: number;
  done: number;
  failed: number;
  held: number;
  missed: number;
}

export function logPromiseJobRun(job: PromiseJob, counts: PromiseJobCounts): void {
  log.info({ event: 'PROMISE_JOB_RUN', job, ...counts }, 'PROMISE_JOB_RUN');
}

// ---------------------------------------------------------------------------
// Each executor's states → outcome (DESIGN.md 3.1 mapping table)
// ---------------------------------------------------------------------------

/** deferred_calls, after the job picked one up. A placed call's result comes later (on-behalf-call). */
export function deferredCallOutcome(
  status: 'placed' | 'rescheduled' | 'failed' | 'missed'
): PromiseOutcome {
  switch (status) {
    case 'placed':
      return { outcome: 'pending' };
    case 'rescheduled':
      return { outcome: 'held', reason: 'call-hours' };
    case 'failed':
      return { outcome: 'failed', reason: 'provider-error' };
    case 'missed':
      return { outcome: 'failed', reason: 'missed-window' };
  }
}

/** How one scheduled outreach item ended (scheduled-outreach-executor.ts). */
export type OutreachEnd =
  | 'completed'
  | 'failed'
  | 'held-for-approval'
  | 'expired-while-held'
  | 'quiet-hours'
  | 'rate-gap'
  | 'opted-out'
  | 'bad-number'
  | 'missed'
  | 'retrying'
  | 'error';

export function scheduledOutreachOutcome(end: OutreachEnd): PromiseOutcome {
  switch (end) {
    case 'completed':
      return { outcome: 'done' };
    case 'failed':
      return { outcome: 'failed', reason: 'send-failed' };
    case 'held-for-approval':
      return { outcome: 'held', reason: 'awaiting-approval' };
    // Stored as cancelled, but nobody said stop: the approval never came.
    case 'expired-while-held':
      return { outcome: 'failed', reason: 'awaiting-approval' };
    case 'quiet-hours':
      return { outcome: 'held', reason: 'quiet-hours' };
    case 'rate-gap':
      return { outcome: 'held', reason: 'rate-gap' };
    case 'opted-out':
      return { outcome: 'failed', reason: 'opted-out' };
    case 'bad-number':
      return { outcome: 'failed', reason: 'bad-number' };
    case 'missed':
      return { outcome: 'failed', reason: 'missed-window' };
    case 'retrying':
      return { outcome: 'pending', reason: 'provider-error' };
    case 'error':
      return { outcome: 'failed', reason: 'provider-error' };
  }
}

/** One due reminder, in the deliver-reminders job. */
export function reminderOutcome(end: 'delivered' | 'failed' | 'held' | 'missed'): PromiseOutcome {
  switch (end) {
    case 'delivered':
      return { outcome: 'done' };
    case 'failed':
      return { outcome: 'failed', reason: 'send-failed' };
    case 'held':
      return { outcome: 'held', reason: 'quiet-hours' };
    case 'missed':
      return { outcome: 'failed', reason: 'missed-window' };
  }
}

/** The follow-through text job: 'sent', 'expired' (unsent), or the guarded sender's skip reason. */
export function followUpTextOutcome(end: string): PromiseOutcome {
  switch (end) {
    case 'sent':
      return { outcome: 'done' };
    case 'expired':
      return { outcome: 'failed', reason: 'missed-window' };
    case 'recently-sent':
      return { outcome: 'held', reason: 'rate-gap' };
    case 'opted-out':
    case 'no-verified-phone':
    case 'send-failed':
      return { outcome: 'failed', reason: end };
    case 'sms-off':
      return { outcome: 'failed', reason: 'flag-off' };
    case 'no-hash-secret':
      return { outcome: 'failed', reason: 'not-configured' };
    default:
      return { outcome: 'failed', reason: 'unknown' };
  }
}

/**
 * An on-behalf call's result. `refined` is what the call lifecycle knew beyond
 * the status: a wrong number (status failed) or a person who declined (status
 * completed, they picked up and didn't want to talk).
 */
export function callResultOutcome(
  status: CallStatus,
  refined?: 'wrong-number' | 'declined'
): PromiseOutcome {
  if (refined) return { outcome: 'failed', reason: refined };
  switch (status) {
    case 'completed':
      return { outcome: 'done' };
    case 'voicemail':
      return { outcome: 'done', reason: 'voicemail' };
    case 'no_answer':
      return { outcome: 'failed', reason: 'no-answer' };
    case 'busy':
      return { outcome: 'failed', reason: 'busy' };
    case 'failed':
      return { outcome: 'failed', reason: 'provider-error' };
  }
}

// The lifecycle knows a call was declined or reached a wrong number; captureCallResult,
// where every caller's result passes, only sees the status. Kept in process, by call id.
const refinedByCall = new Map<string, 'wrong-number' | 'declined'>();

export function noteCallRefinement(callId: string, refined: 'wrong-number' | 'declined'): void {
  refinedByCall.set(callId, refined);
  if (refinedByCall.size > 200) refinedByCall.delete(refinedByCall.keys().next().value as string);
}

/** Called once per call result, from captureCallResult. */
export function logCallResultOutcome(callId: string, status: CallStatus, userId: string): void {
  const refined = refinedByCall.get(callId);
  refinedByCall.delete(callId);
  logPromiseOutcome('on-behalf-call', callResultOutcome(status, refined), { userId, callId });
}
