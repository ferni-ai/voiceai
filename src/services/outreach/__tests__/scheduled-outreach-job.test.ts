/**
 * Due scheduled outreach (messages to a user's contacts at a set time) is
 * executed from Firestore by a scheduled job, whichever process scheduled it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import type { CheckinRecord, StoredCheckin } from '../checkin-replies.js';
import type { TextDeps, TextStore } from '../guarded-text.js';

let rows: Row[] = [];
const sendSMS = vi.fn(async () => ({ success: true }));
const updateOutreachStatus = vi.fn(async () => undefined);
const rescheduleOutreach = vi.fn(async () => undefined);
const incrementRetry = vi.fn(async () => ({ shouldRetry: true, retryCount: 1 }));
/** The guarded sender's store: what the recipient's number has done and the member's account. */
const guard = {
  optedOut: false,
  sent: [] as StoredCheckin[],
  account: undefined as Record<string, unknown> | undefined,
  env: { LOG_HASH_SECRET: 'test-secret' } as Record<string, string>,
};

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS }));
vi.mock('../delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../conversational-calls.js', () => ({ makeConversationalCall: vi.fn() }));
vi.mock('../scheduled-multi-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduled-multi-outreach.js')>()),
  updateOutreachStatus,
  rescheduleOutreach,
  incrementRetry,
}));
// The real guards, over an in-memory store; the send is the mocked sendSMS.
vi.mock('../guarded-text.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../guarded-text.js')>();
  const deps = (): TextDeps => ({
    env: guard.env,
    store: {
      isOptedOut: async () => guard.optedOut,
      forPhoneHash: async (h: string) => guard.sent.filter((r) => r.phoneHash === h),
      userDoc: async () => guard.account,
      add: async (r: CheckinRecord) => {
        guard.sent.push({ ...r, id: `r${guard.sent.length}` });
        return 'r';
      },
    } as unknown as TextStore,
    authPhone: async () => undefined,
    send: sendSMS,
    now: () => NOW,
  });
  return {
    ...real,
    textOnBehalf: (t: Parameters<typeof real.textOnBehalf>[0]) => real.textOnBehalf(t, deps()),
  };
});

const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

const NOW = new Date('2026-09-30T16:00:00.000Z');
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
  Object.assign(guard, {
    optedOut: false,
    sent: [],
    account: undefined,
    env: { LOG_HASH_SECRET: 'test-secret' },
  });
});

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
    guard.account = { contactInfo: { timezone: 'Asia/Tokyo' } }; // 16:00Z is 01:00 in Tokyo
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(rescheduleOutreach).toHaveBeenCalledWith(
      'u1',
      'o1',
      new Date('2026-09-30T23:00:00.000Z')
    );
    expect(updateOutreachStatus).not.toHaveBeenCalledWith(
      'u1',
      'o1',
      expect.stringMatching(/completed|failed|cancelled/),
      expect.anything()
    );
  });

  it('skips a second text to the same number within ten minutes', async () => {
    rows = [outreach('o1', 1), outreach('o2', 1)];
    await executeDueScheduledOutreach({ now: NOW });

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(updateOutreachStatus).toHaveBeenCalledWith(
      'u1',
      'o2',
      'cancelled',
      expect.objectContaining({ error: 'skipped: recently-sent' })
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
