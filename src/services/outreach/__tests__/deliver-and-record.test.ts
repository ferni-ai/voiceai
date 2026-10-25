import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userDoc: Record<string, unknown> | undefined;
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: !!userDoc, data: () => userDoc }) }),
    }),
  }),
}));
const deliverOutreach = vi.fn();
const recordAttempt = vi.fn();

vi.mock('../delivery/index.js', () => ({ deliverOutreach }));
vi.mock('../outreach-history.js', () => ({ outreachHistory: { recordAttempt } }));
vi.mock('../../session/session-lifecycle-hooks.js', () => ({
  sessionLifecycle: { isAvailableForOutreach: async () => ({ available: true }) },
}));
vi.mock('../conversation-context-bridge.js', () => ({ storeOutreachContext: async () => {} }));

const { deliverAndRecord } = await import('../deliver-and-record.js');
const { OutreachOrchestrator } = await import('../outreach-orchestrator.js');

const send = {
  userId: 'uid-1',
  channel: 'push' as const,
  message: 'How did the interview go?',
  personaId: 'ferni',
  outreachId: 'push_uid-1_1',
  reason: 'follow_up',
};

beforeEach(() => {
  userDoc = undefined;
  deliverOutreach.mockReset();
  recordAttempt.mockReset().mockResolvedValue('attempt-1');
});

describe('deliverAndRecord', () => {
  it('records the message it sent, as delivered', async () => {
    deliverOutreach.mockResolvedValue({ success: true, channel: 'push' });

    expect(await deliverAndRecord(send)).toBe(true);
    expect(recordAttempt).toHaveBeenCalledWith('uid-1', {
      type: 'thinking_of_you',
      reason: 'follow_up',
      channel: 'push',
      personaId: 'ferni',
      message: 'How did the interview go?',
      status: 'delivered',
    });
  });

  it('records a send the channel refused as failed, not delivered', async () => {
    deliverOutreach.mockResolvedValue({ success: false, channel: 'push', error: 'no token' });

    expect(await deliverAndRecord(send)).toBe(false);
    expect(recordAttempt.mock.calls[0][1]).toMatchObject({
      status: 'failed',
      message: send.message,
    });
  });

  it('records a send that threw as failed', async () => {
    deliverOutreach.mockRejectedValue(new Error('boom'));

    expect(await deliverAndRecord(send)).toBe(false);
    expect(recordAttempt.mock.calls[0][1]).toMatchObject({ status: 'failed' });
  });

  it('stores a call as a voice attempt', async () => {
    deliverOutreach.mockResolvedValue({ success: true, channel: 'call' });

    await deliverAndRecord({ ...send, channel: 'call' });
    expect(deliverOutreach.mock.calls[0][0]).toMatchObject({ channel: 'call' });
    expect(recordAttempt.mock.calls[0][1]).toMatchObject({ channel: 'voice' });
  });
});

describe('OutreachOrchestrator sends', () => {
  it('a push records the message the person was sent', async () => {
    deliverOutreach.mockResolvedValue({ success: true, channel: 'push' });
    const orchestrator = new OutreachOrchestrator();

    await orchestrator.sendPushNotification('uid-2', 'Did the move go okay?', {
      trigger: 'commitment_followup',
    });

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    expect(recordAttempt.mock.calls[0]).toEqual([
      'uid-2',
      expect.objectContaining({
        channel: 'push',
        message: 'Did the move go okay?',
        reason: 'commitment_followup',
        status: 'delivered',
      }),
    ]);
    expect(orchestrator.getTelemetry().successfulDeliveries).toBe(1);
  });

  it('a text that did not go out is not counted as delivered', async () => {
    deliverOutreach.mockResolvedValue({ success: false, channel: 'sms', error: 'no phone' });
    const orchestrator = new OutreachOrchestrator();

    await orchestrator.sendSMS('uid-3', 'How was the trip?', {});

    expect(recordAttempt.mock.calls[0][1]).toMatchObject({
      channel: 'sms',
      message: 'How was the trip?',
      status: 'failed',
    });
    expect(orchestrator.getTelemetry().successfulDeliveries).toBe(0);
  });
});

describe('deliverAndRecord: QUIET_HOURS_FROM_PREFS', () => {
  const quietUser = {
    messagingPrefs: { quietStart: '20:00', quietEnd: '09:30', zone: 'America/Chicago' },
  };
  beforeEach(() => {
    userDoc = quietUser;
    vi.useFakeTimers({ toFake: ['Date'] });
    deliverOutreach.mockResolvedValue({ success: true, channel: 'push' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('inside the saved window nothing goes out and no attempt is recorded', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    vi.setSystemTime(new Date('2026-10-21T01:15:00Z')); // 20:15 Chicago
    expect(await deliverAndRecord(send)).toBe(false);
    expect(deliverOutreach).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it('outside it, or with the flag off, it is delivered as before', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    vi.setSystemTime(new Date('2026-10-20T20:00:00Z')); // 15:00 Chicago
    expect(await deliverAndRecord(send)).toBe(true);
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
    vi.setSystemTime(new Date('2026-10-21T01:15:00Z'));
    expect(await deliverAndRecord(send)).toBe(true);
    expect(deliverOutreach).toHaveBeenCalledTimes(2);
  });
});
