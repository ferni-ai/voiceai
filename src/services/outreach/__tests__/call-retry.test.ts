/**
 * A missed on-behalf call gets exactly one retry, the next day, and only inside
 * calling hours, only for a number not on the do-not-call list, and only as a
 * server-signed retry for the user who owns it. Drives the real scheduling and
 * the real scheduled-outreach job against a fake Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import {
  buildOnBehalfDispatch,
  verifyOnBehalfDispatch,
  type OnBehalfDispatch,
} from '../on-behalf-dispatch.js';

let rows: Row[] = [];
let firestoreUp = true;
let optOutListDown = false;
const initiateCall = vi.fn(async () => 'onbehalf_new');
const updateOutreachStatus = vi.fn(async () => undefined);

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => {
    if (!firestoreUp) return null;
    const db = fakeFirestore(rows);
    if (!optOutListDown) return db;
    return {
      ...db,
      collection: (c: string) =>
        c === 'call_opt_outs'
          ? {
              doc: () => ({
                get: async () => {
                  throw new Error('unavailable');
                },
              }),
            }
          : db.collection(c),
    };
  },
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

const {
  localTimeAfter,
  placeCallRetry,
  recordCallOptOut,
  rememberVerifiedCall,
  safeWindowGuard,
  scheduleCallRetry,
  scheduleCallRetryById,
} = await import('../call-retry.js');
const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

// 10:33 in Los Angeles, Saturday 2026-10-10.
const NOW = new Date('2026-10-10T17:33:00.000Z');
// Sunday 13:00 Eastern: 10:00 Pacific, 14:00 Atlantic.
const FIRST_SAFE_SLOT = '2026-10-11T17:00:00.000Z';

const call = (extra: Partial<OnBehalfDispatch> = {}): OnBehalfDispatch => ({
  ...buildOnBehalfDispatch({
    callId: 'doug-checkin-20261010',
    requester: {
      userId: 'seth',
      name: 'Seth',
      timezone: 'America/Los_Angeles',
      originalSessionId: 's0',
    },
    contact: { name: 'Doug', phone: '+18015550123', relationship: 'dad' },
    purpose: 'check in and say hi from Seth',
    objective: 'check_in',
    callType: 'personal',
  }),
  ...extra,
});
const retries = () => rows.filter((r) => r.collection === 'scheduled_outreach');
const storedDispatch = () =>
  (retries()[0].data.target as { onBehalfDispatch: Record<string, unknown> }).onBehalfDispatch;
const schedule = (c = call(), deps = {}) => scheduleCallRetry(c, { now: () => NOW, ...deps });
const at = (iso: string) => ({ now: () => new Date(iso) });

beforeEach(() => {
  rows = [];
  firestoreUp = true;
  optOutListDown = false;
  vi.clearAllMocks();
  process.env.CALL_FOLLOWTHROUGH = 'on';
  process.env.SIP_TRUNK_ID = 'ST_test';
  process.env.LIVEKIT_API_SECRET = 'server-secret';
});
afterEach(() => {
  delete process.env.CALL_FOLLOWTHROUGH;
  delete process.env.SIP_TRUNK_ID;
  delete process.env.LIVEKIT_API_SECRET;
});

describe('localTimeAfter', () => {
  it('is 10:30 the next morning in the given zone', () => {
    expect(localTimeAfter(NOW, 'America/Los_Angeles', 1, 10, 30).toISOString()).toBe(
      '2026-10-11T17:30:00.000Z'
    );
  });
  it('lands on the right hour across a daylight-saving change', () => {
    const evening = new Date('2026-10-31T20:00:00.000Z');
    expect(localTimeAfter(evening, 'America/New_York', 1, 10, 30).toISOString()).toBe(
      '2026-11-01T15:30:00.000Z'
    );
  });
});

describe('safeWindowGuard (fails closed without a calling-hours guard)', () => {
  const doug = { phone: '+18015550123' };
  it.each([
    ['13:00 Eastern', '2026-10-11T17:00:00.000Z', doug, true],
    ['9:00 Eastern (6:00 Pacific)', '2026-10-11T13:00:00.000Z', doug, false],
    ['17:30 Eastern (18:30 Atlantic)', '2026-10-11T21:30:00.000Z', doug, false],
    ['3:00 Eastern', '2026-10-11T07:00:00.000Z', doug, false],
    [
      'a Hawaii number at 13:00 Eastern',
      '2026-10-11T17:00:00.000Z',
      { phone: '+18085550123' },
      false,
    ],
    ['a UK number', '2026-10-11T17:00:00.000Z', { phone: '+442071234567' }, false],
    ['no number', '2026-10-11T17:00:00.000Z', {}, false],
  ])('%s -> %s', (_label, iso, recipient, allowed) => {
    expect(safeWindowGuard(recipient, new Date(iso))).toBe(allowed);
  });
});

describe('scheduleCallRetry', () => {
  it('schedules one signed retry, next day inside calling hours', async () => {
    expect(retries()).toHaveLength(0);
    const when = await schedule();

    expect(when?.toISOString()).toBe(FIRST_SAFE_SLOT);
    expect(retries()).toHaveLength(1);
    const [retry] = retries();
    expect(retry).toMatchObject({ id: 'retry_doug-checkin-20261010', userId: 'seth' });
    expect(retry.data).toMatchObject({ status: 'pending', maxRetries: 0 });
    expect(retry.data.scheduledFor).toBeInstanceOf(Date);
    expect(storedDispatch()).toMatchObject({
      retryOf: 'doug-checkin-20261010',
      requester: { userId: 'seth' },
      contact: { phone: '+18015550123' },
    });
    expect(verifyOnBehalfDispatch(JSON.stringify(storedDispatch()), 'server-secret')).toBe(true);
  });

  it('never schedules a second retry for the same call', async () => {
    await schedule();
    expect(await schedule()).toBeNull();
    expect(retries()).toHaveLength(1);
  });

  it('does not retry a call that is itself the retry', async () => {
    expect(await schedule(call({ retryOf: 'doug-checkin-20261009' }))).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it('does not retry a number on the do-not-call list, or when the list is unreadable', async () => {
    await recordCallOptOut('+1 (801) 555-0123', { callId: 'c0', requesterUserId: 'seth' });
    expect(await schedule()).toBeNull();

    rows = [];
    optOutListDown = true;
    expect(await schedule()).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it('uses an injected calling-hours guard, and skips the retry if it allows nothing', async () => {
    const afternoonOnly = vi.fn((_r: unknown, t: Date) => t.getUTCHours() >= 19);
    expect((await schedule(call(), { isAllowedCallTime: afternoonOnly }))?.toISOString()).toBe(
      '2026-10-11T19:00:00.000Z'
    );
    rows = [];
    expect(await schedule(call(), { isAllowedCallTime: () => false })).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it('does not schedule an unsigned retry', async () => {
    delete process.env.LIVEKIT_API_SECRET;
    expect(await schedule()).toBeNull();
    expect(retries()).toHaveLength(0);
  });
});

describe('scheduleCallRetryById (voicemail detection holds only the callId)', () => {
  it('schedules only for a call this process verified, and only with the flag on', async () => {
    expect(await scheduleCallRetryById('unknown-call', { now: () => NOW })).toBeNull();

    const verified = call({ callId: 'verified-call' });
    rememberVerifiedCall(verified);
    delete process.env.CALL_FOLLOWTHROUGH;
    expect(await scheduleCallRetryById('verified-call', { now: () => NOW })).toBeNull();
    process.env.CALL_FOLLOWTHROUGH = 'on';

    const when = await scheduleCallRetryById('verified-call', { now: () => NOW });
    expect(when?.toISOString()).toBe(FIRST_SAFE_SLOT);
    expect(retries()).toHaveLength(1);
    expect(retries()[0].id).toBe('retry_verified-call');
  });
});

describe('placing the retry', () => {
  it('the scheduled-outreach job places it when due', async () => {
    await schedule();

    const run = await executeDueScheduledOutreach({ now: new Date('2026-10-11T17:01:00.000Z') });

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

  it('refuses anything not signed, not this user, opted out, out of hours or flag off', async () => {
    await schedule();
    const signed = storedDispatch();
    const inHours = at('2026-10-11T17:01:00.000Z');

    expect(
      await placeCallRetry(
        { ...signed, contact: { name: 'X', phone: '+18015559999' } },
        'seth',
        inHours
      )
    ).toMatchObject({ success: false });
    expect(await placeCallRetry(signed, 'someone-else', inHours)).toMatchObject({ success: false });
    expect(await placeCallRetry(signed, 'seth', at('2026-10-11T07:00:00.000Z'))).toMatchObject({
      success: false,
      error: 'Outside calling hours',
    });
    delete process.env.SIP_TRUNK_ID;
    expect(await placeCallRetry(signed, 'seth', inHours)).toMatchObject({ success: false });
    process.env.SIP_TRUNK_ID = 'ST_test';
    delete process.env.CALL_FOLLOWTHROUGH;
    expect(await placeCallRetry(signed, 'seth', inHours)).toMatchObject({ success: false });
    process.env.CALL_FOLLOWTHROUGH = 'on';
    await recordCallOptOut('+18015550123', { callId: 'c1', requesterUserId: 'seth' });
    expect(await placeCallRetry(signed, 'seth', inHours)).toMatchObject({
      success: false,
      error: 'Recipient asked not to be called',
    });
    expect(initiateCall).not.toHaveBeenCalled();

    rows = rows.filter((r) => r.collection !== 'call_opt_outs');
    optOutListDown = true;
    expect(await placeCallRetry(signed, 'seth', inHours)).toMatchObject({ success: false });
    optOutListDown = false;
    expect(initiateCall).not.toHaveBeenCalled();
    expect(await placeCallRetry(signed, 'seth', inHours)).toEqual({ success: true });
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });
});
