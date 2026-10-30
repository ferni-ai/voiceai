/**
 * The shared user OAuth store records a revoked link as needs_reauth, reports it on the
 * next read, clears it on a reconnect, and loses it with the rest of the account's record.
 *
 * Runs on the REAL persistence layer over the Firestore fake (merge writes, update with a
 * lastUpdateTime precondition), so the doc path and the exact write each step makes are
 * pinned, not assumed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';
import { eraseStore } from '../../platform/erase-store.js';
import { ERASED_STORES } from '../../platform/user-stores.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const sink = (...args: unknown[]) => void logged.push(args);
  const logger = { info: sink, warn: sink, error: sink, debug: sink, child: () => logger };
  return { ...(await importOriginal<object>()), createLogger: () => logger };
});

const { createUserOAuthStore } = await import('../user-oauth-store.js');
const { refreshWithRevocation, TokenPermanentlyInvalidError, permanentGrantErrorClass } =
  await import('../oauth-revocation.js');
const { encryptData, decryptData, keyIdOf } = await import('../../../utils/token-encryption.js');
const { resealCountsSnapshot } = await import('../../../utils/token-at-rest.js');

interface Tokens {
  refresh_token: string;
  access_token: string;
  expires_at: number;
}
const OLD: Tokens = { access_token: 'at-old', refresh_token: 'rt-old', expires_at: 1 };
const NEW: Tokens = {
  access_token: 'at-new',
  refresh_token: 'rt-new',
  expires_at: 9_999_999_999_999,
};
const UID = 'user-0001-abcdefghijklmnopqrst';
const store = createUserOAuthStore<Tokens>({ provider: 'test', collection: 'test_tokens' });
const docPath = `bogle_users/${UID}/test_tokens/data`;

const revoked = async () => {
  throw new TokenPermanentlyInvalidError('revoked', 'invalid_grant');
};
const bump = (path: string) => state.versions.set(path, (state.versions.get(path) ?? 0) + 1);

beforeEach(async () => {
  await store.shutdown();
  state.docs.clear();
  state.writes.length = 0;
  state.versions.clear();
  state.beforeWrite = undefined;
  state.beforeRead = undefined;
  logged.length = 0;
  await store.save(UID, OLD);
});

describe('where the link lives', () => {
  it('is one doc at bogle_users/{uid}/{collection}/data, nowhere else', () => {
    expect([...state.docs.keys()]).toEqual([docPath]);
    expect(Object.keys(state.docs.get(docPath)!).filter((k) => !k.startsWith('_'))).toEqual(
      expect.arrayContaining(['encrypted', 'updated_at', 'needs_reauth'])
    );
  });
});

describe('refreshWithRevocation', () => {
  it('leaves a link alone when the refresh works', async () => {
    const result = await refreshWithRevocation(store, UID, 'rt-old', async () => {
      await store.save(UID, NEW);
      return NEW;
    });
    expect(result).toEqual(NEW);
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
    expect(state.docs.get(docPath)?.needs_reauth).toBeNull();
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('records needs_reauth on invalid_grant and the next read reports it', async () => {
    expect(await refreshWithRevocation(store, UID, 'rt-old', revoked)).toBeNull();

    const mark = state.docs.get(docPath)?.needs_reauth as { at: number; errorClass: string };
    expect(mark.errorClass).toBe('invalid_grant');
    expect(mark.at).toBeGreaterThan(0);
    expect(Object.keys(mark).sort()).toEqual(['at', 'errorClass']); // no token material

    await store.shutdown(); // a new process: nothing remembered in memory
    expect((await store.linkStatus(UID)).state).toBe('needs_reauth');
    expect((await store.linkStatus(UID)).needsReauth?.errorClass).toBe('invalid_grant');
    expect(store.isRefreshBlocked(UID)).toBe(false); // the block was in memory, now gone
    expect(await store.get(UID)).toMatchObject({ refresh_token: 'rt-old' }); // tokens untouched
  });

  it('writes only the needs_reauth field, never the grant', async () => {
    const before = state.docs.get(docPath)!.encrypted;
    state.writes.length = 0;
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    expect(state.writes.map((w) => [w.op, Object.keys(w.data ?? {})])).toEqual([
      ['update', ['needs_reauth']],
    ]);
    expect(state.docs.get(docPath)!.encrypted).toBe(before);
  });

  it('blocks further refreshes for the process and logs ids, never tokens', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    expect(store.isRefreshBlocked(UID)).toBe(true);
    // this module's own lines (the persistence layer logs its own, by collection)
    const text = JSON.stringify(logged.filter((l) => JSON.stringify(l).includes('"provider"')));
    expect(text).toContain('needs_reauth');
    for (const secret of ['at-old', 'rt-old', UID]) expect(text).not.toContain(secret);
  });

  it('clears needs_reauth when the person reconnects', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    await store.save(UID, NEW);

    expect(state.docs.get(docPath)?.needs_reauth).toBeNull();
    await store.shutdown();
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('ignores a failure on a grant that was replaced before it was recorded', async () => {
    state.docs.set(docPath, { ...state.docs.get(docPath), encrypted: encryptData(NEW) });
    expect(await refreshWithRevocation(store, UID, 'rt-old', revoked)).toBeNull();
    expect(state.docs.get(docPath)?.needs_reauth).toBeNull();
    expect(await store.get(UID)).toMatchObject({ refresh_token: 'rt-new' });
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('a reconnect landing between the read and the write is not overwritten', async () => {
    const reconnected = { encrypted: encryptData(NEW), updated_at: 777, needs_reauth: null };
    state.beforeWrite = (path) => {
      state.beforeWrite = undefined;
      state.docs.set(path, reconnected); // the person reconnects while we are recording
      bump(path);
    };
    expect(await refreshWithRevocation(store, UID, 'rt-old', revoked)).toBeNull();

    expect(state.docs.get(docPath)).toEqual(reconnected); // new grant intact, no stale flag
    expect(state.writes.filter((w) => w.op === 'set' && w.data?.encrypted)).toHaveLength(1); // the save in beforeEach only
    await store.shutdown();
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
  });

  it('a reconnect landing before the conditional update reads the doc is not flagged', async () => {
    // The reconnect is already stored (and versioned) when the update's own snapshot is taken,
    // so only the "doc unchanged" check can refuse it, not the lastUpdateTime precondition.
    const reconnected = { encrypted: encryptData(NEW), updated_at: 777, needs_reauth: null };
    let reads = 0;
    state.beforeRead = (path) => {
      if (path !== docPath || ++reads !== 2) return; // 1st: markNeedsReauth's load; 2nd: the update's
      state.beforeRead = undefined;
      state.docs.set(path, reconnected);
      bump(path);
    };
    expect(await refreshWithRevocation(store, UID, 'rt-old', revoked)).toBeNull();

    expect(reads).toBe(2);
    expect(state.docs.get(docPath)).toEqual(reconnected);
    expect(state.writes.filter((w) => w.op === 'update')).toEqual([]);
  });

  it('a disconnect landing between the read and the write is not undone', async () => {
    state.beforeWrite = (path) => {
      state.beforeWrite = undefined;
      state.docs.delete(path);
      bump(path);
    };
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    expect(state.docs.has(docPath)).toBe(false);
  });

  it('does not record a transient failure', async () => {
    const down = async () => {
      throw new Error('503');
    };
    expect(await refreshWithRevocation(store, UID, 'rt-old', down)).toBeNull();
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('does not invent a link for a user who disconnected', async () => {
    await store.remove(UID);
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    expect(state.docs.has(docPath)).toBe(false);
    expect(await store.linkStatus(UID)).toEqual({ state: 'not_connected' });
  });
});

describe('re-seal on read (TOKEN_SEALING_KEY)', () => {
  const SEAL = Buffer.alloc(32, 9).toString('base64');
  const saved = { ...process.env };
  afterEach(() => {
    Object.assign(process.env, saved);
    if (saved.TOKEN_SEALING_KEY === undefined) delete process.env.TOKEN_SEALING_KEY;
  });

  it('moves an envelope sealed under the old key to the new one, keeping needs_reauth', async () => {
    const mark = { at: 5, errorClass: 'invalid_grant' };
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = 'fixture-log-hash-secret';
    state.docs.set(docPath, { encrypted: encryptData(OLD), updated_at: 123, needs_reauth: mark });
    process.env.TOKEN_SEALING_KEY = SEAL; // after seeding: the doc is a legacy blob
    await store.shutdown();

    const settled = () => Object.values(resealCountsSnapshot()).reduce((a, b) => a + b, 0);
    const before = settled();
    expect(await store.get(UID)).toMatchObject({ refresh_token: 'rt-old' });
    await vi.waitFor(() => expect(settled()).toBe(before + 1));

    const doc = state.docs.get(docPath)!;
    expect((JSON.parse(doc.encrypted as string) as { kid: string }).kid).toBe(keyIdOf(SEAL));
    expect(doc.updated_at).toBe(123);
    expect(doc.needs_reauth).toEqual(mark);
    expect(decryptData<Tokens>(doc.encrypted as string)).toEqual(OLD);
  });
});

describe('account erasure', () => {
  it('deletes the needs_reauth state with the rest of the record', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', revoked);
    expect((await store.linkStatus(UID)).state).toBe('needs_reauth');

    const db = {
      collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
      recursiveDelete: async (ref: { path: string }) => {
        for (const p of [...state.docs.keys()]) {
          if (p === ref.path || p.startsWith(`${ref.path}/`)) state.docs.delete(p);
        }
      },
    } as unknown as FirebaseFirestore.Firestore;
    for (const owned of ERASED_STORES.filter((s) => 'doc' in s)) await eraseStore(db, owned, UID);

    expect(state.docs.has(docPath)).toBe(false);
    await store.shutdown();
    expect(await store.linkStatus(UID)).toEqual({ state: 'not_connected' });
  });
});

describe('permanentGrantErrorClass', () => {
  it.each([
    ['{"error":"invalid_grant"}', 'invalid_grant'],
    ['Token has been expired or revoked.', 'revoked'],
    ['{"error":"unauthorized_client"}', 'unauthorized_client'],
    ['{"error":"temporarily_unavailable"}', null],
  ])('%s -> %s', (body, expected) => {
    expect(permanentGrantErrorClass(body)).toBe(expected);
  });
});
