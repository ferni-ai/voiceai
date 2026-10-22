/**
 * Due scheduled outreach (messages to a user's contacts at a set time) is
 * executed from Firestore by a scheduled job, whichever process scheduled it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import type { CheckinRecord, StoredCheckin } from '../checkin-replies.js';
import type { TextDeps, TextStore } from '../guarded-text.js';
import { atomicLocks } from './atomic-locks.js';
import { sendEmail } from '../delivery/email-delivery.js';
import { callWithPersonaVoice } from '../../voice/voice-call.js';

let rows: Row[] = [];
const sendSMS = vi.fn(async () => ({ success: true }));
const updateOutreachStatus = vi.fn(async () => undefined);
const patchOutreach = vi.fn(async () => undefined);
const incrementRetry = vi.fn(async () => ({ shouldRetry: true, retryCount: 1 }));
/** The guarded sender's store: what the recipient's number has done and the member's account. */
const guard = {
  optedOut: false,
  sent: [] as StoredCheckin[],
  account: undefined as Record<string, unknown> | undefined,
  /** The member's own verified phone (Firebase Auth's). */
  ownPhone: undefined as string | undefined,
  env: { LOG_HASH_SECRET: 'test-secret' } as Record<string, string>,
  claims: atomicLocks(),
};

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
// The log lines only; the outcome mapping is the real one.
const logPromiseOutcome = vi.fn();
const logPromiseJobRun = vi.fn();
vi.mock('../../follow-through/promise-outcomes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../follow-through/promise-outcomes.js')>()),
  logPromiseOutcome,
  logPromiseJobRun,
}));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS }));
vi.mock('../delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../conversational-calls.js', () => ({ makeConversationalCall: vi.fn() }));
vi.mock('../scheduled-multi-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduled-multi-outreach.js')>()),
  updateOutreachStatus,
  patchOutreach,
  incrementRetry,
}));
// The real guards, over an in-memory store; the send is the mocked sendSMS.
vi.mock('../guarded-text.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../guarded-text.js')>();
  const deps = (): TextDeps => ({
    env: guard.env,
    store: {
      isOptedOut: async () => guard.optedOut,
      consentDoc: async () => undefined,
      forPhoneHash: async (h: string) => guard.sent.filter((r) => r.phoneHash === h),
      userDoc: async () => guard.account,
      add: async (r: CheckinRecord) => {
        guard.sent.push({ ...r, id: `r${guard.sent.length}` });
        return 'r';
      },
      ...guard.claims,
    } as unknown as TextStore,
    authPhone: async () => guard.ownPhone,
    send: sendSMS,
    now: () => NOW,
  });
  return {
    ...real,
    textOnBehalf: (t: Parameters<typeof real.textOnBehalf>[0]) => real.textOnBehalf(t, deps()),
    isOwnVerifiedPhone: (u: string, p: string) => real.isOwnVerifiedPhone(u, p, deps()),
  };
});

const { executeDueScheduledOutreach, executeScheduledOutreach } =
  await import('../scheduled-outreach-executor.js');

const NOW = new Date('2026-09-30T16:00:00.000Z');
const { outreachFromDoc } = await import('../scheduled-multi-outreach.js');
const outreachFromRow = (r: Row) => ({ ...outreachFromDoc(r.id, r.data), userId: r.userId });
const outreach = (id: string, minutesAgo: number): Row => ({
  id,
  userId: 'u1',
  collection: 'scheduled_outreach',
  data: {
    userId: 'u1',
    personaId: 'ferni',
    status: 'pending',
    scheduledFor: new Date(NOW.getTime() - minutesAgo * 60_000),
    createdAt: new Date(NOW.getTime() - 86_400_000),
    updatedAt: new Date(NOW.getTime() - 86_400_000),
    target: {
      contact: 'mom',
      purpose: 'wish her happy birthday',
      channel: 'text',
      message: 'Happy birthday, Mom!',
      resolvedContactId: 'c1',
      resolvedContactName: 'Mom',
      resolvedPhone: '+18015550123',
    },
  },
});

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  const sent: StoredCheckin[] = [];
  Object.assign(guard, {
    optedOut: false,
    sent,
    claims: atomicLocks(),
    account: undefined,
    ownPhone: undefined,
    env: { LOG_HASH_SECRET: 'test-secret' },
  });
  vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'on');
});

