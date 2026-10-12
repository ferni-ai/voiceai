/**
 * Optional web-push loader.
 *
 * `web-push` is an optional dependency: when it isn't installed, web push
 * notifications can't be delivered and callers must say so rather than pretend.
 */

import { getLogger } from '../utils/safe-logger.js';
import { isAllowedWebPushEndpoint } from './web-push-endpoint.js';

// Web-push module interface (optional dependency)
export interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string
  ) => Promise<unknown>;
}

let webpush: WebPushModule | null = null;
let webpushLoadAttempted = false;

export async function loadWebPush(): Promise<WebPushModule | null> {
  if (webpushLoadAttempted) return webpush;
  webpushLoadAttempted = true;

  try {
    // @ts-expect-error - web-push is an optional dependency
    const mod = await import('web-push');
    const loaded: WebPushModule = mod.default || mod;
    // Every web push goes through here, including subscriptions stored before
    // the subscribe route validated endpoints.
    webpush = {
      setVapidDetails: (...args) => loaded.setVapidDetails(...args),
      sendNotification: (subscription, payload) => {
        if (!isAllowedWebPushEndpoint(subscription.endpoint)) {
          return Promise.reject(new Error('Refusing web push to a non-push-service endpoint'));
        }
        return loaded.sendNotification(subscription, payload);
      },
    };
    getLogger().info('web-push module loaded successfully');
    return webpush;
  } catch {
    getLogger().warn('web-push module not available - push notifications disabled');
    return null;
  }
}

/**
 * True only when a web push could actually be delivered: the web-push module is
 * installed and both VAPID keys are configured.
 */
export async function isWebPushDeliverable(): Promise<boolean> {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && (await loadWebPush())
  );
}
