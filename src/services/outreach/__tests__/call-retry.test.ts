/**
 * A missed on-behalf call gets exactly one retry, the next day at a time the
 * recipient can be called, and the scheduled-outreach job places it as an
 * on-behalf call. Drives the real scheduling and the real job against a fake
 * Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

let rows: Row[] = [];
const initiateCall = vi.fn(async () => 'onbehalf_new');
const updateOutreachStatus = vi.fn(async () => undefined);

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
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

const { localTimeAfter, placeCallRetry, scheduleCallRetry } = await import('../call-retry.js');
const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

// 10:33 in Los Angeles, Saturday 2026-10-10.
const NOW = new Date('2026-10-10T17:33:00.000Z');
const request = (extra: Partial<OnBehalfCallRequest> = {}): OnBehalfCallRequest => ({
  contactQuery: 'Doug',
  resolvedContact: { name: 'Doug', phone: '+18015550123', relationship: 'dad' },
  purpose: 'check in and say hi from Seth',
  objective: 'check_in',
  callType: 'personal',
  originalSessionId: 's0',
  userId: 'seth',
  userTimezone: 'America/Los_Angeles',
  userName: 'Seth',
  recordingConsent: false,
  ...extra,
});
const retries = () => rows.filter((r) => r.collection === 'scheduled_outreach');
const schedule = (req = request(), deps = {}) =>
  scheduleCallRetry('doug-checkin-20261010', req, { now: () => NOW, ...deps });

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

describe('scheduleCallRetry', () => {
  it('schedules one retry for the next day, 10:30 local', async () => {
    expect(retries()).toHaveLength(0);
    const at = await schedule();

    expect(at?.toISOString()).toBe('2026-10-11T17:30:00.000Z');
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
    await schedule();
    expect(await schedule()).toBeNull();
    expect(retries()).toHaveLength(1);
  });

  it('does not retry a call that is itself the retry', async () => {
    expect(await schedule(request({ retryOf: 'doug-checkin-20261009' }))).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it('moves the retry to a time the calling-hours guard allows, or skips it', async () => {
    const afterNoonOnly = vi.fn((_r: unknown, at: Date) => at.getUTCHours() >= 19);
    const later = await schedule(request(), { isAllowedCallTime: afterNoonOnly });
    expect(later?.toISOString()).toBe('2026-10-11T19:30:00.000Z');
    expect(afterNoonOnly).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Doug', phone: '+18015550123' }),
      expect.any(Date)
    );

    rows = [];
    expect(await schedule(request(), { isAllowedCallTime: () => false })).toBeNull();
    expect(retries()).toHaveLength(0);
  });
});

describe('placing the retry from the scheduled-outreach job', () => {
  it('places the retry as an on-behalf call', async () => {
    await schedule();

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
    const retry = request({ retryOf: 'c0' });
    delete process.env.CALL_FOLLOWTHROUGH;
    expect(await placeCallRetry(retry)).toMatchObject({ success: false });
    process.env.CALL_FOLLOWTHROUGH = 'on';
    delete process.env.SIP_TRUNK_ID;
    expect(await placeCallRetry(retry)).toMatchObject({ success: false });
    process.env.SIP_TRUNK_ID = 'ST_test';
    expect(await placeCallRetry(retry, { isAllowedCallTime: () => false })).toMatchObject({
      success: false,
      error: 'Outside calling hours',
    });
    expect(initiateCall).not.toHaveBeenCalled();

    expect(await placeCallRetry(retry)).toEqual({ success: true });
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });
});
