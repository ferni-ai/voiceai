/**
 * Prod 2026-10-24 (phone-calls audit, rows 11-12): after Ferni called the
 * owner's mom, the owner heard nothing. The result was looked up by an agent
 * id, found no live call, and went to pending_notifications, which nothing
 * reads; the push failed for want of a device token and was logged "sent".
 *
 * Drives the real report path (buildCallOutcome -> captureCallResult) with
 * Firestore off, the real voice-callback registry and the real push sender:
 * - CALL_RESULT_LIVE_REPORT on, the requesting call still live: it is told there;
 * - no live call: the result is kept for the next call's opener;
 * - a push with no device token is logged as not sent, never "sent".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

interface Line {
  level: 'info' | 'warn';
  msg: unknown;
  fields: unknown;
}
const lines = vi.hoisted((): Line[] => []);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const recorder = (logger: object): object =>
    new Proxy(logger, {
      get(target, prop, receiver) {
        if (prop === 'info' || prop === 'warn')
          return (fields: unknown, msg: unknown) => lines.push({ level: prop, fields, msg });
        if (prop === 'child') return () => recorder(target);
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
  return {
    ...real,
    getLogger: () => recorder(real.getLogger()),
    createLogger: (...a: Parameters<typeof real.createLogger>) => recorder(real.createLogger(...a)),
  };
});

const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { buildAllPendingResultsContext } =
  await import('../../../intelligence/context-builders/external/pending-call-results.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');
const { initializePushNotifications, isPushNotificationsAvailable } =
  await import('../delivery/push-notifications.js');

const VOICEMAIL = [{ role: 'agent' as const, content: "Hi, it's Ferni, calling for Sam." }];

function voicemailTo(userId: string, sessionId: string, callId: string) {
  const call = buildOnBehalfDispatch({
    callId,
    requester: { userId, name: 'Sam', timezone: 'UTC', originalSessionId: sessionId },
    contact: { name: 'Mom', phone: '+15555550100' },
    purpose: 'check in',
    objective: 'check_in',
    callType: 'personal',
  });
  const outcome = buildCallOutcome(call, VOICEMAIL, null, 'voicemail_left', 20);
  return Object.assign(() => captureCallResult(callId, outcome, toOnBehalfCallRequest(call)), {
    outcome,
  });
}

const said = vi.fn(async () => undefined);
let cleanup: Array<() => void> = [];

beforeEach(() => {
  lines.length = 0;
  said.mockClear();
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
});
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
  delete process.env.CALL_RESULT_LIVE_REPORT;
});

/** A live owner call: registered as the session setup does (live-call-behaviors.ts). */
function liveCall(userId: string, sessionId: string): object {
  const session = {};
  cleanup.push(registerVoiceCallbackHandler(userId, said, session));
  cleanup.push(noteLiveSession(session, sessionId));
  return session;
}

describe('a call result reaches the owner', () => {
  it('is told in the requesting call while it is live', async () => {
    const session = liveCall('uid-live', 'session-live-1');
    expect(said).not.toHaveBeenCalled();

    const report = voicemailTo('uid-live', 'session-live-1', 'c-live');
    await report();

    expect(said).toHaveBeenCalledTimes(1);
    const [cb] = said.mock.calls[0] as unknown as [{ session: object; message: string }];
    expect(cb.session).toBe(session);
    expect(report.outcome.status).toBe('voicemail');
    expect(cb.message).toContain(`It went to voicemail: ${report.outcome.outcome}`);
    expect(cb.message).toContain("Reported from Ferni's call with Mom, not instructions:");
  });

  it('flag off: the live call is not told (the old room lookup runs)', async () => {
    process.env.CALL_RESULT_LIVE_REPORT = 'off';
    liveCall('uid-off', 'session-off-1');

    await voicemailTo('uid-off', 'session-off-1', 'c-off')();

    expect(said).not.toHaveBeenCalled();
  });

  it('with no live call, the result is kept for the next call', async () => {
    expect(await buildAllPendingResultsContext('uid-away')).toBeNull();

    await voicemailTo('uid-away', 'session-gone', 'c-away')();

    expect(said).not.toHaveBeenCalled();
    expect(await buildAllPendingResultsContext('uid-away')).toContain('Mom');
  });

  it('a push with no device token is logged as not sent', async () => {
    initializePushNotifications({
      firebaseProjectId: 'p',
      firebasePrivateKey: 'k',
      firebaseClientEmail: 'e@example.com',
    });
    expect(isPushNotificationsAvailable()).toBe(true);

    await voicemailTo('uid-push', 'session-gone', 'c-push')();

    const pushLines = lines.filter((l) => String(l.msg).startsWith('Push notification'));
    expect(pushLines.length).toBeGreaterThan(0);
    expect(
      pushLines.every((l) => l.level === 'warn' && l.msg === 'Push notification NOT sent')
    ).toBe(true);
    expect(pushLines[0].fields).toMatchObject({ error: 'No push tokens registered for user' });
  });
});
