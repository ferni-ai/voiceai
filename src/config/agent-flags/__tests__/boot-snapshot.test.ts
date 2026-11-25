/**
 * writeFlagSnapshotOnBoot: the dev agent writes its flag snapshot once per worker start, only
 * on dev's database with FLAG_SNAPSHOT on, and a failed write never fails or delays the boot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlagStore } from '../ports/flag-store.js';
import type { FlagSnapshot } from '../domain/snapshot.js';

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));

const adapter = vi.hoisted(() => ({ firestoreFlagStore: vi.fn() }));
vi.mock('../adapters/flag-store.js', () => adapter);

const { writeFlagSnapshotOnBoot } = await import('../boot-snapshot.js');

function fakeStore(write: FlagStore['writeSnapshot'] = async () => undefined) {
  const writes: FlagSnapshot[] = [];
  const store: FlagStore = {
    writeSnapshot: vi.fn(async (s: FlagSnapshot) => {
      writes.push(s);
      return write(s);
    }),
    readSnapshot: async () => null,
    appendChange: async () => undefined,
    recentChanges: async () => [],
  };
  return { store, writes };
}

const DEV_ON = { FIRESTORE_DATABASE: 'ferni-dev', FLAG_SNAPSHOT: 'on', BUILD_SHA: 'abc1234' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('writeFlagSnapshotOnBoot', () => {
  it('writes the snapshot once on ferni-dev with FLAG_SNAPSHOT on', async () => {
    const { store, writes } = fakeStore();
    await writeFlagSnapshotOnBoot({ ...DEV_ON, ABUSE_DISCLOSURE_PATTERNS: 'on' }, store);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.buildSha).toBe('abc1234');
    expect(writes[0]?.flags.FLAG_SNAPSHOT).toEqual({ raw: 'on', resolved: 'on' });
    expect(writes[0]?.flags.ABUSE_DISCLOSURE_PATTERNS).toEqual({ raw: 'on', resolved: 'on' });
    expect(Number.isNaN(Date.parse(writes[0]?.startedAt ?? ''))).toBe(false);
  });

  it('records a null build sha when the process has none', async () => {
    const { store, writes } = fakeStore();
    await writeFlagSnapshotOnBoot({ FIRESTORE_DATABASE: 'ferni-dev', FLAG_SNAPSHOT: 'on' }, store);
    expect(writes[0]?.buildSha).toBeNull();
  });

  it.each([
    ['FLAG_SNAPSHOT unset', { FIRESTORE_DATABASE: 'ferni-dev' }],
    ['FLAG_SNAPSHOT off', { FIRESTORE_DATABASE: 'ferni-dev', FLAG_SNAPSHOT: 'off' }],
    ["prod's database", { FIRESTORE_DATABASE: '(default)', FLAG_SNAPSHOT: 'on' }],
    ['no database set (prod)', { FLAG_SNAPSHOT: 'on' }],
    ['a misspelt dev database', { FIRESTORE_DATABASE: 'Ferni-dev', FLAG_SNAPSHOT: 'on' }],
  ])('does not write with %s', async (_label, env) => {
    const { store, writes } = fakeStore();
    await writeFlagSnapshotOnBoot(env, store);
    expect(writes).toHaveLength(0);
    expect(adapter.firestoreFlagStore).not.toHaveBeenCalled();
  });

  it('resolves and logs a warning when the store rejects', async () => {
    const { store } = fakeStore(async () => {
      throw new Error('7 PERMISSION_DENIED');
    });
    await expect(writeFlagSnapshotOnBoot(DEV_ON, store)).resolves.toBeUndefined();
    expect(store.writeSnapshot).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls[0])).toContain('PERMISSION_DENIED');
  });

  it('opens the Firestore store only when it will write, and survives it throwing', async () => {
    adapter.firestoreFlagStore.mockImplementation(() => {
      throw new Error('no credentials');
    });
    await expect(writeFlagSnapshotOnBoot(DEV_ON)).resolves.toBeUndefined();
    expect(adapter.firestoreFlagStore).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls[0])).toContain('no credentials');
  });
});
