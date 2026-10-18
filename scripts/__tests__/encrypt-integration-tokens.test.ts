import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../src/tests/helpers/merge-fake-firestore.js';
import { openTokens } from '../../src/utils/token-at-rest.js';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { runEncryptIntegrationTokens } = await import('../migrations/encrypt-integration-tokens.js');

const ACCESS = 'fixture-access-token-0001';
const REFRESH = 'fixture-refresh-token-0002';
const state = newMergeFakeState();
const db = createMergeFakeFirestore(state) as unknown as Firestore;

function seed() {
  state.docs.set('spotify_tokens/global', {
    access_token: ACCESS,
    refresh_token: REFRESH,
    expires_at: 1,
    _updatedAt: 'x',
    _userId: 'global',
  });
  state.docs.set('oura_tokens/u1', {
    access_token: ACCESS,
    refresh_token: REFRESH,
    expires_at: 1,
    updatedAt: 'x',
  });
  state.docs.set('apple_calendar_tokens/u2', {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: 1,
  });
  state.docs.set('bogle_users/u3/plaid_tokens/data', {
    access_token: ACCESS,
    item_id: 'i',
    _userId: 'u3',
  });
  state.docs.set('bogle_users/u4', {
    id: 'u4',
    name: 'n',
    linkedInTokens: {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 'x',
      scope: [],
      lastSync: 'x',
    },
  });
  state.docs.set('bogle_users/u5', {
    id: 'u5',
    name: 'n',
    biometricTokens: { platform: 'oura', accessToken: ACCESS, refreshToken: REFRESH },
  });
  state.docs.set('bogle_users/u6', { id: 'u6', name: 'no tokens' });
}

describe('encrypt-integration-tokens migration', () => {
  const saved = process.env.OAUTH_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = saved;
  });
  beforeEach(() => {
    state.docs.clear();
    state.writes.length = 0;
    state.failWrites.clear();
    seed();
  });

  it('a dry run counts plaintext per collection and writes nothing', async () => {
    const before = structuredClone([...state.docs]);
    const counts = await runEncryptIntegrationTokens(db, false);
    expect(state.writes).toHaveLength(0);
    expect([...state.docs]).toEqual(before);
    expect(counts.spotify_tokens).toMatchObject({ scanned: 1, plaintext: 1, written: 0 });
    expect(counts.plaid_tokens).toMatchObject({ plaintext: 1, written: 0 });
    expect(counts['bogle_users.linkedInTokens']).toMatchObject({ scanned: 1, plaintext: 1 });
    expect(JSON.stringify(counts)).not.toContain('u4'); // counts only, no ids
  });

  it('--apply seals every plaintext record in place, readable by the stores', async () => {
    const counts = await runEncryptIntegrationTokens(db, true);
    expect(JSON.stringify([...state.docs])).not.toContain(ACCESS);
    expect(JSON.stringify([...state.docs])).not.toContain(REFRESH);

    const spotify = state.docs.get('spotify_tokens/global')!;
    expect(Object.keys(spotify).sort()).toEqual(['_updatedAt', '_userId', 'encrypted']);
    expect(openTokens(spotify)).toEqual({
      access_token: ACCESS,
      refresh_token: REFRESH,
      expires_at: 1,
    });
    expect(
      openTokens<{ access_token: string }>(state.docs.get('bogle_users/u3/plaid_tokens/data'))
        ?.access_token
    ).toBe(ACCESS);
    const li = state.docs.get('bogle_users/u4')!;
    expect(Object.keys(li.linkedInTokens as object)).toEqual(['encrypted']);
    expect(li.name).toBe('n');
    expect(
      openTokens<{ refreshToken: string }>(state.docs.get('bogle_users/u5')!.biometricTokens)
        ?.refreshToken
    ).toBe(REFRESH);
    expect(state.docs.get('bogle_users/u6')).toEqual({ id: 'u6', name: 'no tokens' });
    expect(Object.values(counts).reduce((n, c) => n + c.written, 0)).toBe(6);
  });

  it('is idempotent: a second --apply writes nothing and counts the records as sealed', async () => {
    await runEncryptIntegrationTokens(db, true);
    const after = structuredClone([...state.docs]);
    state.writes.length = 0;
    const counts = await runEncryptIntegrationTokens(db, true);
    expect(state.writes).toHaveLength(0);
    expect([...state.docs]).toEqual(after);
    expect(counts.oura_tokens).toMatchObject({ plaintext: 0, sealed: 1, written: 0 });
  });

  it('a per-doc failure keeps that original and the run continues', async () => {
    state.failWrites.add('oura_tokens/u1');
    const original = structuredClone(state.docs.get('oura_tokens/u1'));
    const counts = await runEncryptIntegrationTokens(db, true);
    expect(counts.oura_tokens).toMatchObject({ plaintext: 1, written: 0, failed: 1 });
    expect(state.docs.get('oura_tokens/u1')).toEqual(original);
    expect(counts.apple_calendar_tokens).toMatchObject({ written: 1 });
  });

  it('--apply refuses to run without an encryption key', async () => {
    delete process.env.OAUTH_ENCRYPTION_KEY;
    const savedHash = process.env.LOG_HASH_SECRET;
    delete process.env.LOG_HASH_SECRET;
    try {
      await expect(runEncryptIntegrationTokens(db, true)).rejects.toThrow(/encryption key/);
      expect(state.writes).toHaveLength(0);
    } finally {
      process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
      if (savedHash !== undefined) process.env.LOG_HASH_SECRET = savedHash;
    }
  });
});
