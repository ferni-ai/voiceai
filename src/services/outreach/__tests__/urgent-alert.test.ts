/**
 * The urgent family check-in alert: push first, a text when the push isn't
 * delivered. The real chain runs (sendUrgentNotificationToSponsor → sendUrgentAlert
 * → orchestrator.sendPushNotification → deliverAndRecord → deliverOutreach →
 * hasPushDevice / userReach → sendSMS → consent and MINOR_CARE hold checks).
 * Faked: the two transports (FCM's per-token results, Twilio's messages.create)
 * and storage (Firestore docs in memory, the attempt log, the context bridge).
 * All ids and numbers are synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const errors = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => errors.push(args),
    child: logger,
  });
  return { createLogger: logger, getLogger: logger, safeLog: logger, serializeError: String };
});

/** In-memory Firestore: docs keyed by path; doc().get, doc().collection, where().limit().get. */
const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  interface Coll {
    doc: (id: string) => { get: () => Promise<unknown>; collection: (sub: string) => Coll };
    where: (
      f: string,
      op: string,
      v: unknown
    ) => { limit: (n: number) => { get: () => Promise<unknown> } };
  }
  const db = (prefix = ''): { collection: (name: string) => Coll } => ({
    collection: (name) => {
      const path = `${prefix}${name}`;
      return {
        doc: (id) => ({
          get: async () => {
            const data = docs.get(`${path}/${id}`);
            return { exists: !!data, data: () => data };
          },
          collection: (sub) => db(`${path}/${id}/`).collection(sub),
        }),
        where: (field, _op, value) => ({
          limit: () => ({
            get: async () => {
              const hits = [...docs].filter(
                ([k, d]) =>
                  k.split('/').length === path.split('/').length + 1 &&
                  k.startsWith(`${path}/`) &&
                  d[field] === value
              );
              return { empty: hits.length === 0, docs: hits.map(([, d]) => ({ data: () => d })) };
            },
          }),
        }),
      };
    },
  });
  return { docs, db };
});
vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => store.db(),
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => store.db(),
}));
const recordAttempt = vi.hoisted(() => vi.fn());
vi.mock('../outreach-history.js', () => ({ outreachHistory: { recordAttempt } }));
const storeOutreachContext = vi.hoisted(() => vi.fn());
vi.mock('../conversation-context-bridge.js', () => ({ storeOutreachContext }));
vi.mock('../../identity/firebase-auth.js', () => ({ getFirebaseUser: async () => null }));

type Push = typeof import('../delivery/push-notifications.js');
const fcm = vi.hoisted(() => ({ results: vi.fn(), real: undefined as unknown }));
vi.mock('../delivery/push-notifications.js', async (importOriginal) => {
  const real = await importOriginal<Push>();
  fcm.real = real.sendPushNotification;
  return { ...real, sendPushNotification: fcm.results };
});
const twilio = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('twilio', () => ({ default: () => ({ messages: { create: twilio.create } }) }));

const { initializePushNotifications } = await import('../delivery/push-notifications.js');
const { initializeSMSDelivery } = await import('../delivery/sms-delivery.js');
const { phoneHash } = await import('../checkin-replies.js');
const { OutreachOrchestrator } = await import('../outreach-orchestrator.js');
const { sendUrgentNotificationToSponsor } = await import('../../family/family-checkin-caller.js');

const { docs } = store;
const SPONSOR = 'phone:+15555550100';
const ALERT = 'Your dad mentioned chest pain on the check-in call.';
const withPhone = (userId = SPONSOR): void => {
  docs.set(`push_devices/dev-${userId}`, { userId, platform: 'ios' });
};

