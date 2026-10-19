/**
 * Native push devices: the iPhone app's APNs device tokens.
 *
 * One Firestore document per token, push_devices/<sha256(token)>, holding the
 * user it belongs to. A token belongs to whoever registered it last (the same
 * phone signed in to a new account), so a token can never reach two people.
 * The collection is server-only (firestore.rules denies clients by default).
 *
 * Browser subscriptions stay in push_subscriptions (push-notifications.ts);
 * they need web-push keys, which a device token doesn't have.
 *
 * Never log a token: anyone holding one, with the app's APNs key, can push to
 * that phone.
 *
 * @module services/push-devices
 */
import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../utils/firestore-utils.js';

export const PUSH_DEVICES_COLLECTION = 'push_devices';
/** Phones and iPads one person may have registered; the oldest go first. */
export const MAX_DEVICES_PER_USER = 10;

export type ApnsEnvironment = 'sandbox' | 'production';

export interface PushDevice {
  userId: string;
  platform: 'ios';
  token: string;
  bundleId: string;
  environment: ApnsEnvironment;
  appVersion: string;
  /** ISO time of the last registration. */
  updatedAt: string;
}

export type DeviceRegistration = Omit<PushDevice, 'userId' | 'updatedAt'>;

// APNs tokens are 32 bytes today (64 hex digits); Apple says not to assume a fixed length.
const TOKEN = /^[0-9a-f]{64,200}$/;
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,154}$/;
const APP_VERSION = /^[0-9A-Za-z.+() -]{1,32}$/;

/** The body of POST /api/push/devices, or the reason it isn't one. */
export function parseDeviceRegistration(
  body: unknown
): { ok: true; device: DeviceRegistration } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.platform !== 'ios') return { ok: false, error: "platform must be 'ios'" };
  const token = typeof b.token === 'string' ? b.token.toLowerCase() : '';
  if (!TOKEN.test(token)) return { ok: false, error: 'token must be the APNs device token in hex' };
  if (typeof b.bundleId !== 'string' || !BUNDLE_ID.test(b.bundleId)) {
    return { ok: false, error: 'bundleId is required' };
  }
  if (b.environment !== 'sandbox' && b.environment !== 'production') {
    return { ok: false, error: "environment must be 'sandbox' or 'production'" };
  }
  if (typeof b.appVersion !== 'string' || !APP_VERSION.test(b.appVersion)) {
    return { ok: false, error: 'appVersion is required' };
  }
  return {
    ok: true,
    device: {
      platform: 'ios',
      token,
      bundleId: b.bundleId,
      environment: b.environment,
      appVersion: b.appVersion,
    },
  };
}

/** Document id for a token: tokens aren't logged or used as ids. */
export function deviceDocId(token: string): string {
  return createHash('sha256').update(token.toLowerCase()).digest('hex');
}

function database(db?: Firestore): Firestore {
  const resolved = db ?? getFirestoreDb();
  if (!resolved) throw new Error('Firestore unavailable');
  return resolved;
}

/** The user's device documents, newest registration first. */
async function deviceDocs(
  userId: string,
  db: Firestore
): Promise<Array<{ id: string; device: PushDevice }>> {
  const snap = await db.collection(PUSH_DEVICES_COLLECTION).where('userId', '==', userId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, device: doc.data() as PushDevice }))
    .sort((a, b) => b.device.updatedAt.localeCompare(a.device.updatedAt));
}

/** The user's devices, newest registration first. */
export async function listDevices(userId: string, db?: Firestore): Promise<PushDevice[]> {
  return (await deviceDocs(userId, database(db))).map((d) => d.device);
}

async function deleteDocs(db: Firestore, ids: string[]): Promise<void> {
  await Promise.all(ids.map(async (id) => db.collection(PUSH_DEVICES_COLLECTION).doc(id).delete()));
}

/**
 * Save the device for `userId` (taking the token from whoever had it), then
 * drop their oldest devices beyond MAX_DEVICES_PER_USER.
 */
export async function registerDevice(
  userId: string,
  device: DeviceRegistration,
  opts: { db?: Firestore; now?: Date } = {}
): Promise<void> {
  const db = database(opts.db);
  const record: PushDevice = {
    ...device,
    userId,
    updatedAt: (opts.now ?? new Date()).toISOString(),
  };
  await db.collection(PUSH_DEVICES_COLLECTION).doc(deviceDocId(device.token)).set(record);

  const extra = (await deviceDocs(userId, db)).slice(MAX_DEVICES_PER_USER);
  await deleteDocs(
    db,
    extra.map((d) => d.id)
  );
}

/** Forget the token, only if it is still `userId`'s. True when something was removed. */
export async function unregisterDevice(
  userId: string,
  token: string,
  db?: Firestore
): Promise<boolean> {
  const ref = database(db).collection(PUSH_DEVICES_COLLECTION).doc(deviceDocId(token));
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as PushDevice | undefined)?.userId !== userId) return false;
  await ref.delete();
  return true;
}

/** Account deletion: every device the user registered. Throws when it can't. */
export async function eraseDevicesFor(userId: string, db?: Firestore): Promise<void> {
  const resolved = database(db);
  await deleteDocs(
    resolved,
    (await deviceDocs(userId, resolved)).map((d) => d.id)
  );
}
