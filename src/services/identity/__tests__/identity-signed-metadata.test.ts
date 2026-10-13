/**
 * identifyFromMetadata acts on account-naming claims only from a signed dispatch.
 *
 * The web /token route copies `device_id` from its query string into the
 * dispatch, and the agent used to auto-migrate `device:<that id>` into the
 * caller's fresh account. `user_id` and `auth_token` were trusted outright.
 * A signed dispatch still identifies and migrates; the verified `firebase_uid`
 * /token writes keeps working unsigned.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { createUserProfile } from '../../../types/user-profile.js';
import { signDispatch, verifyOnBehalfDispatch } from '../../outreach/on-behalf-dispatch.js';
import { SIGNED_IDENTITY_MAX_AGE_MS } from '../signed-dispatch-identity.js';

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

describe('a signed identity claim is refused when stale, forged or unverifiable', () => {
  beforeEach(async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
    setGlobalStore(store);
    await store.saveProfile({ ...createUserProfile(VICTIM, 'Victim'), totalConversations: 30 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses a signed user_id older than the replay window', async () => {
    const signedAt = Date.now() - SIGNED_IDENTITY_MAX_AGE_MS - 1_000;
    const result = await identifyFromMetadata(signDispatch({ user_id: VICTIM }, SECRET, signedAt));
    expect(result.userId).not.toBe(VICTIM);
    expect(result.source.type).toBe('anonymous');
  });

  it('accepts a signed user_id inside the replay window', async () => {
    const signedAt = Date.now() - SIGNED_IDENTITY_MAX_AGE_MS + 60_000;
    const result = await identifyFromMetadata(signDispatch({ user_id: VICTIM }, SECRET, signedAt));
    expect(result.userId).toBe(VICTIM);
  });

  it('refuses a signed user_id stamped well in the future', async () => {
    const signedAt = Date.now() + 5 * 60_000;
    const result = await identifyFromMetadata(signDispatch({ user_id: VICTIM }, SECRET, signedAt));
    expect(result.source.type).toBe('anonymous');
  });

  it('refuses a validly signed user_id that carries no signedAt', async () => {
    // Signed the way dispatches were before signedAt existed.
    const payload = { user_id: VICTIM };
    const requesterSignature = createHmac('sha256', SECRET)
      .update(JSON.stringify(payload))
      .digest('base64url');
    const metadata = { ...payload, requesterSignature };
    expect(verifyOnBehalfDispatch(JSON.stringify(metadata), SECRET)).toBe(true);
    const result = await identifyFromMetadata(metadata);
    expect(result.source.type).toBe('anonymous');
  });

  it('refuses a user_id signed with someone else\'s key', async () => {
    const result = await identifyFromMetadata(signDispatch({ user_id: VICTIM }, 'not-our-secret'));
    expect(result.source.type).toBe('anonymous');
  });

  it('refuses a signed payload whose user_id was changed after signing', async () => {
    const tampered = { ...signDispatch({ user_id: 'attacker-uid' }, SECRET), user_id: VICTIM };
    const result = await identifyFromMetadata(tampered);
    expect(result.userId).not.toBe(VICTIM);
    expect(result.source.type).toBe('anonymous');
  });

  it('fails closed when LIVEKIT_API_SECRET is unset', async () => {
    const metadata = signDispatch({ user_id: VICTIM }, SECRET);
    vi.stubEnv('LIVEKIT_API_SECRET', undefined);
    const result = await identifyFromMetadata(metadata);
    expect(result.source.type).toBe('anonymous');
  });
});

describe('TRUST_UNSIGNED_DEVICE_ID gates the anonymous device fallback', () => {
  beforeEach(() => {
    vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
    setGlobalStore(store);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('on by default: loads the device profile an unsigned device_id names', async () => {
    const deviceId = fresh('device_default');
    await seedDevice(deviceId);
    const result = await identifyFromMetadata({ device_id: deviceId });
    expect(result.userId).toBe(`device:${deviceId}`);
    expect(result.profile?.name).toBe('Victim on her phone');
  });

  it('off: ignores an unsigned device_id', async () => {
    vi.stubEnv('TRUST_UNSIGNED_DEVICE_ID', 'off');
    const deviceId = fresh('device_off');
    await seedDevice(deviceId);
    const result = await identifyFromMetadata({ device_id: deviceId, session_id: 'anon:dev' });
    expect(result.userId).toBe('anon:dev');
    expect(result.source.type).toBe('anonymous');
    expect(result.profile).toBeNull();
  });

  it('off: still loads the device profile a signed dispatch names', async () => {
    vi.stubEnv('TRUST_UNSIGNED_DEVICE_ID', 'off');
    const deviceId = fresh('device_signed');
    await seedDevice(deviceId);
    const result = await identifyFromMetadata(signDispatch({ device_id: deviceId }, SECRET));
    expect(result.userId).toBe(`device:${deviceId}`);
    expect(result.source.type).toBe('device');
  });
});
