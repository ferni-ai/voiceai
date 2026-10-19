/**
 * Native push devices (push-devices.ts) over the shared in-memory Firestore:
 * one document per token, a token belongs to whoever registered it last, a
 * person keeps at most MAX_DEVICES_PER_USER, only the owner can unregister,
 * and account deletion removes every device of that person and nobody else's.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../tests/helpers/fake-firestore.js';
import {
  MAX_DEVICES_PER_USER,
  PUSH_DEVICES_COLLECTION,
  deviceDocId,
  eraseDevicesFor,
  listDevices,
  parseDeviceRegistration,
  registerDevice,
  unregisterDevice,
  type DeviceRegistration,
} from '../push-devices.js';

const state = newFakeFirestoreState();
const db = createFakeFirestore(state)() as unknown as Firestore;

const token = (n: number) => n.toString(16).padStart(64, '0');
const phone = (n: number): DeviceRegistration => ({
  platform: 'ios',
  token: token(n),
  bundleId: 'com.sethdford.ferni',
  environment: 'production',
  appVersion: '2.0.0 (12)',
});
const at = (minute: number) => new Date(Date.UTC(2026, 9, 18, 12, minute));

describe('parseDeviceRegistration', () => {
  const valid = { ...phone(1), token: token(1).toUpperCase() };

  it('accepts an iOS registration and lowercases the token', () => {
    const parsed = parseDeviceRegistration(valid);
    expect(parsed).toEqual({ ok: true, device: { ...phone(1) } });
  });

  it.each([
    ['web platform', { ...valid, platform: 'web' }],
    ['android platform', { ...valid, platform: 'android' }],
    ['no token', { ...valid, token: undefined }],
    ['a token that is not hex', { ...valid, token: 'z'.repeat(64) }],
    ['a short token', { ...valid, token: 'ab' }],
    ['no bundle id', { ...valid, bundleId: undefined }],
    ['a bundle id with a slash', { ...valid, bundleId: 'com/evil' }],
    ['an unknown environment', { ...valid, environment: 'staging' }],
    ['no app version', { ...valid, appVersion: undefined }],
    ['an app version with markup', { ...valid, appVersion: '<script>' }],
    ['no body', null],
  ])('rejects %s', (_label, body) => {
    expect(parseDeviceRegistration(body).ok).toBe(false);
  });
});

describe('push devices store', () => {
  beforeEach(() => resetFakeFirestore(state));

  it('registers a device under a hash of its token, never the token itself', async () => {
    expect(await listDevices('alice', db)).toEqual([]);

    await registerDevice('alice', phone(1), { db, now: at(0) });

    expect(await listDevices('alice', db)).toEqual([
      { ...phone(1), userId: 'alice', updatedAt: at(0).toISOString() },
    ]);
    const ids = [...state.docs.keys()];
    expect(ids).toEqual([`${PUSH_DEVICES_COLLECTION}/${deviceDocId(token(1))}`]);
    expect(ids[0]).not.toContain(token(1));
  });

  it('moves a token to whoever registers it next (same phone, new account)', async () => {
    await registerDevice('alice', phone(1), { db, now: at(0) });
    await registerDevice('bob', phone(1), { db, now: at(1) });

    expect(await listDevices('alice', db)).toEqual([]);
    expect((await listDevices('bob', db)).map((d) => d.token)).toEqual([token(1)]);
  });

  it(`keeps a person's ${MAX_DEVICES_PER_USER} newest devices`, async () => {
    for (let n = 0; n < MAX_DEVICES_PER_USER + 2; n++) {
      await registerDevice('alice', phone(n), { db, now: at(n) });
    }

    const kept = (await listDevices('alice', db)).map((d) => d.token);
    expect(kept).toHaveLength(MAX_DEVICES_PER_USER);
    expect(kept).not.toContain(token(0));
    expect(kept).not.toContain(token(1));
    expect(kept[0]).toBe(token(MAX_DEVICES_PER_USER + 1));
  });

  it("refuses to unregister someone else's token", async () => {
    await registerDevice('alice', phone(1), { db, now: at(0) });

    expect(await unregisterDevice('mallory', token(1), db)).toBe(false);
    expect(await listDevices('alice', db)).toHaveLength(1);

    expect(await unregisterDevice('alice', token(1).toUpperCase(), db)).toBe(true);
    expect(await listDevices('alice', db)).toEqual([]);
  });

  it("account deletion removes every device of that person and keeps others'", async () => {
    await registerDevice('alice', phone(1), { db, now: at(0) });
    await registerDevice('alice', phone(2), { db, now: at(1) });
    await registerDevice('bob', phone(3), { db, now: at(2) });

    await eraseDevicesFor('alice', db);

    expect(await listDevices('alice', db)).toEqual([]);
    expect((await listDevices('bob', db)).map((d) => d.token)).toEqual([token(3)]);
  });

  it('account deletion throws when Firestore fails, so the sweep reports it', async () => {
    const down = {
      collection: () => ({
        where: () => ({
          get: async () => {
            throw new Error('unavailable');
          },
        }),
      }),
    } as unknown as Firestore;
    await expect(eraseDevicesFor('alice', down)).rejects.toThrow('unavailable');
  });
});