beforeEach(() => {
  docs.clear();
  docs.set(`bogle_users/${SPONSOR}`, {});
  errors.length = 0;
  recordAttempt.mockReset().mockResolvedValue('a1');
  storeOutreachContext.mockReset().mockResolvedValue(undefined);
  fcm.results.mockReset().mockImplementation(fcm.real as Push['sendPushNotification']); // real one
  twilio.create.mockReset().mockResolvedValue({ sid: 'SM_synthetic', status: 'queued' });
  initializePushNotifications({
    firebaseProjectId: 'p',
    firebasePrivateKey: 'k',
    firebaseClientEmail: 'e',
  });
  initializeSMSDelivery({
    twilioAccountSid: 'AC_x',
    twilioAuthToken: 't',
    twilioPhoneNumber: '+15555550199',
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const texted = () => twilio.create.mock.calls.map(([m]) => m as { to: string; body: string });
const alertErrors = () => errors.filter((a) => String(a[1]).startsWith('Urgent alert'));

describe('orchestrator push: no registered device', () => {
  const push = async (userId = SPONSOR) =>
    new OutreachOrchestrator().sendPushNotification(userId, 'Thinking of you', {
      trigger: 'celebration',
    });

  it('returns null and writes no attempt and no context (nothing was tried)', async () => {
    expect(await push()).toBeNull();
    expect(fcm.results).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(storeOutreachContext).not.toHaveBeenCalled();
  });

  it.each([
    ['a phone in push_devices', () => withPhone()],
    [
      'a browser subscription',
      () => docs.set(`bogle_users/${SPONSOR}/push_subscriptions/data`, { subscriptions: [{}] }),
    ],
  ])('with %s, a failed delivery is still recorded as failed, as before', async (_n, arrange) => {
    arrange();
    fcm.results.mockResolvedValue([{ success: false }]);
    expect(await push()).toBeNull();
    expect(recordAttempt).toHaveBeenCalledWith(
      SPONSOR,
      expect.objectContaining({ channel: 'push', status: 'failed' })
    );
    expect(storeOutreachContext).not.toHaveBeenCalled();
  });

  it('a delivered push stores its context and records it delivered', async () => {
    withPhone();
    fcm.results.mockResolvedValue([{ success: true, messageId: 'm1' }]);
    expect(await push()).not.toBeNull();
    expect(recordAttempt.mock.calls[0]?.[1]).toMatchObject({ status: 'delivered' });
    expect(storeOutreachContext).toHaveBeenCalledTimes(1);
  });
});

describe('urgent family alert', () => {
  it('no device registered: no push attempt, no context, and the sponsor is texted', async () => {
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-1');
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(storeOutreachContext).not.toHaveBeenCalled();
    expect(texted()).toEqual([expect.objectContaining({ to: '+15555550100', body: ALERT })]);
  });

  it.each([
    ['every token refused', async () => [{ success: false }, { success: false }]],
    ['FCM throws', async () => Promise.reject(new Error('FCM 503'))],
  ])('%s: texts instead', async (_name, fail) => {
    withPhone();
    fcm.results.mockImplementation(fail);
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-2');
    expect(fcm.results).toHaveBeenCalledTimes(1);
    expect(texted()).toHaveLength(1);
  });

  it('the push threw (its attempt log failed to write): texts instead', async () => {
    withPhone();
    recordAttempt.mockRejectedValue(new Error('Firestore unavailable'));
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-7');
    expect(texted()).toHaveLength(1);
  });

  it('a delivered push sends no text', async () => {
    withPhone();
    fcm.results.mockResolvedValue([{ success: false }, { success: true, messageId: 'm1' }]);
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-3');
    expect(fcm.results).toHaveBeenCalledTimes(1);
    expect(twilio.create).not.toHaveBeenCalled();
  });

  it('texts a web account at its verified linked phone, not a stray phoneNumber field', async () => {
    docs.set('bogle_users/uid-web', {
      phoneNumber: '+15555550111',
      linkedIdentifiers: ['phone:+15555550122'],
    });
    await sendUrgentNotificationToSponsor('uid-web', ALERT, 'call-4');
    expect(texted().map((m) => m.to)).toEqual(['+15555550122']);
  });

  it('inside saved quiet hours it still goes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T03:00:00Z'));
    vi.stubEnv('QUIET_HOURS_UNIFIED', 'on');
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    docs.set(`bogle_users/${SPONSOR}`, {
      outreachPreferences: {
        quietHours: { enabled: true, start: '00:00', end: '23:59' },
        timezone: 'UTC',
      },
      messagingPrefs: { quietStart: '00:00', quietEnd: '23:59', zone: 'UTC' },
    });
    const { userQuietHours } = await import('../quiet-hours.js');
    expect((await userQuietHours(SPONSOR)).quiet).toBe(true); // the window really is on
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-5');
    expect(texted()).toHaveLength(1);
  });

  it('STOP still holds: a number that opted out of texts gets nothing', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    vi.stubEnv('LOG_HASH_SECRET', 'synthetic-test-secret');
    docs.set(`consent/${phoneHash('+15555550100')}`, { sms: { state: 'opted-out' } });
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-8');
    expect(twilio.create).not.toHaveBeenCalled();
    expect(alertErrors()).toHaveLength(1);
    // Control: the same number with no opt-out on record is texted.
    docs.clear();
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-8b');
    expect(texted()).toHaveLength(1);
  });

  it('an under-18 hold (MINOR_CARE) on the account sends nothing', async () => {
    const minor = 'phone:+15555550133';
    vi.stubEnv('MINOR_CARE', 'on');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
    docs.set(`bogle_users/${minor}`, {});
    docs.set(`minor_care_holds/${minor}`, { heldUntil: Date.now() + 60 * 60_000, v: 1 });
    await sendUrgentNotificationToSponsor(minor, ALERT, 'call-9');
    expect(twilio.create).not.toHaveBeenCalled();
    expect(alertErrors()).toHaveLength(1);
  });

  it.each([
    ['Twilio fails', SPONSOR, () => twilio.create.mockRejectedValue(new Error('Twilio 500'))],
    ['no phone on the account', 'uid-nophone', () => docs.set('bogle_users/uid-nophone', {})],
  ])('%s: an error log with ids only, and no throw', async (_name, user, arrange) => {
    arrange();
    await expect(sendUrgentNotificationToSponsor(user, ALERT, 'call-6')).resolves.toBeUndefined();
    const lines = alertErrors();
    expect(lines).toHaveLength(1); // one line saying why, nothing else from this path
    const line = lines[0];
    expect(line?.[0]).toMatchObject({
      userId: user,
      alertId: 'call-6',
      trigger: 'family_checkin_urgent',
    });
    const keys = Object.keys(line?.[0] as object);
    expect(keys.every((k) => ['userId', 'alertId', 'trigger', 'reason'].includes(k))).toBe(true);
    expect(JSON.stringify(line)).not.toContain('chest pain');
  });
});
