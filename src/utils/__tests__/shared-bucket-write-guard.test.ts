/**
 * PRIVACY: production never writes under a shared placeholder owner
 * (bogle_users/anonymous, ant_patterns/unknown, ...), at the one layer every
 * Firestore write passes, so the direct writers the persistence layer never
 * sees can't file one caller's data in the bucket every id-less caller shares.
 *
 * The guarded stores are the uid-keyed ones account deletion walks
 * (services/platform/user-stores.ts ERASED_STORES). The write is dropped and the
 * call resolves as a logged no-op, never a rejection: a fire-and-forget write on
 * the API server or the pubsub worker (no unhandledRejection handler) must not
 * take the process down. Deletes still pass.
 */
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const debug = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => {
  const logger = () => ({ debug, info, warn, error: vi.fn(), child: logger });
  return { getLogger: logger, createLogger: logger };
});

/** A real client (Node's require: the test setup mocks the ESM import), past the setup's own guard. */
const realDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ getDatabase: async () => realDb.current }),
}));

import {
  guardedRequest,
  installSyntheticWriteGuard,
  refusedOwner,
  sharedBucketOwner,
} from '../synthetic-write-guard.js';
import { ERASED_STORES } from '../../services/platform/user-stores.js';
import { advancedReminderDefinitions } from '../../tools/domains/simple-utilities/advanced-reminders.js';

const PROD = 'projects/johnb-2025/databases/(default)/documents';
const DEV_DB = 'projects/johnb-2025/databases/ferni-dev/documents';
const update = (path: string, root = PROD) => ({ update: { name: `${root}/${path}`, fields: {} } });

const SHARED = [
  'anonymous',
  'unknown',
  'default',
  'shared',
  'anon',
  'session',
  'gateway',
  'gateway-recovery',
];
/** Every store whose document id is the person's uid. */
const UID_STORES = ERASED_STORES.flatMap((s) => ('doc' in s ? [s.collection] : []));

describe('sharedBucketOwner: which writes are under a shared placeholder', () => {
  it.each(SHARED)('refuses a prod write under bogle_users/%s and users/ of the same id', (id) => {
    expect(refusedOwner(update(`bogle_users/${id}/conversations/c1`), {})).toBe(id);
    expect(refusedOwner(update(`bogle_users/${id}`), {})).toBe(id);
    expect(refusedOwner(update(`users/${id}`), {})).toBe(id);
  });

  it.each([' anonymous', 'anonymous ', 'unknown\t', 'Unknown ', 'ANON', ' Default\n'])(
    'refuses %j: the owner is trimmed and lower-cased first',
    (id) => {
      expect(sharedBucketOwner(update(`bogle_users/${id}/x/y`), {})).toBe(id);
    }
  );

  it.each(UID_STORES)('refuses a placeholder doc id under the uid-keyed store %s', (store) => {
    expect(sharedBucketOwner(update(`${store}/unknown`), {})).toBe('unknown');
    expect(sharedBucketOwner(update(`${store}/anonymous/sub/doc`), {})).toBe('anonymous');
    expect(sharedBucketOwner(update(`${store}/uid-member`), {})).toBeNull();
  });

  it('covers the ANT, crisis and emotional stores the review named', () => {
    for (const path of [
      'ant_patterns/unknown',
      'ant_entries/unknown/entries/ant_1',
      'crisis_signals/anonymous',
      'emotional_history/unknown',
      'unified_user_models/anonymous',
      'maya_leaderboards/weekly/entries/anonymous',
      'apple_health_tokens/default',
    ]) {
      expect(sharedBucketOwner(update(path), {})).not.toBeNull();
    }
  });

  it('lets docs keyed by something else through, even when the id is "unknown"', () => {
    for (const path of [
      'tool_usage_stats/unknown', // keyed by toolId (tool-usage-analytics.ts)
      'optimization_feedback_summary/unknown', // keyed by toolId (optimization-persistence.ts)
      'entities/unknown', // own ids; the person is a field
      'vector_index_status/shared',
      'experiments/default',
      'maya_leaderboards/weekly', // the leaderboard itself, not an entry
    ]) {
      expect(refusedOwner(update(path), {})).toBeNull();
    }
  });

  it('lets members, minted anon: ids and look-alike real ids write', () => {
    for (const id of ['uid-member', 'anon:3b0e7c1e', 'onbehalf:call-1', 'anonymous-real-uid']) {
      expect(refusedOwner(update(`bogle_users/${id}/conversations/c1`), {})).toBeNull();
      expect(refusedOwner(update(`ant_patterns/${id}`), {})).toBeNull();
    }
  });

  it('refuses an update that requires the doc to exist; harness claims keep their exemption', () => {
    const claim = {
      ...update('bogle_users/anonymous/summaries/s1'),
      currentDocument: { exists: true },
    };
    expect(refusedOwner(claim, {})).toBe('anonymous');
    const harness = { ...update('bogle_users/test-user-1/x/y'), currentDocument: { exists: true } };
    expect(refusedOwner(harness, {})).toBeNull();
  });

  it('lets deletes, the dev database and the emulator through', () => {
    expect(
      refusedOwner({ delete: `${PROD}/bogle_users/anonymous/conversations/c1` }, {})
    ).toBeNull();
    expect(refusedOwner(update('bogle_users/anonymous/x/y', DEV_DB), {})).toBeNull();
    expect(
      refusedOwner(update('bogle_users/anonymous/x/y'), { FIRESTORE_EMULATOR_HOST: 'x' })
    ).toBeNull();
  });
});

