/**
 * A push for the iPhone app: the same notes, check-ins and reminders the push
 * service sends to a person's browser also go to their iPhone, over APNs.
 *
 * Only while IOS_PUSH is on for that person, read per person from their
 * cohorts and override (flagForUser), never from process.env: the web server
 * sends for many people at once. Off unless COHORT_FLAGS=on and a cohort or
 * override sets it. Needs the APNS_* secrets (apns-sender.ts); without them
 * nothing is sent.
 *
 * Devices come from push_devices (push-devices.ts); only those registered for
 * this app's bundle id. A token Apple says is gone (410, BadDeviceToken) is
 * forgotten.
 *
 * Every push carries `r`, an opaque tag of the person it is for (recipientTag).
 * The app gets its own tag when it registers (POST /api/push/devices answers
 * { recipientTag }) and drops a push whose `r` is a different person's: a
 * second line of defense if a sign-out's unregister never reached us. The tag
 * is an HMAC of the uid, so the uid itself is never in a push.
 *
 * @module services/ios-push
 */
import { createHmac } from 'node:crypto';
import { createLogger } from '../utils/safe-logger.js';
import { getApnsSender, type ApnsAlert, type ApnsSender } from './apns-sender.js';
import { flagForUser, type FlagLookupOptions } from './platform/cohort-flags.js';
import { listDevices, unregisterDevice, type PushDevice } from './push-devices.js';
import type { PushNotificationPayload } from './push-notifications.js';

const log = createLogger({ module: 'ios-push' });

export async function iosPushOn(userId: string, opts: FlagLookupOptions = {}): Promise<boolean> {
  return (await flagForUser(userId, 'IOS_PUSH', opts)) === 'on';
}

export interface IosPushDeps {
  isOn: (userId: string) => Promise<boolean>;
  sender: () => ApnsSender | null;
  devices: (userId: string) => Promise<PushDevice[]>;
  forget: (userId: string, token: string) => Promise<unknown>;
}

const defaultDeps: IosPushDeps = {
  isOn: async (userId) => iosPushOn(userId),
  sender: getApnsSender,
  devices: listDevices,
  forget: unregisterDevice,
};

const TAG_PURPOSE = 'ios-push-recipient-v1';
let warnedNoSecret = false;

/**
 * The person's push tag: HMAC-SHA256 of the uid under a key derived from
 * LOG_HASH_SECRET for this purpose only, base64url, 22 characters (132 bits).
 * Null, with one warning, without the secret (pushes then carry no tag).
 */
export function recipientTag(
  uid: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = env.LOG_HASH_SECRET;
  if (!secret) {
    if (!warnedNoSecret)
      log.warn('LOG_HASH_SECRET is not set, so iOS pushes carry no recipient tag');
    warnedNoSecret = true;
    return null;
  }
  const key = createHmac('sha256', secret).update(TAG_PURPOSE).digest();
  return createHmac('sha256', key).update(uid).digest('base64url').slice(0, 22);
}

export function apnsAlert(
  payload: PushNotificationPayload,
  recipient: string | null = null
): ApnsAlert {
  return {
    ...(recipient && { recipient }),
    title: payload.title,
    body: payload.body,
    threadId: payload.type,
    data: {
      ...payload.data,
      type: payload.type,
      ...(payload.personaId && { personaId: payload.personaId }),
    },
  };
}

/**
 * Send the notification to the person's iPhones. True only when Apple took it
 * for at least one device. Never throws, so the caller's other channels go on.
 */
export async function sendIosPush(
  userId: string,
  payload: PushNotificationPayload,
  deps: IosPushDeps = defaultDeps
): Promise<boolean> {
  try {
    if (!(await deps.isOn(userId))) return false;
    const sender = deps.sender();
    if (!sender) return false;
    const devices = (await deps.devices(userId)).filter((d) => d.bundleId === sender.topic);
    if (devices.length === 0) return false;

    const alert = apnsAlert(payload, recipientTag(userId));
    const results = await Promise.all(devices.map(async (d) => sender.send(d, alert)));
    const dead = devices.filter((_, i) => results[i]?.dead);
    await Promise.all(dead.map(async (d) => deps.forget(userId, d.token)));
    const delivered = results.filter((r) => r.ok).length;
    log.info(
      { userId, type: payload.type, devices: devices.length, delivered, removed: dead.length },
      'iOS push'
    );
    return delivered > 0;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'iOS push failed');
    return false;
  }
}
