/**
 * Enabling notifications in settings must actually subscribe this browser on
 * the server, and say so when the server didn't store it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  toastError: vi.fn(),
  pushSubscribe: vi.fn(),
  getSubscription: vi.fn(),
  browserUnsubscribe: vi.fn(),
  signOut: vi.fn(),
  calls: [] as string[],
  uid: 'alice' as string | null,
}));

vi.mock('../../src/utils/platform.js', () => ({
  platform: 'web',
  isNative: () => false,
  isIOS: () => false,
  isAndroid: () => false,
  isWeb: () => true,
}));
vi.mock('../../src/utils/api.js', () => ({ apiPost: mocks.apiPost, apiGet: mocks.apiGet }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: mocks.toastError } }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  signOut: mocks.signOut,
  getFirebaseUid: () => mocks.uid,
  onAuthStateChange: vi.fn(),
}));

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  mocks.uid = 'alice';
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn(() => Promise.resolve('granted')),
  });
  vi.stubGlobal('PushManager', {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(async () => ({
        pushManager: { subscribe: mocks.pushSubscribe, getSubscription: mocks.getSubscription },
      })),
      getRegistration: vi.fn(async () => ({
        pushManager: { subscribe: mocks.pushSubscribe, getSubscription: mocks.getSubscription },
      })),
      addEventListener: vi.fn(),
    },
  });
  mocks.pushSubscribe.mockResolvedValue({
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
  });
  mocks.getSubscription.mockResolvedValue({
    endpoint: ENDPOINT,
    unsubscribe: mocks.browserUnsubscribe,
  });
  mocks.apiGet.mockResolvedValue({ ok: true, data: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa' } });
});

async function enable(enabled: boolean): Promise<void> {
  const { initPushNotifications } =
    await import('../../src/services/push-notifications.service.js');
  await initPushNotifications();
  const { applyPushPreference } = await import('../../src/services/push-preference.js');
  await applyPushPreference(enabled);
}

describe('applyPushPreference', () => {
  it('turning notifications on registers the subscription with the server', async () => {
    mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

    await enable(true);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/subscribe', {
      endpoint: ENDPOINT,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      platform: 'web',
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('tells the user when the server did not store the subscription', async () => {
    mocks.apiPost.mockResolvedValue({ ok: false, status: 401 });

    await enable(true);

    expect(mocks.toastError).toHaveBeenCalledWith("Notifications aren't available right now.");
  });

  it('turning notifications off removes the server subscription too', async () => {
    mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

    await enable(false);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/unsubscribe', { endpoint: ENDPOINT });
    expect(mocks.browserUnsubscribe).toHaveBeenCalled();
  });

  it('signing out drops the push subscription first, while the token still works', async () => {
    mocks.calls.length = 0;
    mocks.apiPost.mockImplementation(async (path: string) => {
      mocks.calls.push(path);
      return { ok: true, data: { success: true } };
    });
    mocks.signOut.mockImplementation(async () => {
      mocks.calls.push('signOut');
    });
    const { initPushNotifications } =
      await import('../../src/services/push-notifications.service.js');
    await initPushNotifications();
    const { signOutReleasingPush } = await import('../../src/services/push-preference.js');

    await signOutReleasingPush();

    expect(mocks.calls).toEqual(['/api/push/unsubscribe', 'signOut']);
    expect(mocks.browserUnsubscribe).toHaveBeenCalled();
  });

  it('records which account the browser subscription belongs to', async () => {
    mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

    await enable(true);

    expect(localStorage.getItem('ferni:push-owner')).toBe('alice');
  });

  describe('a different account signs in on this browser', () => {
    async function signInAs(uid: string): Promise<void> {
      const { initPushNotifications } =
        await import('../../src/services/push-notifications.service.js');
      await initPushNotifications();
      const { syncPushOwner } = await import('../../src/services/push-preference.js');
      await syncPushOwner(uid);
    }

    it('moves the subscription to the new account when they have notifications on', async () => {
      localStorage.setItem('ferni:push-owner', 'alice');
      mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

      await signInAs('bob');

      // Re-posting the same browser subscription (same keys) under bob's session.
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/subscribe', {
        endpoint: ENDPOINT,
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        platform: 'web',
      });
      expect(mocks.browserUnsubscribe).not.toHaveBeenCalled();
      expect(localStorage.getItem('ferni:push-owner')).toBe('bob');
    });

    it("kills the endpoint when the new account doesn't want notifications", async () => {
      localStorage.setItem('ferni:push-owner', 'alice');
      localStorage.setItem('ferni:notification-prefs', JSON.stringify({ enabled: false }));
      mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

      await signInAs('bob');

      expect(mocks.apiPost).not.toHaveBeenCalledWith('/api/push/subscribe', expect.anything());
      expect(mocks.browserUnsubscribe).toHaveBeenCalled();
      expect(localStorage.getItem('ferni:push-owner')).toBeNull();
    });

    it('kills the endpoint when the server refuses the move', async () => {
      localStorage.setItem('ferni:push-owner', 'alice');
      mocks.apiPost.mockImplementation(async (path: string) =>
        path === '/api/push/subscribe' ? { ok: false, status: 403 } : { ok: true, data: {} }
      );

      await signInAs('bob');

      expect(mocks.browserUnsubscribe).toHaveBeenCalled();
      expect(localStorage.getItem('ferni:push-owner')).toBeNull();
    });

    it('does nothing when the same account signs back in', async () => {
      localStorage.setItem('ferni:push-owner', 'alice');

      await signInAs('alice');

      expect(mocks.apiPost).not.toHaveBeenCalled();
      expect(mocks.browserUnsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('fails closed', () => {
    async function signInAs(uid: string): Promise<void> {
      const { initPushNotifications } =
        await import('../../src/services/push-notifications.service.js');
      await initPushNotifications();
      const { syncPushOwner } = await import('../../src/services/push-preference.js');
      await syncPushOwner(uid);
    }

    it('an unrecorded subscription is moved to whoever signs in, not inherited', async () => {
      // e.g. subscribed before ownership tracking shipped, or storage was blocked
      mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

      await signInAs('bob');

      expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/subscribe', expect.anything());
      expect(localStorage.getItem('ferni:push-owner')).toBe('bob');
    });

    it("an unrecorded subscription is killed when the new account doesn't want notifications", async () => {
      localStorage.setItem('ferni:notification-prefs', JSON.stringify({ enabled: false }));
      mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });

      await signInAs('bob');

      expect(mocks.browserUnsubscribe).toHaveBeenCalled();
    });

    it('a sign-out whose server unsubscribe fails still kills the browser subscription', async () => {
      mocks.apiPost.mockRejectedValue(new Error('network down'));
      const { initPushNotifications } =
        await import('../../src/services/push-notifications.service.js');
      await initPushNotifications();
      const { signOutReleasingPush } = await import('../../src/services/push-preference.js');

      await signOutReleasingPush();

      expect(mocks.browserUnsubscribe).toHaveBeenCalled();
      expect(mocks.signOut).toHaveBeenCalled();
    });

    it('a move that throws falls through to unsubscribing', async () => {
      localStorage.setItem('ferni:push-owner', 'alice');
      mocks.apiPost.mockResolvedValue({ ok: true, data: { success: true } });
      const { getPushNotificationsService } =
        await import('../../src/services/push-notifications.service.js');
      vi.spyOn(getPushNotificationsService(), 'subscribe').mockRejectedValue(new Error('boom'));

      await signInAs('bob');

      expect(mocks.browserUnsubscribe).toHaveBeenCalled();
      expect(localStorage.getItem('ferni:push-owner')).toBeNull();
    });
  });
});
