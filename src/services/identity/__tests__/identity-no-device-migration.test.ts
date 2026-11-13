/**
 * identifyFromMetadata resolves the caller and never migrates device data.
 *
 * Every priority path resolves the same id it always did; a firebase_uid with
 * a device_id beside it, signed or not, gets a fresh account rather than the
 * device profile's data. The real migration modules are loaded and spied:
 * linkIdentity and linkVerifiedAnonymousIdentity are the only ways into the
 * linking module's copy (linkSource), so neither may run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { createUserProfile } from '../../../types/user-profile.js';
import { signDispatch } from '../../outreach/on-behalf-dispatch.js';

const store = new InMemoryStore();
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../../user-migration.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../user-migration.js')>();
  return { ...real, migrateUserData: vi.fn(real.migrateUserData) };
});
vi.mock('../identity-linking.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../identity-linking.js')>();
  return {
    ...real,
    linkIdentity: vi.fn(real.linkIdentity),
    linkVerifiedAnonymousIdentity: vi.fn(real.linkVerifiedAnonymousIdentity),
  };
});

const { identifyFromMetadata, setGlobalStore } = await import('../user-identification.js');
const migration = await import('../../user-migration.js');
const linking = await import('../identity-linking.js');

const SIGNING_KEY = 'test-signing-key';
const UID = 'uid-sam-rivera'.padEnd(28, '0');
const DEVICE = 'device_test_001';
const sign = (m: Record<string, unknown>) => signDispatch(m, SIGNING_KEY);

type Row = [
  label: string,
  metadata: () => Record<string, unknown>,
  expected: { userId: string; source: string; profileName: string | null },
  trustUnsigned?: 'off',
];

const rows: Row[] = [
  [
    'firebase_uid from the dispatch, with a device_id beside it',
    () => ({ firebase_uid: UID, device_id: DEVICE }),
    { userId: UID, source: 'firebase', profileName: null },
  ],
  [
    'firebase_uid on a signed dispatch, with a device_id beside it',
    () => sign({ firebase_uid: UID, device_id: DEVICE }),
    { userId: UID, source: 'firebase', profileName: null },
  ],
  [
    'signed user_id',
    () => sign({ user_id: `device:${DEVICE}` }),
    { userId: `device:${DEVICE}`, source: 'web_auth', profileName: 'Sam Rivera' },
  ],
  [
    'demo device id (device:demo_)',
    () => ({ device_id: 'demo_test_001' }),
    { userId: 'device:demo_test_001', source: 'device', profileName: null },
  ],
  [
    'unsigned device_id, TRUST_UNSIGNED_DEVICE_ID on',
    () => ({ device_id: DEVICE }),
    { userId: `device:${DEVICE}`, source: 'device', profileName: 'Sam Rivera' },
  ],
  [
    'unsigned device_id, TRUST_UNSIGNED_DEVICE_ID off',
    () => ({ device_id: DEVICE, session_id: 'anon:test-session' }),
    { userId: 'anon:test-session', source: 'anonymous', profileName: null },
    'off',
  ],
  [
    'signed device_id, TRUST_UNSIGNED_DEVICE_ID off',
    () => sign({ device_id: DEVICE }),
    { userId: `device:${DEVICE}`, source: 'device', profileName: 'Sam Rivera' },
    'off',
  ],
  [
    'device_id with an anon session, signed',
    () => sign({ device_id: DEVICE, session_id: 'anon:test-session-3' }),
    { userId: `device:${DEVICE}`, source: 'device', profileName: 'Sam Rivera' },
  ],
  [
    'anonymous session',
    () => ({ session_id: 'anon:test-session-2' }),
    { userId: 'anon:test-session-2', source: 'anonymous', profileName: null },
  ],
];

describe('identifyFromMetadata never migrates a device profile', () => {
  beforeEach(async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', SIGNING_KEY);
    setGlobalStore(store);
    await store.deleteProfile(UID);
    await store.saveProfile({
      ...createUserProfile(`device:${DEVICE}`, 'Sam Rivera'),
      totalConversations: 4,
    });
    vi.mocked(migration.migrateUserData).mockClear();
    vi.mocked(linking.linkIdentity).mockClear();
    vi.mocked(linking.linkVerifiedAnonymousIdentity).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(rows)('%s', async (_label, metadata, expected, trustUnsigned) => {
    if (trustUnsigned) vi.stubEnv('TRUST_UNSIGNED_DEVICE_ID', trustUnsigned);
    const result = await identifyFromMetadata(metadata());
    expect(result.userId).toBe(expected.userId);
    expect(result.source.type).toBe(expected.source);
    expect(migration.migrateUserData).not.toHaveBeenCalled();
    expect(linking.linkIdentity).not.toHaveBeenCalled();
    expect(linking.linkVerifiedAnonymousIdentity).not.toHaveBeenCalled();
    expect(result.profile?.name ?? null).toBe(expected.profileName);
    expect(await store.getProfile(UID)).toBeNull();
    expect((await store.getProfile(`device:${DEVICE}`))?.customData?.migratedTo).toBeUndefined();
  });
});
