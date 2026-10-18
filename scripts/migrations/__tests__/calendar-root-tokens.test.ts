/**
 * The root-collection calendar token migration, against an in-memory
 * Firestore (documents by full path). The real token store, persistence layer
 * and encryption run; only @google-cloud/firestore is faked, so the script's
 * reads and saveTokens' writes land in the same map.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.OAUTH_ENCRYPTION_KEY = 'migration-test-key';

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/**
 * Paths whose writes fail (a Firestore error). Never cleared: the persistence
 * layer keeps a failed write dirty and retries it, so a cleared entry could
 * land in a later test.
 */
const failingWrites = vi.hoisted(() => new Set<string>());

vi.mock('@google-cloud/firestore', () => {
  const docRef = (path: string): Record<string, unknown> => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => {
      if (failingWrites.has(path)) throw new Error(`write refused: ${path}`);
      const prev = opts?.merge ? (docs.get(path) ?? {}) : {};
      docs.set(path, { ...prev, ...value });
    },
    delete: async () => void docs.delete(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: async () => ({
      docs: [...docs.keys()]
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map((p) => {
          const id = p.slice(path.length + 1);
          return { id, data: () => docs.get(p), ref: docRef(p) };
        }),
    }),
  });
  return {
    Firestore: class {
      collection(name: string) {
        return collectionRef(name);
      }
      batch() {
        const ops: Array<() => Promise<void>> = [];
        return {
          set: (ref: { set: (v: unknown, o: unknown) => Promise<void> }, v: unknown, o: unknown) =>
            void ops.push(() => ref.set(v, o)),
          commit: async () => {
            for (const op of ops) await op();
          },
        };
      }
      async terminate() {}
    },
  };
});

const { Firestore } = await import('@google-cloud/firestore');
const { migrateRootCalendarTokens, main } = await import('../calendar-root-tokens.js');
const { encryptData, decryptData, isEncrypted } = await import(
  '../../../src/utils/token-encryption.js'
);
const { shutdownTokenStore } = await import(
  '../../../src/services/identity/google-calendar-token-store.js'
);

const db = new Firestore() as unknown as import('@google-cloud/firestore').Firestore;
const root = (uid: string) => `google_calendar_tokens/${uid}`;
const stored = (uid: string) => `bogle_users/${uid}/google_calendar_tokens/data`;

function seedRoot(uid: string, refresh = `refresh-secret-${uid}`): void {
  docs.set(root(uid), {
    access_token: `access-secret-${uid}`,
    refresh_token: refresh,
    expires_in: 3599,
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/calendar',
    expiry_date: 1_700_000_000_000,
  });
}

function storedTokens(uid: string): Record<string, unknown> | null {
  const doc = docs.get(stored(uid));
  if (!doc) return null;
  expect(isEncrypted(doc.encrypted as string)).toBeTruthy();
  return decryptData<Record<string, unknown>>(doc.encrypted as string);
}

beforeEach(() => {
  docs.clear();
  process.exitCode = undefined;
});

afterAll(async () => {
  await shutdownTokenStore();
});

