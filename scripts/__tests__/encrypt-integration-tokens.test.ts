import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../src/tests/helpers/merge-fake-firestore.js';
import { openTokens, sealTokens, tokenKeyId } from '../../src/utils/token-at-rest.js';
import { isEncrypted } from '../../src/utils/token-encryption.js';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { runEncryptIntegrationTokens, parseExpectKid } =
  await import('../migrations/encrypt-integration-tokens.js');

const ACCESS = 'fixture-access-token-0001';
const REFRESH = 'fixture-refresh-token-0002';
const KEY = 'fixture-encryption-key';
const state = newMergeFakeState();
const db = createMergeFakeFirestore(state) as unknown as Firestore;
const all = () => JSON.stringify([...state.docs]);
let kid = '';
/** --apply with the matching kid unless the test says otherwise ('omit' = no --expect-kid). */
const apply = (expectKid?: string | 'omit') =>
  runEncryptIntegrationTokens(db, {
    apply: true,
    expectKid: expectKid === 'omit' ? undefined : (expectKid ?? kid),
  });

function seed() {
  state.docs.set('spotify_tokens/global', {
    access_token: ACCESS,
    refresh_token: REFRESH,
    expires_at: 1,
    _updatedAt: 'x',
    _userId: 'global',
  });
  state.docs.set('oura_tokens/u1', { access_token: ACCESS, refresh_token: REFRESH, expires_at: 1 });
  state.docs.set('apple_calendar_tokens/u2', { accessToken: ACCESS, refreshToken: REFRESH });
  state.docs.set('bogle_users/u3/plaid_tokens/data', { access_token: ACCESS, item_id: 'i' });
  state.docs.set('bogle_users/u4', {
    id: 'u4',
    name: 'n',
    linkedInTokens: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: 'x', scope: [] },
  });
  state.docs.set('bogle_users/u5', {
    id: 'u5',
    biometricTokens: { platform: 'oura', accessToken: ACCESS, refreshToken: REFRESH },
  });
  state.docs.set('bogle_users/u6', { id: 'u6', name: 'no tokens' });
}

