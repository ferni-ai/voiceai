/**
 * The root-collection calendar token cleanup, against an in-memory Firestore
 * (documents by full path) and a fake Google revoke endpoint. Logs run at
 * debug so a uid or token that reached any log line would show up here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LOG_LEVEL = 'debug';
// src/tests/setup.ts mocks the logger for every test; this one needs the real
// pino logger (it writes to process.stderr under vitest) to prove what it emits.
vi.mock('../../../src/utils/safe-logger.js', async (importOriginal) => importOriginal());

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/** Paths whose delete fails (a Firestore error naming the path). */
const failingDeletes = vi.hoisted(() => new Set<string>());

vi.mock('@google-cloud/firestore', () => {
  const docRef = (path: string): Record<string, unknown> => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (value: Record<string, unknown>) => void docs.set(path, value),
    delete: async () => {
      if (failingDeletes.has(path)) throw new Error(`delete refused: ${path}`);
      docs.delete(path);
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: async () => ({
      docs: [...docs.keys()]
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map((p) => ({ id: p.slice(path.length + 1), data: () => docs.get(p), ref: docRef(p) })),
    }),
  });
  return {
    Firestore: class {
      collection(name: string) {
        return collectionRef(name);
      }
      async terminate() {}
    },
  };
});

const { Firestore } = await import('@google-cloud/firestore');
const { revokeAndDeleteRootCalendarTokens, dryRunRootCalendarTokens, main, GOOGLE_REVOKE_URL } =
  await import('../calendar-root-tokens.js');

const db = new Firestore() as unknown as import('@google-cloud/firestore').Firestore;
const root = (uid: string) => `google_calendar_tokens/${uid}`;
const stored = (uid: string) => `bogle_users/${uid}/google_calendar_tokens/data`;

function seedRoot(uid: string, tokens: { refresh?: string; access?: string } = {}): void {
  docs.set(root(uid), {
    access_token: tokens.access ?? `access-secret-${uid}`,
    refresh_token: tokens.refresh ?? `refresh-secret-${uid}`,
    token_type: 'Bearer',
    expiry_date: 1_700_000_000_000,
  });
}

/** Google's revoke endpoint: answers per token; records every token revoked. */
const revokedTokens: string[] = [];
let revokeAnswer: (token: string) => Promise<Response> = async () => new Response('', { status: 200 });
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  expect(url).toBe(GOOGLE_REVOKE_URL);
  const token = new URLSearchParams(String(init.body)).get('token') ?? '';
  revokedTokens.push(token);
  return revokeAnswer(token);
});

/** Everything printed or logged (stdout, stderr, console). */
let output: string[] = [];

beforeEach(() => {
  docs.clear();
  failingDeletes.clear();
  revokedTokens.length = 0;
  revokeAnswer = async () => new Response('', { status: 200 });
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.exitCode = undefined;
  output = [];
  const capture = (...args: unknown[]) => void output.push(args.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('revokeAndDeleteRootCalendarTokens', () => {
  it('revokes each doc at Google (refresh token first) and deletes it', async () => {
    seedRoot('user-a');
    seedRoot('user-b', { refresh: '', access: 'access-only-b' });

    const counts = await revokeAndDeleteRootCalendarTokens(db);

    expect(counts).toEqual({ scanned: 2, revoked: 2, revokeFailed: 0, deleted: 2, deleteFailed: 0 });
    expect(revokedTokens.sort()).toEqual(['access-only-b', 'refresh-secret-user-a']);
    expect(docs.size).toBe(0);
  });

  it('deletes the doc even when the revoke fails', async () => {
    seedRoot('user-refused');
    seedRoot('user-offline');
    revokeAnswer = async (token) => {
      if (token.includes('offline')) throw new TypeError('fetch failed');
      return new Response('{"error":"invalid_token"}', { status: 400 });
    };

    const counts = await revokeAndDeleteRootCalendarTokens(db);

    expect(counts).toMatchObject({ revoked: 0, revokeFailed: 2, deleted: 2 });
    expect(docs.size).toBe(0);
  });

  it('never writes the token anywhere else', async () => {
    seedRoot('user-c');
    await revokeAndDeleteRootCalendarTokens(db);
    expect(docs.has(stored('user-c'))).toBe(false);
    expect(docs.size).toBe(0);
  });

  it('a failed delete is counted, keeps the doc and the run goes on', async () => {
    seedRoot('user-stuck');
    seedRoot('user-ok');
    failingDeletes.add(root('user-stuck'));

    const counts = await revokeAndDeleteRootCalendarTokens(db);

    expect(counts).toMatchObject({ scanned: 2, deleted: 1, deleteFailed: 1 });
    expect(docs.has(root('user-stuck'))).toBe(true);
    expect(docs.has(root('user-ok'))).toBe(false);
  });
});

describe('dryRunRootCalendarTokens', () => {
  it('counts, and calls neither revoke nor delete', async () => {
    seedRoot('user-d');
    seedRoot('user-e', { refresh: '' });
    docs.set(stored('user-d'), { encrypted: 'x' });
    const before = JSON.stringify([...docs]);

    const counts = await dryRunRootCalendarTokens(db);

    expect(counts).toEqual({ scanned: 2, withRefreshToken: 1, alreadyHasEncrypted: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify([...docs])).toBe(before);
  });
});

describe('main', () => {
  it('changes nothing without --apply --confirm-project', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    seedRoot('user-f');

    await main(['node', 'script']);
    await main(['node', 'script', '--apply']);
    await main(['node', 'script', '--apply', '--confirm-project=other']);

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(docs.has(root('user-f'))).toBe(true);
  });

  it('under LOG_LEVEL=debug, no uid or token appears in anything printed or logged', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    seedRoot('uid-alpha');
    seedRoot('uid-bravo');
    seedRoot('uid-charlie');
    revokeAnswer = async (token) => {
      if (token.includes('bravo')) throw new TypeError('fetch failed');
      return new Response('', { status: 400 });
    };
    failingDeletes.add(root('uid-charlie'));

    await main(['node', 'script']);
    const counts = await main(['node', 'script', '--apply', '--confirm-project=test-project']);

    expect(counts).toMatchObject({ revokeFailed: 3, deleted: 2, deleteFailed: 1 });
    const all = output.join('\n');
    // The failures were logged (so logging really ran at debug)...
    expect(all).toContain('Revoke refused');
    expect(all).toContain('Delete failed');
    expect(all).toContain('"withRefreshToken":3');
    // ...and nothing names a user or carries a token.
    expect(all).not.toMatch(/uid-|secret/);
  });
});