describe('migrateRootCalendarTokens', () => {
  it('moves a root token into the encrypted store and deletes the root doc', async () => {
    seedRoot('user-a');

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ scanned: 1, migrated: 1, rootDeleted: 1, failed: 0 });
    expect(docs.has(root('user-a'))).toBe(false);
    expect(storedTokens('user-a')).toMatchObject({
      access_token: 'access-secret-user-a',
      refresh_token: 'refresh-secret-user-a',
      expires_at: 1_700_000_000_000,
      scope: 'https://www.googleapis.com/auth/calendar',
    });
    // No plaintext token anywhere in the stored doc.
    expect(JSON.stringify(docs.get(stored('user-a')))).not.toContain('refresh-secret');
  });

  it('keeps the existing encrypted token and deletes the stale root copy', async () => {
    seedRoot('user-b', 'old-root-refresh');
    docs.set(stored('user-b'), {
      encrypted: encryptData({ access_token: 'a', refresh_token: 'current-refresh', expires_at: 1 }),
    });

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ alreadyConnected: 1, migrated: 0, rootDeleted: 1 });
    expect(docs.has(root('user-b'))).toBe(false);
    expect(storedTokens('user-b')?.refresh_token).toBe('current-refresh');
  });

  it('keeps the root doc when the encrypted write does not land, and goes on', async () => {
    seedRoot('user-fail');
    seedRoot('user-ok');
    failingWrites.add(stored('user-fail'));

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ scanned: 2, migrated: 1, failed: 1, rootDeleted: 1 });
    expect(docs.has(root('user-fail'))).toBe(true);
    expect(docs.has(stored('user-fail'))).toBe(false);
    expect(docs.has(root('user-ok'))).toBe(false);
    expect(storedTokens('user-ok')?.refresh_token).toBe('refresh-secret-user-ok');
  });

  it('keeps the root doc when an existing encrypted doc does not decrypt', async () => {
    seedRoot('user-c');
    docs.set(stored('user-c'), { encrypted: 'not-a-payload' });

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ failed: 1, rootDeleted: 0 });
    expect(docs.has(root('user-c'))).toBe(true);
  });

  it('leaves a root doc with no refresh token alone', async () => {
    seedRoot('user-d', '');

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ keptNoRefreshToken: 1, rootDeleted: 0 });
    expect(docs.has(root('user-d'))).toBe(true);
    expect(docs.has(stored('user-d'))).toBe(false);
  });

  it('dry run counts and writes nothing', async () => {
    seedRoot('user-e');
    seedRoot('user-f', 'old');
    docs.set(stored('user-f'), {
      encrypted: encryptData({ access_token: 'a', refresh_token: 'cur', expires_at: 1 }),
    });
    const before = JSON.stringify([...docs]);

    const counts = await migrateRootCalendarTokens(db, { apply: false });

    expect(counts).toMatchObject({ scanned: 2, migrated: 1, alreadyConnected: 1, rootDeleted: 0 });
    expect(JSON.stringify([...docs])).toBe(before);
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    seedRoot('user-g');
    await migrateRootCalendarTokens(db, { apply: true });
    const after = JSON.stringify([...docs]);

    const counts = await migrateRootCalendarTokens(db, { apply: true });

    expect(counts).toMatchObject({ scanned: 0, migrated: 0, rootDeleted: 0 });
    expect(JSON.stringify([...docs])).toBe(after);
  });
});

describe('main', () => {
  it('writes only with --apply --confirm-project, and prints no ids or tokens', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    const printed: string[] = [];
    const libraryLogs: string[] = [];
    const capture = (...args: unknown[]) => void printed.push(args.map(String).join(' '));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(capture);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(capture);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      libraryLogs.push(String(chunk));
      return true;
    });
    try {
      seedRoot('user-main-uid');
      failingWrites.add(stored('user-main-uid'));
      seedRoot('user-main-ok');

      await main(['node', 'script']);
      expect(docs.has(stored('user-main-ok'))).toBe(false);

      await main(['node', 'script', '--apply']);
      await main(['node', 'script', '--apply', '--confirm-project=other']);
      expect(process.exitCode).toBe(1);
      expect(docs.has(stored('user-main-ok'))).toBe(false);

      process.exitCode = undefined;
      const counts = await main(['node', 'script', '--apply', '--confirm-project=test-project']);
      expect(counts).toMatchObject({ migrated: 1, failed: 1 });
      expect(docs.has(stored('user-main-ok'))).toBe(true);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    // The script prints counts only; logs (silenced by default in a real run)
    // never carry a token either.
    expect(printed.join('\n')).toContain('"migrated":1');
    expect(printed.join('\n')).not.toMatch(/secret|user-main/);
    expect(libraryLogs.join('\n')).not.toMatch(/secret/);
  });
});