afterEach(() => vi.unstubAllEnvs());
describe('executeDueScheduledOutreach', () => {
  it('sends outreach that is due and records the result', async () => {
    rows = [outreach('o1', 1)];
    const result = await executeDueScheduledOutreach({ now: NOW });

    expect(result).toMatchObject({ due: 1, executed: 1, missed: 0 });
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+18015550123', body: 'Happy birthday, Mom!', userId: 'u1' })
    );
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'o1',
      'completed',
      expect.objectContaining({ success: true, channel: 'text' })
    );
  });

  it("acts for the path's owner, not the document's userId field", async () => {
    rows = [outreach('o1', 1)];
    rows[0].data.userId = 'victim';
    await executeDueScheduledOutreach({ now: NOW });
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(updateOutreachStatus).not.toHaveBeenCalledWith(
      'victim',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('marks outreach found hours late as missed, without sending', async () => {
    rows = [outreach('o1', 5 * 60)];
    const result = await executeDueScheduledOutreach({ now: NOW });

    expect(result).toMatchObject({ missed: 1, executed: 0 });
    expect(sendSMS).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('missed');
  });

  it('dry run sends nothing', async () => {
    rows = [outreach('o1', 1)];
    const result = await executeDueScheduledOutreach({ now: NOW, dryRun: true });
    expect(result).toMatchObject({ due: 1, executed: 0, dryRun: true });
    expect(sendSMS).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('pending');
  });
});

describe('scheduled texts to a contact go through the guards', () => {
  it('never texts a number that sent STOP, and does not leave it to retry', async () => {
    rows = [outreach('o1', 1)];
    guard.optedOut = true;
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'o1',
      'cancelled',
      expect.objectContaining({ success: false, error: 'skipped: opted-out' })
    );
    expect(incrementRetry).not.toHaveBeenCalled();
  });

  it("holds a text due in the recipient's quiet hours until 08:00 there, still pending", async () => {
    rows = [outreach('o1', 1)];
    rows[0].data.target = { ...(rows[0].data.target as object), resolvedPhone: '+15555550123' };
    guard.account = { contactInfo: { timezone: 'Asia/Tokyo' } }; // no area-code zone; 01:00 in Tokyo
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(patchOutreach).toHaveBeenCalledWith('u1', 'o1', {
      status: 'pending',
      scheduledFor: new Date('2026-09-30T23:00:00.000Z'),
    });
    expect(updateOutreachStatus).not.toHaveBeenCalledWith(
      'u1',
      'o1',
      expect.stringMatching(/completed|failed|cancelled/),
      expect.anything()
    );
  });

  it('a second text to the same number within ten minutes waits out the gap, still pending', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    rows = [outreach('o1', 1), outreach('o2', 1)];
    await executeDueScheduledOutreach({ now: NOW });
    vi.useRealTimers();

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(patchOutreach).toHaveBeenCalledWith('u1', 'o2', {
      status: 'pending',
      scheduledFor: new Date(NOW.getTime() + 10 * 60_000),
    });
    expect(updateOutreachStatus).not.toHaveBeenCalledWith(
      'u1',
      'o2',
      'cancelled',
      expect.anything()
    );
  });

  it('with ON_BEHALF_TEXT_GUARD=off sends the old unguarded way', async () => {
    rows = [outreach('o1', 1)];
    guard.optedOut = true;
    guard.env = { ...guard.env, ON_BEHALF_TEXT_GUARD: 'off' };
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+18015550123', userId: 'u1', outreachId: 'sched_exec_o1' })
    );
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'o1',
      'completed',
      expect.anything()
    );
  });
});

describe('scheduled outreach to someone else waits for the founder (SCHEDULED_OUTREACH_THIRD_PARTY)', () => {
  beforeEach(() => vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'off'));

  it('off: a text to a contact is held for approval, not sent and not retried', async () => {
    rows = [outreach('o1', 1)];
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(patchOutreach).toHaveBeenCalledWith('u1', 'o1', {
      status: 'held',
      heldReason: 'awaiting-approval',
      heldAt: expect.any(Date),
    });
    expect(incrementRetry).not.toHaveBeenCalled();
    expect(updateOutreachStatus).not.toHaveBeenCalledWith(
      'u1',
      'o1',
      expect.stringMatching(/completed|failed|cancelled/),
      expect.anything()
    );
  });

  it('off: calls and emails to a contact are held too', async () => {
    rows = [outreach('o1', 1), outreach('o2', 1)];
    rows[0].data.target = { ...(rows[0].data.target as object), channel: 'call' };
    rows[1].data.target = {
      ...(rows[1].data.target as object),
      channel: 'email',
      resolvedEmail: 'mom@example.com',
    };
    await executeDueScheduledOutreach({ now: NOW });

    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(patchOutreach).toHaveBeenCalledTimes(2);
  });

  it("off: a text to the member's own verified phone still goes", async () => {
    rows = [outreach('o1', 1)];
    guard.ownPhone = '+18015550123';
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(patchOutreach).not.toHaveBeenCalled();
  });
});

