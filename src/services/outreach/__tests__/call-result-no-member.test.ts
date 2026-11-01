/**
 * PRIVACY: a call placed with no member behind it (a media stream with no
 * userId resolved to 'unknown') stores and sends nothing under that id. Every
 * such call landed in one shared bucket (bogle_users/unknown/on_behalf_calls),
 * so the next caller's lookup read the last one's results. A member's results
 * are kept as before. Drives the real report path with Firestore off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const sendPushNotification = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification,
}));

const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { captureCallResult, getRecentCallResults } = await import('../call-result-capture.js');
const { onBehalfDispatchFromStream } = await import('../on-behalf-dispatch.js');

const HEARD = [
  { role: 'agent' as const, content: "Hi, it's Ferni, calling for Sam." },
  { role: 'recipient' as const, content: 'Your test results are ready, call me back tomorrow.' },
];

async function reportFromStream(params: Record<string, string | undefined>): Promise<void> {
  const c = onBehalfDispatchFromStream(params, `room-${params.callId}`);
  const outcome = buildCallOutcome(c, HEARD, null, 'completed', 40);
  await captureCallResult(c.callId, outcome, toOnBehalfCallRequest(c));
}

beforeEach(() => vi.clearAllMocks());

describe('call results with no member behind them', () => {
  it('two member-less calls never see each other and nothing is sent', async () => {
    await reportFromStream({ callId: 'c-one', recipientName: 'Dr Lee', phone: '+15555550101' });
    await reportFromStream({ callId: 'c-two', recipientName: 'Mom', phone: '+15555550102' });

    expect(await getRecentCallResults('unknown')).toEqual([]);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("a member's results are kept", async () => {
    await reportFromStream({ callId: 'c-m', userId: 'uid-member', recipientName: 'Dr Lee' });

    const results = await getRecentCallResults('uid-member');
    expect(results.map((r) => r.callId)).toEqual(['c-m']);
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-member' })
    );
  });
});