describe('encrypt-integration-tokens migration', () => {
  const saved = { o: process.env.OAUTH_ENCRYPTION_KEY, l: process.env.LOG_HASH_SECRET };
  beforeAll(() => {
    process.env.OAUTH_ENCRYPTION_KEY = KEY;
    kid = tokenKeyId();
  });
  afterAll(() => {
    if (saved.o === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = saved.o;
    if (saved.l === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = saved.l;
  });
  beforeEach(() => {
    process.env.OAUTH_ENCRYPTION_KEY = KEY;
    delete process.env.LOG_HASH_SECRET;
    state.docs.clear();
    state.writes.length = 0;
    state.failWrites.clear();
    state.versions.clear();
    state.beforeWrite = undefined;
    seed();
  });

  it('a dry run counts per collection and writes nothing', async () => {
    const before = all();
    const counts = await runEncryptIntegrationTokens(db, { apply: false });
    expect(state.writes).toHaveLength(0);
    expect(all()).toBe(before);
    expect(counts.spotify_tokens).toMatchObject({ scanned: 1, plaintext: 1, written: 0 });
    expect(counts.plaid_tokens).toMatchObject({ plaintext: 1 });
    expect(counts['bogle_users.linkedInTokens']).toMatchObject({ scanned: 1, plaintext: 1 });
    expect(JSON.stringify(counts)).not.toContain('u4'); // counts only, no ids
  });

  it('--apply seals every plaintext record in place, readable by the stores', async () => {
    const counts = await apply();
    expect(all()).not.toContain(ACCESS);
    expect(all()).not.toContain(REFRESH);
    const spotify = state.docs.get('spotify_tokens/global')!;
    expect(Object.keys(spotify).sort()).toEqual(['_updatedAt', '_userId', 'encrypted']);
    expect(openTokens(spotify, 't')).toEqual({
      access_token: ACCESS,
      refresh_token: REFRESH,
      expires_at: 1,
    });
    const li = state.docs.get('bogle_users/u4')!;
    expect(Object.keys(li.linkedInTokens as object)).toEqual(['encrypted']);
    expect(li.name).toBe('n');
    expect(state.docs.get('bogle_users/u6')).toEqual({ id: 'u6', name: 'no tokens' });
    expect(Object.values(counts).reduce((n, c) => n + c.written, 0)).toBe(6);
  });

  it('is idempotent: a second --apply writes nothing and counts the records as sealed', async () => {
    await apply();
    const after = all();
    state.writes.length = 0;
    const counts = await apply();
    expect(state.writes).toHaveLength(0);
    expect(all()).toBe(after);
    expect(counts.oura_tokens).toMatchObject({ plaintext: 0, sealed: 1, written: 0 });
  });

  it('an `encrypted` string that is not a real envelope is plaintext, and is sealed', async () => {
    // What encryptData writes when no key is set: the tokens as plain JSON.
    state.docs.set('oura_tokens/u7', {
      encrypted: JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH }),
      updatedAt: 'x',
    });
    const dry = await runEncryptIntegrationTokens(db, { apply: false });
    expect(dry.oura_tokens).toMatchObject({ plaintext: 2, sealed: 0 });
    await apply();
    const doc = state.docs.get('oura_tokens/u7')!;
    expect(isEncrypted(doc.encrypted as string)).toBeTruthy();
    expect(openTokens(doc, 't')).toEqual({ access_token: ACCESS, refresh_token: REFRESH });
    expect(doc.updatedAt).toBe('x');
  });

  it('a mixed doc loses its plaintext keys and keeps its envelope unchanged', async () => {
    const envelope = sealTokens({ access_token: 'newer', refresh_token: 'newer-r' }).encrypted;
    state.docs.set('oura_tokens/u8', {
      encrypted: envelope,
      access_token: ACCESS,
      refresh_token: REFRESH,
    });
    state.docs.set('bogle_users/u9', {
      id: 'u9',
      linkedInTokens: { encrypted: envelope, accessToken: ACCESS },
    });
    const counts = await apply();
    expect(state.docs.get('oura_tokens/u8')).toEqual({ encrypted: envelope });
    expect(state.docs.get('bogle_users/u9')!.linkedInTokens).toEqual({ encrypted: envelope });
    expect(counts.oura_tokens).toMatchObject({ mixed: 1 });
    expect(all()).not.toContain(ACCESS);
  });

  it('a per-doc failure keeps that original, records its code, and the run continues', async () => {
    state.failWrites.add('oura_tokens/u1');
    const original = structuredClone(state.docs.get('oura_tokens/u1'));
    const counts = await apply();
    expect(counts.oura_tokens).toMatchObject({ written: 0, failed: 1, failureCodes: { '14': 1 } });
    expect(state.docs.get('oura_tokens/u1')).toEqual(original);
    expect(counts.apple_calendar_tokens).toMatchObject({ written: 1 });
  });

  it('a token refreshed mid-run is not clobbered (lastUpdateTime precondition)', async () => {
    const refreshed = sealTokens({ access_token: 'refreshed', refresh_token: 'refreshed-r' });
    let raced = false;
    state.beforeWrite = (path) => {
      if (path !== 'oura_tokens/u1' || raced) return;
      raced = true; // the store's own write lands between the read pass and ours
      void db
        .collection('oura_tokens')
        .doc('u1')
        .set({ ...refreshed });
    };
    const counts = await apply();
    expect(counts.oura_tokens).toMatchObject({ written: 0, failed: 1, failureCodes: { '9': 1 } });
    expect(state.docs.get('oura_tokens/u1')).toEqual(refreshed);
  });

  describe('re-sealing legacy-key envelopes once OAUTH_ENCRYPTION_KEY is set', () => {
    const LEGACY = 'fixture-log-hash-secret';
    const sealWithLegacy = (tokens: Record<string, unknown>) => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      process.env.LOG_HASH_SECRET = LEGACY;
      const sealed = sealTokens(tokens);
      process.env.OAUTH_ENCRYPTION_KEY = KEY;
      return sealed;
    };

    it('re-seals them under the new kid, idempotently, leaving current ones alone', async () => {
      const legacy = sealWithLegacy({ access_token: 'legacy-a' });
      const current = sealTokens({ access_token: 'current-a' });
      state.docs.set('oura_tokens/l1', { ...legacy, updatedAt: 'x' });
      state.docs.set('oura_tokens/c1', { ...current });
      state.docs.set('bogle_users/l2', { id: 'l2', linkedInTokens: { ...legacy } });

      const counts = await apply();
      expect(counts.oura_tokens).toMatchObject({ legacy: 1, sealed: 1 }); // c1
      const l1 = state.docs.get('oura_tokens/l1')!;
      expect(JSON.parse(l1.encrypted as string).kid).toBe(kid);
      expect(l1.updatedAt).toBe('x');
      expect(openTokens(l1, 't')).toEqual({ access_token: 'legacy-a' });
      const l2 = state.docs.get('bogle_users/l2')!.linkedInTokens as Record<string, unknown>;
      expect(JSON.parse(l2.encrypted as string).kid).toBe(kid);
      expect(state.docs.get('oura_tokens/c1')).toEqual({ ...current });

      state.writes.length = 0;
      const again = await apply();
      expect(again.oura_tokens).toMatchObject({ legacy: 0, sealed: 3 });
      expect(state.writes).toHaveLength(0);
    });

    it('a re-seal run needs BOTH env vars: without LOG_HASH_SECRET it refuses', async () => {
      state.docs.set('google_calendar_tokens/g1', { ...sealWithLegacy({ access_token: 'x' }) });
      delete process.env.LOG_HASH_SECRET; // only the new key: the legacy envelopes don't open
      await expect(apply()).rejects.toThrow(/No envelope the servers wrote opens/);
      expect(state.writes).toHaveLength(0);
      process.env.LOG_HASH_SECRET = LEGACY; // both: proceeds
      expect((await apply()).google_calendar_tokens).toBeUndefined();
      expect(state.docs.get('oura_tokens/u1')).toHaveProperty('encrypted');
    });

    it('a mixed doc whose envelope no key opens is unopenable and left untouched', async () => {
      process.env.OAUTH_ENCRYPTION_KEY = 'some-retired-key';
      const lost = sealTokens({ access_token: 'lost' }).encrypted;
      process.env.OAUTH_ENCRYPTION_KEY = KEY;
      const record = { encrypted: lost, access_token: ACCESS };
      state.docs.set('oura_tokens/m1', { ...record });
      state.docs.set('google_calendar_tokens/g2', { ...sealTokens({ access_token: 'x' }) });
      const counts = await apply();
      expect(counts.oura_tokens).toMatchObject({ unopenable: 1, mixed: 0 });
      expect(state.docs.get('oura_tokens/m1')).toEqual(record);
    });

    it('with no OAUTH_ENCRYPTION_KEY nothing is legacy', async () => {
      const legacy = sealWithLegacy({ access_token: 'legacy-a' });
      delete process.env.OAUTH_ENCRYPTION_KEY;
      state.docs.set('oura_tokens/l1', { ...legacy });
      const counts = await runEncryptIntegrationTokens(db, { apply: false });
      expect(counts.oura_tokens).toMatchObject({ legacy: 0, sealed: 1 });
    });
  });

  describe('--apply proves the servers key first', () => {
    it('refuses with no --expect-kid when no server envelope exists', async () => {
      await expect(apply('omit')).rejects.toThrow(/--apply needs --expect-kid/);
      expect(state.writes).toHaveLength(0);
    });

    it('refuses on a --expect-kid mismatch', async () => {
      await expect(apply('deadbeef')).rejects.toThrow(/does not match --expect-kid=deadbeef/);
      expect(state.writes).toHaveLength(0);
    });

    it('requires --expect-kid even when a server envelope opens (that proves only the web key)', async () => {
      state.docs.set('google_calendar_tokens/u10', { ...sealTokens({ access_token: 'x' }) });
      await expect(apply('omit')).rejects.toThrow(/--apply needs --expect-kid/);
      expect(state.writes).toHaveLength(0);
      expect((await apply()).oura_tokens.written).toBe(1); // with the kid it proceeds
    });

    it('refuses when the server envelopes do not open with this key', async () => {
      process.env.OAUTH_ENCRYPTION_KEY = 'the-servers-key';
      state.docs.set('google_calendar_tokens/u10', { ...sealTokens({ access_token: 'x' }) });
      process.env.OAUTH_ENCRYPTION_KEY = KEY;
      await expect(apply()).rejects.toThrow(/No envelope the servers wrote opens/);
      expect(state.docs.get('oura_tokens/u1')).toHaveProperty('access_token');
    });

    it('refuses with no key at all', async () => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      delete process.env.LOG_HASH_SECRET;
      await expect(apply('none')).rejects.toThrow(/No encryption key/);
      expect(state.writes).toHaveLength(0);
    });

    it('reads --expect-kid from argv', () => {
      expect(parseExpectKid(['--apply', '--expect-kid=ab12cd34'])).toBe('ab12cd34');
      expect(parseExpectKid(['--apply'])).toBeUndefined();
    });
  });
});
