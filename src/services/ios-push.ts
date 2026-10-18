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
 * @module services/ios-push
 */
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

export function apnsAlert(payload: PushNotificationPayload): ApnsAlert {
  return {
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

    const alert = apnsAlert(payload);
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
