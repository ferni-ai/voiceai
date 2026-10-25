/**
 * The urgent family check-in alert: push first, a text when the push isn't
 * delivered. The real chain runs (sendUrgentNotificationToSponsor → sendUrgentAlert
 * → orchestrator.sendPushNotification → deliverAndRecord → deliverOutreach →
 * userReach → sendSMS). Faked: the two transports (FCM's per-token results and
 * Twilio's messages.create) and storage (Firestore docs, the attempt log). All
 * ids and numbers are synthetic.
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

const docs = new Map<string, Record<string, unknown>>();
vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return { exists: !!data, data: () => data };
        },
      }),
    }),
  }),
}));
const recordAttempt = vi.hoisted(() => vi.fn());
vi.mock('../outreach-history.js', () => ({ outreachHistory: { recordAttempt } }));
vi.mock('../conversation-context-bridge.js', () => ({ storeOutreachContext: async () => {} }));
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
const { sendUrgentNotificationToSponsor } = await import('../../family/family-checkin-caller.js');

const SPONSOR = 'phone:+15555550100';
const ALERT = 'Your dad mentioned chest pain on the check-in call.';

beforeEach(() => {
  docs.clear();
  docs.set(`bogle_users/${SPONSOR}`, {});
  errors.length = 0;
  recordAttempt.mockReset().mockResolvedValue('a1');
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

describe('urgent family alert', () => {
  it('no device token: the push is not delivered, so the sponsor is texted', async () => {
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-1');
    expect(fcm.results).toHaveBeenCalledTimes(1);
    expect(texted()).toEqual([expect.objectContaining({ to: '+15555550100', body: ALERT })]);
  });

  it.each([
    ['every token refused', async () => [{ success: false }, { success: false }]],
    ['FCM throws', async () => Promise.reject(new Error('FCM 503'))],
  ])('%s: texts instead', async (_name, fail) => {
    fcm.results.mockImplementation(fail);
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-2');
    expect(texted()).toHaveLength(1);
  });

  it('the push threw (its attempt log failed to write): texts instead', async () => {
    recordAttempt.mockRejectedValue(new Error('Firestore unavailable'));
    await sendUrgentNotificationToSponsor(SPONSOR, ALERT, 'call-7');
    expect(texted()).toHaveLength(1);
  });

  it('a delivered push sends no text', async () => {
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

  it.each([
    ['Twilio fails', SPONSOR, () => twilio.create.mockRejectedValue(new Error('Twilio 500'))],
    ['no phone on the account', 'uid-nophone', () => docs.set('bogle_users/uid-nophone', {})],
  ])('%s: an error log with ids only, and no throw', async (_name, user, arrange) => {
    arrange();
    await expect(sendUrgentNotificationToSponsor(user, ALERT, 'call-6')).resolves.toBeUndefined();
    const lines = errors.filter((a) => String(a[1]).startsWith('Urgent alert'));
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