describe("an 'auto' scheduled outreach", () => {
  it('is a text even when the purpose says "check in" (no keyword upgrade to a call)', async () => {
    rows = [outreach('o1', 1)];
    rows[0].data.target = {
      ...(rows[0].data.target as object),
      channel: 'auto',
      purpose: 'check in on her, important',
    };
    await executeDueScheduledOutreach({ now: NOW });

    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });
});

describe('a held item released later', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('is cancelled as expired-while-held once it is more than a day past its time, never sent', async () => {
    const stale = outreachFromRow(outreach('o1', 30 * 60));
    await executeScheduledOutreach({ ...stale, heldAt: new Date() });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(updateOutreachStatus).toHaveBeenCalledWith('u1', 'o1', 'cancelled', {
      success: false,
      error: 'expired-while-held',
    });
  });

  it('still goes when released within a day of its time', async () => {
    const recent = outreachFromRow(outreach('o1', 60));
    await executeScheduledOutreach({ ...recent, heldAt: new Date() });
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });
});

describe('PROMISE_OUTCOME / PROMISE_JOB_RUN lines', () => {
  const outcome = (id: string) =>
    logPromiseOutcome.mock.calls.find((c) => (c[2] as { id: string }).id === id)?.slice(0, 2);

  it('a sent text is done; a missed one failed missed-window; one line per job run', async () => {
    rows = [outreach('o1', 1), outreach('o2', 5 * 60)];
    await executeDueScheduledOutreach({ now: NOW });

    expect(outcome('o1')).toEqual(['scheduled-outreach', { outcome: 'done' }]);
    expect(outcome('o2')).toEqual([
      'scheduled-outreach',
      { outcome: 'failed', reason: 'missed-window' },
    ]);
    expect(logPromiseOutcome.mock.calls[0][2]).toEqual({ userId: 'u1', id: expect.any(String) });
    expect(logPromiseJobRun).toHaveBeenCalledTimes(1);
    expect(logPromiseJobRun).toHaveBeenCalledWith('scheduled-outreach', {
      due: 2,
      done: 1,
      failed: 0,
      held: 0,
      missed: 1,
    });
  });

  it('logs a run with nothing due, so a stopped job shows as absence', async () => {
    await executeDueScheduledOutreach({ now: NOW });
    expect(logPromiseJobRun).toHaveBeenCalledWith('scheduled-outreach', {
      due: 0,
      done: 0,
      failed: 0,
      held: 0,
      missed: 0,
    });
  });

  it('a STOP is failed opted-out, never cancelled (cancelled is a person saying stop)', async () => {
    rows = [outreach('o1', 1)];
    guard.optedOut = true;
    await executeDueScheduledOutreach({ now: NOW });
    expect(outcome('o1')).toEqual([
      'scheduled-outreach',
      { outcome: 'failed', reason: 'opted-out' },
    ]);
    expect(logPromiseJobRun).toHaveBeenCalledWith(
      'scheduled-outreach',
      expect.objectContaining({ failed: 1 })
    );
  });

  it('held for approval is held awaiting-approval', async () => {
    vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'off');
    rows = [outreach('o1', 1)];
    await executeDueScheduledOutreach({ now: NOW });
    expect(outcome('o1')).toEqual([
      'scheduled-outreach',
      { outcome: 'held', reason: 'awaiting-approval' },
    ]);
    expect(logPromiseJobRun).toHaveBeenCalledWith(
      'scheduled-outreach',
      expect.objectContaining({ held: 1 })
    );
  });

  it('quiet hours is held quiet-hours', async () => {
    rows = [outreach('o1', 1)];
    rows[0].data.target = { ...(rows[0].data.target as object), resolvedPhone: '+15555550123' };
    guard.account = { contactInfo: { timezone: 'Asia/Tokyo' } };
    await executeDueScheduledOutreach({ now: NOW });
    expect(outcome('o1')).toEqual([
      'scheduled-outreach',
      { outcome: 'held', reason: 'quiet-hours' },
    ]);
  });

  it('expired while held is failed awaiting-approval, though the document says cancelled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const stale = outreachFromRow(outreach('o1', 30 * 60));
    expect(await executeScheduledOutreach({ ...stale, heldAt: new Date() })).toBe(
      'expired-while-held'
    );
    vi.useRealTimers();
    expect(outcome('o1')).toEqual([
      'scheduled-outreach',
      { outcome: 'failed', reason: 'awaiting-approval' },
    ]);
  });

  it('never logs the message, the name or the number', async () => {
    rows = [outreach('o1', 1)];
    await executeDueScheduledOutreach({ now: NOW });
    const logged = JSON.stringify([logPromiseOutcome.mock.calls, logPromiseJobRun.mock.calls]);
    expect(logged).not.toMatch(/Mom|Happy birthday|5550123/);
  });
});
