/**
 * Native Push (Capacitor)
 *
 * The device's APNs/FCM token, registered with the server like a web push
 * subscription: POST /api/push/subscribe with the Bearer token, so the server
 * records the VERIFIED caller as the token's one owner (registerSubscription).
 *
 * The token arrives asynchronously through the 'registration' listener, so
 * subscribe() registers and waits for it, then posts it and returns the
 * subscription (push-preference records the owner from that, as on web).
 * unsubscribe() removes it on the server while the caller is still signed in,
 * then ALWAYS unregisters the device, so nothing addressed to the previous
 * account can arrive. The listeners stay attached for whoever signs in next.
 */

import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NativePush');

/** Last token this device registered, so sign-out can remove it after an app restart. */
const TOKEN_KEY = 'ferni:native-push-token';
const TOKEN_TIMEOUT_MS = 10_000;

export interface NativeNotification {
  id: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface NativePushHandlers {
  onReceived(notification: NativeNotification): void;
  onAction(notification: NativeNotification): void;
}

export interface NativeSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform: 'ios' | 'android';
}

type Permission = 'granted' | 'denied' | 'default';
type TokenWaiter = { resolve: (token: string) => void; reject: (error: Error) => void };

function rememberToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the in-memory token still covers this session
  }
}

function recalledToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class NativePush {
  private token: string | null = null;
  private waiters: TokenWaiter[] = [];
  private permission: Permission = 'default';

  /** Attach the listeners once and ask for permission. Registering waits for subscribe(). */
  async initialize(handlers: NativePushHandlers): Promise<void> {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.addListener('registration', (token: { value: string }) => {
      this.token = token.value;
      for (const waiter of this.waiters.splice(0)) waiter.resolve(token.value);
    });
    await PushNotifications.addListener('registrationError', (error: { error: string }) => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(error.error));
    });
    await PushNotifications.addListener('pushNotificationReceived', handlers.onReceived);
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) =>
      handlers.onAction(action.notification)
    );
    await this.requestPermission();
  }

  getPermission(): Permission {
    return this.permission;
  }

  async requestPermission(): Promise<Permission> {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.requestPermissions();
      this.permission = result.receive === 'granted' ? 'granted' : 'denied';
    } catch (error) {
      log.warn('Native push permission request failed', error);
      this.permission = 'denied';
    }
    return this.permission;
  }

  /** Register the device and record its token on the server for the signed-in caller. */
  async subscribe(platform: NativeSubscription['platform']): Promise<NativeSubscription> {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const next = this.nextToken();
    await PushNotifications.register();
    const subscription: NativeSubscription = {
      endpoint: await next,
      keys: { p256dh: '', auth: '' }, // native tokens have no web-push keys
      platform,
    };
    const response = await apiPost('/api/push/subscribe', subscription);
    if (!response.ok) throw new Error(`Push subscribe failed: ${response.status}`);
    rememberToken(subscription.endpoint);
    return subscription;
  }

  /** Remove the token on the server (as the current caller), then kill it on the device. */
  async unsubscribe(): Promise<boolean> {
    const token = this.token ?? recalledToken();
    let removed = true;
    try {
      if (token) {
        const response = await apiPost('/api/push/unsubscribe', { endpoint: token });
        removed = response.ok;
        if (!response.ok) log.warn('Server push unsubscribe failed', response.status);
      }
    } finally {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.unregister();
      } catch (error) {
        log.error('Native push unregister failed', error);
        removed = false;
      }
      this.token = null;
      rememberToken(null);
    }
    return removed;
  }

  private nextToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: TokenWaiter = {
        resolve: (token) => {
          clearTimeout(timer);
          resolve(token);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('No push token from the device'));
      }, TOKEN_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }
}
