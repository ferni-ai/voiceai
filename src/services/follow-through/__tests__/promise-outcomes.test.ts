/**
 * Phase 0 of the promise ledger: each executor's states map to one outcome
 * (DESIGN.md 3.1), and the log line carries only the kind, the outcome, a
 * closed-enum reason and ids. An on-behalf call's result is logged once, where
 * every caller's result passes (captureCallResult), with what the call itself
 * knew (declined, wrong number).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lines = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = (bindings: Record<string, unknown> = {}): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, msg?: string) => {
      if (bindings.module === 'PromiseOutcome') lines.push({ ...fields, msg });
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: (more: Record<string, unknown>) => logger({ ...bindings, ...more }),
  });
  return { createLogger: logger, getLogger: () => logger(), safeLog: () => logger() };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const {
  OUTCOME_REASONS,
  callResultOutcome,
  deferredCallOutcome,
  followUpTextOutcome,
  logPromiseJobRun,
  logPromiseOutcome,
  reminderOutcome,
  scheduledOutreachOutcome,
} = await import('../promise-outcomes.js');
const { captureCallResult } = await import('../../outreach/call-result-capture.js');
const { completeOnBehalfCall, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../../outreach/on-behalf-dispatch.js');
import type { OutreachEnd } from '../promise-outcomes.js';
import type { CallDisposition } from '../../../agents/outbound-call/call-control.js';

beforeEach(() => {
  lines.length = 0;
});

describe('each executor maps to the design table', () => {
  it('deferred_calls', () => {
    expect(deferredCallOutcome('placed')).toEqual({ outcome: 'pending' });
    expect(deferredCallOutcome('rescheduled')).toEqual({ outcome: 'held', reason: 'call-hours' });
    expect(deferredCallOutcome('failed')).toEqual({ outcome: 'failed', reason: 'provider-error' });
    expect(deferredCallOutcome('missed')).toEqual({ outcome: 'failed', reason: 'missed-window' });
  });

  it('scheduled outreach: system skips are failed with their reason, never cancelled', () => {
    const table: Array<[OutreachEnd, string, string?]> = [
      ['completed', 'done'],
      ['failed', 'failed', 'send-failed'],
      ['held-for-approval', 'held', 'awaiting-approval'],
      ['expired-while-held', 'failed', 'awaiting-approval'],
      ['quiet-hours', 'held', 'quiet-hours'],
      ['rate-gap', 'held', 'rate-gap'],
      ['opted-out', 'failed', 'opted-out'],
      ['bad-number', 'failed', 'bad-number'],
      ['missed', 'failed', 'missed-window'],
      ['retrying', 'pending', 'provider-error'],
      ['error', 'failed', 'provider-error'],
    ];
    for (const [end, outcome, reason] of table) {
      expect(scheduledOutreachOutcome(end), end).toEqual(
        reason ? { outcome, reason } : { outcome }
      );
    }
  });

  it('reminders', () => {
    expect(reminderOutcome('delivered')).toEqual({ outcome: 'done' });
    expect(reminderOutcome('failed')).toEqual({ outcome: 'failed', reason: 'send-failed' });
    expect(reminderOutcome('held')).toEqual({ outcome: 'held', reason: 'quiet-hours' });
    expect(reminderOutcome('missed')).toEqual({ outcome: 'failed', reason: 'missed-window' });
  });

  it("follow-through texts: the guarded sender's skips", () => {
    expect(followUpTextOutcome('sent')).toEqual({ outcome: 'done' });
    expect(followUpTextOutcome('expired')).toEqual({ outcome: 'failed', reason: 'missed-window' });
    expect(followUpTextOutcome('recently-sent')).toEqual({ outcome: 'held', reason: 'rate-gap' });
    // Retried by the sender, so held rather than failed('unknown').
    expect(followUpTextOutcome('consent-unknown')).toEqual({
      outcome: 'held',
      reason: 'store-error',
    });
    expect(followUpTextOutcome('paused')).toEqual({ outcome: 'held', reason: 'awaiting-yes' });
    for (const r of ['opted-out', 'no-verified-phone', 'send-failed']) {
      expect(followUpTextOutcome(r)).toEqual({ outcome: 'failed', reason: r });
    }
    expect(followUpTextOutcome('sms-off')).toEqual({ outcome: 'failed', reason: 'flag-off' });
    expect(followUpTextOutcome('no-hash-secret')).toEqual({
      outcome: 'failed',
      reason: 'not-configured',
    });
    // "Forget X" is the person's own stop: the only cancelled outcome an executor gives.
    expect(followUpTextOutcome('forgotten')).toEqual({ outcome: 'cancelled', reason: 'forgotten' });
    expect(followUpTextOutcome('something new')).toEqual({ outcome: 'failed', reason: 'unknown' });
  });

  it('on-behalf call results', () => {
    expect(callResultOutcome('completed')).toEqual({ outcome: 'done' });
    expect(callResultOutcome('voicemail')).toEqual({ outcome: 'done', reason: 'voicemail' });
    expect(callResultOutcome('no_answer')).toEqual({ outcome: 'failed', reason: 'no-answer' });
    expect(callResultOutcome('busy')).toEqual({ outcome: 'failed', reason: 'busy' });
    expect(callResultOutcome('failed')).toEqual({ outcome: 'failed', reason: 'provider-error' });
    expect(callResultOutcome('completed', 'declined')).toEqual({
      outcome: 'failed',
      reason: 'declined',
    });
    expect(callResultOutcome('failed', 'wrong-number')).toEqual({
      outcome: 'failed',
      reason: 'wrong-number',
    });
  });

  it('every reason any mapping can give is in the closed enum', () => {
    const outcomes = [
      ...(['placed', 'rescheduled', 'failed', 'missed'] as const).map(deferredCallOutcome),
      ...(['delivered', 'failed', 'held', 'missed'] as const).map(reminderOutcome),
      ...['sent', 'expired', 'recently-sent', 'opted-out', 'sms-off', 'no-hash-secret', 'x'].map(
        followUpTextOutcome
      ),
      ...(['completed', 'voicemail', 'no_answer', 'busy', 'failed'] as const).map((s) =>
        callResultOutcome(s)
      ),
    ];
    for (const o of outcomes) {
      if (o.reason) expect(OUTCOME_REASONS).toContain(o.reason);
      expect(o.outcome).not.toBe('cancelled'); // no executor here hears a person say stop
    }
  });
});

describe('the log lines', () => {
  it('PROMISE_OUTCOME carries the kind, outcome, reason and ids, nothing else', () => {
    logPromiseOutcome(
      'reminder',
      { outcome: 'failed', reason: 'missed-window' },
      {
        reminderId: 'r1',
      }
    );
    logPromiseOutcome('deferred-call', { outcome: 'pending' }, { userId: 'u1' });
    expect(lines).toEqual([
      {
        event: 'PROMISE_OUTCOME',
        msg: 'PROMISE_OUTCOME',
        kind: 'reminder',
        outcome: 'failed',
        reason: 'missed-window',
        reminderId: 'r1',
      },
      {
        event: 'PROMISE_OUTCOME',
        msg: 'PROMISE_OUTCOME',
        kind: 'deferred-call',
        outcome: 'pending',
        userId: 'u1',
      },
    ]);
  });

  it('PROMISE_JOB_RUN carries the job and its counts', () => {
    logPromiseJobRun('deliver-reminders', { due: 0, done: 0, failed: 0, held: 0, missed: 0 });
    expect(lines).toEqual([
      {
        event: 'PROMISE_JOB_RUN',
        msg: 'PROMISE_JOB_RUN',
        job: 'deliver-reminders',
        due: 0,
        done: 0,
        failed: 0,
        held: 0,
        missed: 0,
      },
    ]);
  });
});

describe('an on-behalf call result is logged once, in captureCallResult', () => {
  const call = (callId: string) =>
    buildOnBehalfDispatch({
      callId,
      requester: { userId: 'u1', name: 'Seth', timezone: 'UTC', originalSessionId: 's0' },
      contact: { name: 'Mom', phone: '+15555550100' },
      purpose: 'check in',
      objective: 'check_in',
      callType: 'personal',
    });

  /** The real lifecycle reporting through the real captureCallResult (Firestore off). */
  const finish = (callId: string, disposition: CallDisposition) =>
    completeOnBehalfCall('sess', call(callId), 30, true, {
      readDisposition: () => disposition,
      readTranscript: () => [{ role: 'recipient', content: 'Who is this? Wrong number.' }],
      analyze: async () => null,
      report: captureCallResult,
    });

  it('a wrong number is failed wrong-number, though the status is just failed', async () => {
    await finish('c-wrong', 'wrong_number');
    expect(lines).toEqual([
      expect.objectContaining({
        event: 'PROMISE_OUTCOME',
        kind: 'on-behalf-call',
        outcome: 'failed',
        reason: 'wrong-number',
        userId: 'u1',
        callId: 'c-wrong',
      }),
    ]);
  });

  it('someone who picked up and refused is failed declined, though the status is completed', async () => {
    await finish('c-refused', 'refused');
    expect(lines).toEqual([
      expect.objectContaining({ outcome: 'failed', reason: 'declined', callId: 'c-refused' }),
    ]);
  });

  it('a result from another caller (a Twilio status, say) is mapped from its status', async () => {
    const c = call('c-busy');
    await captureCallResult(
      'c-busy',
      { callId: 'c-busy', status: 'busy', objectiveAchieved: false, outcome: 'Busy.' },
      toOnBehalfCallRequest(c)
    );
    expect(lines).toEqual([
      expect.objectContaining({ outcome: 'failed', reason: 'busy', callId: 'c-busy' }),
    ]);
  });

  it('never logs the name, the number or what was said', async () => {
    await finish('c-words', 'wrong_number');
    expect(JSON.stringify(lines)).not.toMatch(/Mom|Seth|5550100|Wrong number|check in/);
  });
});