describe('guardedRequest: a shared-bucket write is dropped and the call resolves', () => {
  it('a commit of only shared-bucket writes is never sent and resolves with a result per write', async () => {
    const send = vi.fn(async () => ({}));
    const writes = [update('bogle_users/anonymous/notes/data'), update('ant_patterns/unknown')];
    const out = (await guardedRequest('commit', { writes }, send, {})) as {
      writeResults: unknown[];
      commitTime: { seconds: number };
    };
    expect(send).not.toHaveBeenCalled();
    expect(out.writeResults).toHaveLength(2);
    expect(out.commitTime.seconds).toBeGreaterThan(0);
  });

  it("a mixed commit sends only the member's write, and answers for every write", async () => {
    const send = vi.fn(async (req: { writes: unknown[] }) => ({
      writeResults: req.writes.map(() => ({ updateTime: { seconds: 5 } })),
      commitTime: { seconds: 5 },
    }));
    const member = update('bogle_users/uid-member/notes/data');
    const writes = [update('bogle_users/anonymous/notes/data'), member];
    const out = (await guardedRequest(
      'commit',
      { writes, transaction: 't1' },
      send as never,
      {}
    )) as {
      writeResults: unknown[];
    };
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual({ writes: [member], transaction: 't1' });
    expect(out.writeResults).toEqual([{}, { updateTime: { seconds: 5 } }]);
  });

  it("still refuses a commit of only harness writes, and sends a member's write mixed with one", async () => {
    const send = vi.fn(async () => ({}));
    await expect(
      guardedRequest('commit', { writes: [update('bogle_users/test-user-1/n/d')] }, send, {})
    ).rejects.toMatchObject({ owner: 'test-user-1' });
    await guardedRequest(
      'commit',
      { writes: [update('bogle_users/uid-member/n/d'), update('bogle_users/test-user-1/n/d')] },
      send,
      {}
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('batchWrite drops the shared-bucket write, answers it OK, and sends the member one', async () => {
    const send = vi.fn(async (req: { writes: unknown[] }) => ({
      writeResults: req.writes.map(() => ({})),
      status: req.writes.map(() => ({ code: 0 })),
    }));
    const writes = [update('bogle_users/uid-member/notes/data'), update('crisis_signals/unknown')];
    const out = (await guardedRequest('batchWrite', { writes }, send as never, {})) as {
      status: Array<{ code: number }>;
    };
    expect(send.mock.calls[0]?.[0].writes).toHaveLength(1);
    expect(out.status.map((x) => x.code)).toEqual([0, 0]);
  });

  it('logs every dropped write by owner', async () => {
    warn.mockClear();
    await guardedRequest('commit', { writes: [update('emotional_history/Unknown ')] }, vi.fn(), {});
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'Unknown ', method: 'commit' }),
      expect.stringContaining('shared placeholder')
    );
  });
});

describe('real client, direct writer: advanced-reminders saveLocationReminder (`ctx.userId || "anon"`)', () => {
  it("drops an id-less caller's reminder under bogle_users/anon, and the write resolves", async () => {
    const { Firestore } = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    installSyntheticWriteGuard({});
    const db = new Firestore({ projectId: 'johnb-2025' });
    // Past the test setup's own refusal (gcp-test-guard), which would reject any write that is sent.
    (db as unknown as { initializeIfNeeded: () => Promise<void> }).initializeIfNeeded =
      async () => {};
    realDb.current = db;
    warn.mockClear();
    try {
      await expect(
        db.collection('bogle_users').doc('anonymous').collection('x').doc('y').set({ a: 1 })
      ).resolves.toBeDefined();

      const def = advancedReminderDefinitions.find((d) => d.id === 'locationReminder');
      const tool = def!.create({ userId: '', agentId: 'ferni', agentDisplayName: 'Ferni' }) as {
        execute: (args: Record<string, unknown>) => Promise<string>;
      };
      await tool.execute({
        message: 'my therapy notes',
        locationName: 'home',
        triggerOn: 'arrive',
      });

      expect(
        debug.mock.calls.find(([, msg]) => msg === 'Could not persist location reminder')
      ).toBe(undefined);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'anon' }),
        expect.stringContaining('shared placeholder')
      );
    } finally {
      await db.terminate();
    }
  });
});
