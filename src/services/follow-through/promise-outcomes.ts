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
  'needs-consent',
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
  'forgotten',
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

const done: PromiseOutcome = { outcome: 'done' };
const held = (reason: OutcomeReason): PromiseOutcome => ({ outcome: 'held', reason });
const failed = (reason: OutcomeReason): PromiseOutcome => ({ outcome: 'failed', reason });

/** deferred_calls, after the job picked one up. A placed call's result comes later (on-behalf-call). */
const DEFERRED = {
  placed: { outcome: 'pending' },
  rescheduled: held('call-hours'),
  failed: failed('provider-error'),
  missed: failed('missed-window'),
} satisfies Record<string, PromiseOutcome>;
export const deferredCallOutcome = (s: keyof typeof DEFERRED): PromiseOutcome => DEFERRED[s];

/** How one scheduled outreach item ended (scheduled-outreach-executor.ts). */
const OUTREACH = {
  completed: done,
  failed: failed('send-failed'),
  'held-for-approval': held('awaiting-approval'),
  // Stored as cancelled, but nobody said stop: the approval never came.
  'expired-while-held': failed('awaiting-approval'),
  'quiet-hours': held('quiet-hours'),
  'rate-gap': held('rate-gap'),
  'opted-out': failed('opted-out'),
  // MESSAGING_PIPELINE: someone else never agreed to calls or texts; not a stop, not retried.
  'needs-consent': failed('needs-consent'),
  'bad-number': failed('bad-number'),
  missed: failed('missed-window'),
  retrying: { outcome: 'pending', reason: 'provider-error' },
  error: failed('provider-error'),
} satisfies Record<string, PromiseOutcome>;
export type OutreachEnd = keyof typeof OUTREACH;
export const scheduledOutreachOutcome = (end: OutreachEnd): PromiseOutcome => OUTREACH[end];

/** One due reminder, in the deliver-reminders job. */
const REMINDER = {
  delivered: done,
  failed: failed('send-failed'),
  held: held('quiet-hours'),
  missed: failed('missed-window'),
} satisfies Record<string, PromiseOutcome>;
export const reminderOutcome = (end: keyof typeof REMINDER): PromiseOutcome => REMINDER[end];

/**
 * The follow-through text job: 'sent', 'expired' (unsent), 'forgotten' (the person asked
 * Ferni to forget the topic: their own stop, so cancelled), or the guarded sender's skip.
 */
const FOLLOW_UP_TEXT: Record<string, PromiseOutcome> = {
  sent: done,
  expired: failed('missed-window'),
  forgotten: { outcome: 'cancelled', reason: 'forgotten' },
  'recently-sent': held('rate-gap'),
  'opted-out': failed('opted-out'),
  // Unreadable consent or a possible opt-out: the sender retries on its next run.
  'consent-unknown': held('store-error'),
  paused: held('awaiting-yes'),
  'no-verified-phone': failed('no-verified-phone'),
  'send-failed': failed('send-failed'),
  'sms-off': failed('flag-off'),
  'no-hash-secret': failed('not-configured'),
};
export const followUpTextOutcome = (end: string): PromiseOutcome =>
  FOLLOW_UP_TEXT[end] ?? failed('unknown');

/**
 * An on-behalf call's result. `refined` is what the call lifecycle knew beyond
 * the status: a wrong number (status failed) or a person who declined (status
 * completed, they picked up and didn't want to talk).
 */
const CALL: Record<CallStatus, PromiseOutcome> = {
  completed: done,
  voicemail: { outcome: 'done', reason: 'voicemail' },
  no_answer: failed('no-answer'),
  busy: failed('busy'),
  failed: failed('provider-error'),
};
export const callResultOutcome = (
  status: CallStatus,
  refined?: 'wrong-number' | 'declined'
): PromiseOutcome => (refined ? failed(refined) : CALL[status]);

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
