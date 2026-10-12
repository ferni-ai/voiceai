/**
 * identifyFromMetadata acts on account-naming claims only from a signed dispatch.
 *
 * The web /token route copies `device_id` from its query string into the
 * dispatch, and the agent used to auto-migrate `device:<that id>` into the
 * caller's fresh account. `user_id` and `auth_token` were trusted outright.
 * A signed dispatch still identifies and migrates; the verified `firebase_uid`
 * /token writes keeps working unsigned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { createUserProfile } from '../../../types/user-profile.js';
import { signDispatch } from '../../outreach/on-behalf-dispatch.js';

// One store for the file: user-migration caches the store it gets first.
const store = new InMemoryStore();
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../identity-linking.js', () => ({ autoLinkOnAuth: vi.fn(async () => undefined) }));

const { identifyFromMetadata, setGlobalStore } = await import('../user-identification.js');

const SECRET = 'livekit-test-secret';
const VICTIM = 'victim-uid-0000000000000000';
let seq = 0;
const fresh = (p: string) => `${p}-${Date.now()}-${++seq}`.padEnd(28, '0');

async function seedDevice(deviceId: string): Promise<void> {
  await store.saveProfile({
    ...createUserProfile(`device:${deviceId}`, 'Victim on her phone'),
    totalConversations: 12,
  });
}

describe('identifyFromMetadata trusts identity claims only from a signed dispatch', () => {
  beforeEach(async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
    setGlobalStore(store);
    await store.saveProfile({ ...createUserProfile(VICTIM, 'Victim'), totalConversations: 30 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('ignores a forged user_id in unsigned metadata', async () => {
    const result = await identifyFromMetadata({ user_id: VICTIM, session_id: 'anon:x' });
    expect(result.userId).not.toBe(VICTIM);
    expect(result.profile).toBeNull();
  });

  it('identifies the user_id named by a signed dispatch', async () => {
    const result = await identifyFromMetadata(signDispatch({ user_id: VICTIM }, SECRET));
    expect(result.userId).toBe(VICTIM);
    expect(result.profile?.name).toBe('Victim');
  });

  it('ignores a forged auth_token in unsigned metadata', async () => {
    const result = await identifyFromMetadata({ auth_token: 'stolen', session_id: 'anon:y' });
    expect(result.source.type).toBe('anonymous');
  });

  it("never migrates someone else's device from an unsigned device_id", async () => {
    const deviceId = fresh('device_victim');
    await seedDevice(deviceId);
    const attacker = fresh('attacker');
    const result = await identifyFromMetadata({ firebase_uid: attacker, device_id: deviceId });
    expect(result.userId).toBe(attacker);
    expect(result.profile).toBeNull();
    expect(await store.getProfile(attacker)).toBeNull();
    const device = await store.getProfile(`device:${deviceId}`);
    expect(device?.customData?.migratedTo).toBeUndefined();
  });

  it('still migrates the device named by a signed dispatch', async () => {
    const deviceId = fresh('device_owner');
    await seedDevice(deviceId);
    const owner = fresh('owner');
    const result = await identifyFromMetadata(
      signDispatch({ firebase_uid: owner, device_id: deviceId }, SECRET)
    );
    expect(result.userId).toBe(owner);
    expect(result.profile?.name).toBe('Victim on her phone');
  });

  it('keeps identifying web callers by the verified firebase_uid /token writes', async () => {
    const result = await identifyFromMetadata({ firebase_uid: VICTIM, source: 'web' });
    expect(result.userId).toBe(VICTIM);
    expect(result.source.type).toBe('firebase');
  });
});
