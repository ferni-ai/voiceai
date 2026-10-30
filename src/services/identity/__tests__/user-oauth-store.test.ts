/**
 * The shared user OAuth store records a revoked link as needs_reauth, reports it on the
 * next read, clears it on a reconnect, and loses it with the rest of the account's record.
 * The persistence layer is an in-memory Firestore (merge writes, as the real one) so the
 * doc each step leaves behind can be read back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eraseStore } from '../../platform/erase-store.js';
import { ERASED_STORES } from '../../platform/user-stores.js';

const firestore = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const logged = vi.hoisted(() => [] as unknown[]);

vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: (config: { collection: string; documentId: string }) => {
    const path = (uid: string) => `bogle_users/${uid}/${config.collection}/${config.documentId}`;
    const read = async (uid: string) => firestore.get(path(uid)) ?? null;
    return {
      get: read,
      load: read,
      setImmediate: async (uid: string, data: Record<string, unknown>) => {
        firestore.set(path(uid), { ...firestore.get(path(uid)), ...data }); // merge, as Firestore's
      },
      delete: async (uid: string) => void firestore.delete(path(uid)),
      shutdown: async () => {},
    };
  },
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const sink = (...args: unknown[]) => void logged.push(args);
  const logger = { info: sink, warn: sink, error: sink, debug: sink, child: () => logger };
  return { ...(await importOriginal<object>()), createLogger: () => logger };
});

const { createUserOAuthStore } = await import('../user-oauth-store.js');
const { refreshWithRevocation, TokenPermanentlyInvalidError, permanentGrantErrorClass } =
  await import('../oauth-revocation.js');

interface Tokens {
  access_token: string;
  refresh_token: string;
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

const revoked = () => {
  throw new TokenPermanentlyInvalidError('revoked', 'invalid_grant');
};

beforeEach(async () => {
  await store.shutdown();
  firestore.clear();
  logged.length = 0;
  await store.save(UID, OLD);
});

describe('refreshWithRevocation', () => {
  it('leaves a link alone when the refresh works', async () => {
    const result = await refreshWithRevocation(store, UID, 'rt-old', async () => {
      await store.save(UID, NEW);
      return NEW;
    });
    expect(result).toEqual(NEW);
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
    expect(firestore.get(docPath)?.needs_reauth).toBeNull();
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('records needs_reauth on invalid_grant and the next read reports it', async () => {
    expect(await refreshWithRevocation(store, UID, 'rt-old', async () => revoked())).toBeNull();

    const mark = firestore.get(docPath)?.needs_reauth as { at: number; errorClass: string };
    expect(mark.errorClass).toBe('invalid_grant');
    expect(mark.at).toBeGreaterThan(0);
    expect(Object.keys(mark).sort()).toEqual(['at', 'errorClass']); // no token material

    await store.shutdown(); // a new process: nothing remembered in memory
    expect((await store.linkStatus(UID)).state).toBe('needs_reauth');
    expect((await store.linkStatus(UID)).needsReauth?.errorClass).toBe('invalid_grant');
    expect(store.isRefreshBlocked(UID)).toBe(false); // the block was in memory, now gone
    expect(await store.get(UID)).toMatchObject({ refresh_token: 'rt-old' }); // tokens untouched
  });

  it('blocks further refreshes for the process and logs ids, never tokens', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', async () => revoked());
    expect(store.isRefreshBlocked(UID)).toBe(true);
    const text = JSON.stringify(logged);
    expect(text).toContain('needs_reauth');
    for (const secret of ['at-old', 'rt-old', UID]) expect(text).not.toContain(secret);
  });

  it('clears needs_reauth when the person reconnects', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', async () => revoked());
    await store.save(UID, NEW);

    expect(firestore.get(docPath)?.needs_reauth).toBeNull();
    await store.shutdown();
    expect(await store.linkStatus(UID)).toEqual({ state: 'connected' });
    expect(store.isRefreshBlocked(UID)).toBe(false);
  });

  it('ignores a failure on a grant that was replaced meanwhile', async () => {
    firestore.set(docPath, { ...firestore.get(docPath), ...{ encrypted: JSON.stringify(NEW) } });
    expect(await refreshWithRevocation(store, UID, 'rt-old', async () => revoked())).toBeNull();
    expect(firestore.get(docPath)?.needs_reauth).toBeNull();
    expect(await store.get(UID)).toMatchObject({ refresh_token: 'rt-new' });
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
    await refreshWithRevocation(store, UID, 'rt-old', async () => revoked());
    expect(firestore.has(docPath)).toBe(false);
    expect(await store.linkStatus(UID)).toEqual({ state: 'not_connected' });
  });
});

describe('account erasure', () => {
  it('deletes the needs_reauth state with the rest of the record', async () => {
    await refreshWithRevocation(store, UID, 'rt-old', async () => revoked());
    expect((await store.linkStatus(UID)).state).toBe('needs_reauth');

    const db = {
      collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
      recursiveDelete: async (ref: { path: string }) => {
        for (const p of [...firestore.keys()]) {
          if (p === ref.path || p.startsWith(`${ref.path}/`)) firestore.delete(p);
        }
      },
    } as unknown as FirebaseFirestore.Firestore;
    for (const owned of ERASED_STORES.filter((s) => 'doc' in s)) await eraseStore(db, owned, UID);

    expect(firestore.has(docPath)).toBe(false);
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
