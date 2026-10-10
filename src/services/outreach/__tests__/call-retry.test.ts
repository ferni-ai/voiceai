/**
 * A missed on-behalf call gets exactly one retry, the next day at a time the
 * recipient can be called, and the scheduled-outreach job places it as an
 * on-behalf call. Drives the real follow-through and the real job against a
 * fake Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const initiateCall = vi.fn(async () => 'onbehalf_new');
const updateOutreachStatus = vi.fn(async () => undefined);

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: vi.fn(),
  onFollowUpActionChange: vi.fn(),
}));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: vi.fn(async () => ({})),
}));
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS: vi.fn() }));
vi.mock('../delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../conversational-calls.js', () => ({ makeConversationalCall: vi.fn() }));
vi.mock('../scheduled-multi-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduled-multi-outreach.js')>()),
  updateOutreachStatus,
}));

const { followthroughCallFromDispatch, recordCallFollowthrough } =
  await import('../call-followthrough.js');
const { localTimeAfter, placeCallRetry } = await import('../call-retry.js');
const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

// 10:33 in Los Angeles, Saturday 2026-10-10.
const NOW = new Date('2026-10-10T17:33:00.000Z');
const call = (extra: Record<string, unknown> = {}) =>
  followthroughCallFromDispatch({
    type: 'on_behalf_call',
    callId: 'doug-checkin-20261010',
    requester: {
      userId: 'seth',
      name: 'Seth',
      timezone: 'America/Los_Angeles',
      originalSessionId: 's0',
    },
    contact: { name: 'Doug', phone: '+18015550123', relationship: 'dad' },
    purpose: 'check in and say hi from Seth',
    ...extra,
  })!;
const retries = () => rows.filter((r) => r.collection === 'scheduled_outreach');
const missed = (c = call(), deps: Record<string, unknown> = {}) =>
  recordCallFollowthrough(c, [], 35, { now: () => NOW, ...deps });

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  process.env.CALL_FOLLOWTHROUGH = 'on';
  process.env.SIP_TRUNK_ID = 'ST_test';
});
afterEach(() => {
  delete process.env.CALL_FOLLOWTHROUGH;
  delete process.env.SIP_TRUNK_ID;
});

describe('localTimeAfter', () => {
  it('is 10:30 the next morning in the given zone', () => {
    expect(localTimeAfter(NOW, 'America/Los_Angeles', 1, 10, 30).toISOString()).toBe(
      '2026-10-11T17:30:00.000Z'
    );
  });
  it('lands on the right hour across a daylight-saving change', () => {
    // 4pm EDT on Oct 31; Nov 1 is back on EST (UTC-5).
    const evening = new Date('2026-10-31T20:00:00.000Z');
    expect(localTimeAfter(evening, 'America/New_York', 1, 10, 30).toISOString()).toBe(
      '2026-11-01T15:30:00.000Z'
    );
  });
});

describe('scheduling the retry', () => {
  it('schedules exactly one retry for a missed call, next day 10:30 local', async () => {
    expect(retries()).toHaveLength(0);
    const result = await missed();

    expect(result).toMatchObject({
      outcome: 'no_answer',
      retryScheduledFor: '2026-10-11T17:30:00.000Z',
    });
    expect(retries()).toHaveLength(1);
    const [retry] = retries();
    expect(retry).toMatchObject({ id: 'retry_doug-checkin-20261010', userId: 'seth' });
    expect(retry.data).toMatchObject({ status: 'pending', maxRetries: 0 });
    expect(retry.data.scheduledFor).toBeInstanceOf(Date);
    expect(retry.data.target).toMatchObject({
      channel: 'on_behalf_call',
      onBehalfRequest: {
        retryOf: 'doug-checkin-20261010',
        resolvedContact: { phone: '+18015550123' },
      },
    });
  });

  it('never schedules a second retry for the same call', async () => {
    await missed();
    const again = await missed();

    expect(again?.retryScheduledFor).toBeNull();
    expect(retries()).toHaveLength(1);
  });

  it('does not retry a call that is itself the retry', async () => {
    const result = await recordCallFollowthrough(
      call({ callId: 'onbehalf_2', retryOf: 'doug-checkin-20261010' }),
      [{ role: 'user', content: "You've reached Doug, leave a message." }],
      20,
      { now: () => NOW }
    );

    expect(result).toMatchObject({ outcome: 'voicemail', retryScheduledFor: null });
    expect(retries()).toHaveLength(0);
  });

  it('does not retry a call that was answered', async () => {
    const turns = ['Hi', 'Doing great', 'Bye'].map((content) => ({ role: 'user', content }));
    await recordCallFollowthrough(call(), turns, 60, {
      now: () => NOW,
      summarize: async () => ({ summary: 'Talked to your dad.' }),
    });
    expect(retries()).toHaveLength(0);
  });

  it('moves the retry to a time the calling-hours guard allows, or skips it', async () => {
    const afterNoonOnly = vi.fn((_r: unknown, at: Date) => at.getUTCHours() >= 19);
    const later = await missed(call(), { isAllowedCallTime: afterNoonOnly });
    expect(later?.retryScheduledFor).toBe('2026-10-11T19:30:00.000Z');
    expect(afterNoonOnly).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Doug', phone: '+18015550123' }),
      expect.any(Date)
    );

    rows = [];
    const never = await missed(call(), { isAllowedCallTime: () => false });
    expect(never?.retryScheduledFor).toBeNull();
    expect(retries()).toHaveLength(0);
  });
});

describe('placing the retry from the scheduled-outreach job', () => {
  it('places the retry as an on-behalf call', async () => {
    await missed();

    const run = await executeDueScheduledOutreach({ now: new Date('2026-10-11T17:31:00.000Z') });

    expect(run).toMatchObject({ due: 1, executed: 1 });
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(initiateCall).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'seth', retryOf: 'doug-checkin-20261010' })
    );
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'seth',
      'retry_doug-checkin-20261010',
      'completed',
      expect.objectContaining({ success: true, channel: 'on_behalf_call' })
    );
  });

  it('places nothing with the flag off, without a SIP trunk, or outside calling hours', async () => {
    const { request } = call({ retryOf: 'c0' });
    delete process.env.CALL_FOLLOWTHROUGH;
    expect(await placeCallRetry(request)).toMatchObject({ success: false });
    process.env.CALL_FOLLOWTHROUGH = 'on';
    delete process.env.SIP_TRUNK_ID;
    expect(await placeCallRetry(request)).toMatchObject({ success: false });
    process.env.SIP_TRUNK_ID = 'ST_test';
    expect(await placeCallRetry(request, { isAllowedCallTime: () => false })).toMatchObject({
      success: false,
      error: 'Outside calling hours',
    });
    expect(initiateCall).not.toHaveBeenCalled();

    expect(await placeCallRetry(request)).toEqual({ success: true });
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });
});
