/**
 * MINOR_CARE_SHARED_HOLD in the API server and workers: a caller held under 18 by a call in
 * another process (minor_care_holds/{uid}) has no inbound text kept (the SMS thread, a check-in
 * reply) and gets no outreach (guarded texts they didn't just ask for, deliverOutreach). The text
 * is still routed and answered. Unheld users, and everyone with the flag off, as before. The real
 * handlers run; only storage and senders are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';

const threads = vi.hoisted(() => ({
  getOrCreateThread: vi.fn(async () => ({ id: 't1' })),
  addMessage: vi.fn(async () => undefined),
  getActiveThread: vi.fn(async () => null),
}));
vi.mock('../../conversation-thread/thread-manager.js', () => threads);
vi.mock('../conversation-context-bridge.js', () => ({
  getConversationBridgeContext: async () => null,
}));
const push = vi.hoisted(() => vi.fn(async () => [{ success: true, messageId: 'p1' }]));
vi.mock('../delivery/push-notifications.js', async (orig) => ({
  ...(await orig<object>()),
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push,
}));

const { handleInboundSMS } = await import('../../conversation-thread/inbound-router.js');
const { phoneHash, recordCheckinReply } = await import('../checkin-replies.js');
const { sendGuardedText } = await import('../guarded-text.js');
const { deliverOutreach } = await import('../delivery/index.js');
const { setHoldStore } = await import('../../safety/minor-care-shared-hold.js');
type TextStore = import('../guarded-text.js').TextStore;
type TextDeps = import('../guarded-text.js').TextDeps;

const HELD = 'teen-uid';
const PHONE = '+15551234567';
const ENV = { LOG_HASH_SECRET: 'test-secret' };

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  setHoldStore({
    heldUntil: async (uid) => (uid === HELD ? Date.now() + 60_000 : undefined),
    write: async () => undefined,
  });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe('inbound SMS (inbound-router handleInboundSMS)', () => {
  it('held: routed and answered, but no thread and no message kept', async () => {
    const result = await handleInboundSMS(HELD, PHONE, 'call me, I had a bad day');
    expect(result.routeDecision.agentId).toBeTruthy();
    expect(result.shouldInitiateCall).toBe(true);
    expect(result.responseMessage).toBeTruthy();
    expect(threads.getOrCreateThread).not.toHaveBeenCalled();
    expect(threads.addMessage).not.toHaveBeenCalled();
  });

  it('held by a phone-only call (phone:<number>): nothing kept', async () => {
    setHoldStore({
      heldUntil: async (uid) => (uid === `phone:${PHONE}` ? Date.now() + 60_000 : undefined),
      write: async () => undefined,
    });
    await handleInboundSMS('profile-uid', PHONE, 'hi');
    expect(threads.addMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['an unheld user', 'adult-uid', 'on'],
    ['the flag off', HELD, 'off'],
  ])('%s: kept as before', async (_name, userId, flag) => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    await handleInboundSMS(userId, PHONE, 'sounds good');
    expect(threads.addMessage).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ content: 'sounds good', direction: 'inbound' })
    );
  });
});

describe('a reply to a check-in (recordCheckinReply)', () => {
  const run = async (userId: string) => {
    const addReply = vi.fn(async () => undefined);
    const checkin = {
      id: 'c1',
      userId,
      sessionId: 's0',
      sentAt: new Date(Date.now() - 3_600_000).toISOString(),
      question: 'q',
      status: 'sent' as const,
      phoneLast4: '4567',
      phoneHash: phoneHash(PHONE, ENV) ?? '',
    };
    const store = { forPhoneHash: async () => [checkin], addReply };
    const deps = { store: store as never, now: () => new Date(), env: { ...process.env, ...ENV } };
    return { id: await recordCheckinReply(PHONE, 'my school is X', 'SM1', deps), addReply };
  };

  it('held: not kept', async () => {
    const { id, addReply } = await run(HELD);
    expect(id).toBeNull();
    expect(addReply).not.toHaveBeenCalled();
  });

  it('unheld: kept under the check-in', async () => {
    const { id, addReply } = await run('adult-uid');
    expect(id).toBe('c1');
    expect(addReply).toHaveBeenCalledTimes(1);
  });
});

describe('a guarded text (sendGuardedText)', () => {
  const deps = (): TextDeps => ({
    env: { ...process.env, ...ENV },
    store: {
      forUser: async () => [],
      forPhoneHash: async () => [],
      add: async () => 'new',
      ...atomicLocks(),
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      consentDoc: async () => undefined,
      userDoc: async () => undefined,
      legacySmsChannels: async () => undefined,
    } as unknown as TextStore,
    authPhone: async () => PHONE,
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date(),
  });
  const text = (userId: string, askedNow?: boolean) => ({
    userId,
    body: 'thinking of you',
    kind: 'proactive' as const,
    refId: 'r1',
    minGapMs: 60_000,
    ...(askedNow !== undefined && { askedNow }),
  });

  it('held: a text they did not just ask for is not sent', async () => {
    const d = deps();
    expect(await sendGuardedText(text(HELD), d)).toEqual({ sent: false, reason: 'held' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('held, but asked for in the call just now: sent', async () => {
    const d = deps();
    expect(await sendGuardedText(text(HELD, true), d)).toEqual({ sent: true });
  });

  it('unheld: sent as before', async () => {
    const d = deps();
    expect(await sendGuardedText(text('adult-uid'), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe('outreach delivery (deliverOutreach)', () => {
  const send = (userId: string) =>
    deliverOutreach({ userId, channel: 'push', message: 'hey', personaId: 'ferni' });

  it('held: not delivered', async () => {
    expect(await send(HELD)).toMatchObject({ success: false });
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['an unheld user', 'adult-uid', 'on'],
    ['the flag off', HELD, 'off'],
  ])('%s: delivered as before', async (_name, userId, flag) => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    expect(await send(userId)).toMatchObject({ success: true });
    expect(push).toHaveBeenCalledTimes(1);
  });
});
