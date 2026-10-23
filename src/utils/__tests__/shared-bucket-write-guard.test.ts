/**
 * PRIVACY: production refuses writes under bogle_users/<placeholder> (and
 * users/<placeholder>) at the one layer every Firestore write passes, so the
 * ~925 direct `collection('bogle_users')` writers can never again file one
 * caller's data in the bucket every id-less caller shares. Deletes and updates
 * of existing docs still pass (cleanup and sweeps).
 */
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const debug = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => {
  const logger = () => ({ debug, info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: logger });
  return { getLogger: logger, createLogger: logger };
});

/** A real client (Node's require: the test setup mocks the ESM import), past the setup's own guard. */
const realDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ getDatabase: async () => realDb.current }),
}));

import { installSyntheticWriteGuard, refusedOwner } from '../synthetic-write-guard.js';
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

describe('refusedOwner: shared buckets', () => {
  it.each(SHARED)('refuses a prod write under bogle_users/%s and users/ of the same id', (id) => {
    expect(refusedOwner(update(`bogle_users/${id}/conversations/c1`), {})).toBe(id);
    expect(refusedOwner(update(`bogle_users/${id}`), {})).toBe(id);
    expect(refusedOwner(update(`users/${id}`), {})).toBe(id);
  });

  it('refuses other casings too', () => {
    expect(refusedOwner(update('bogle_users/Anonymous/summaries/s'), {})).toBe('Anonymous');
    expect(refusedOwner(update('bogle_users/ANON/devices/d'), {})).toBe('ANON');
  });

  it('lets members, minted anon: ids and look-alike real ids write', () => {
    for (const id of [
      'uid-member',
      'anon:3b0e7c1e',
      'onbehalf:call-1',
      'anonymous-real-uid',
      'defaults',
    ]) {
      expect(refusedOwner(update(`bogle_users/${id}/conversations/c1`), {})).toBeNull();
    }
  });

  it('lets deletes, updates of existing docs, the dev database and the emulator through', () => {
    expect(
      refusedOwner({ delete: `${PROD}/bogle_users/anonymous/conversations/c1` }, {})
    ).toBeNull();
    expect(
      refusedOwner(
        { ...update('bogle_users/unknown/reminders/r'), currentDocument: { exists: true } },
        {}
      )
    ).toBeNull();
    expect(refusedOwner(update('bogle_users/anonymous/x/y', DEV_DB), {})).toBeNull();
    expect(
      refusedOwner(update('bogle_users/anonymous/x/y'), { FIRESTORE_EMULATOR_HOST: 'x' })
    ).toBeNull();
  });
});

describe('a direct writer: advanced-reminders saveLocationReminder (`ctx.userId || "anon"`)', () => {
  it("cannot file an id-less caller's reminder under bogle_users/anon in production", async () => {
    const { Firestore } = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    installSyntheticWriteGuard({});
    const db = new Firestore({ projectId: 'johnb-2025' });
    (db as unknown as { initializeIfNeeded: () => Promise<void> }).initializeIfNeeded =
      async () => {};
    realDb.current = db;
    try {
      const def = advancedReminderDefinitions.find((d) => d.id === 'locationReminder');
      const tool = def!.create({ userId: '', agentId: 'ferni', agentDisplayName: 'Ferni' }) as {
        execute: (args: Record<string, unknown>) => Promise<string>;
      };
      await tool.execute({
        message: 'my therapy notes',
        locationName: 'home',
        triggerOn: 'arrive',
      });

      const persistFailure = debug.mock.calls.find(
        ([, msg]) => msg === 'Could not persist location reminder'
      );
      expect(persistFailure?.[0]).toMatchObject({ userId: 'anon' });
      expect(String((persistFailure?.[0] as { error?: unknown }).error)).toContain(
        'Refused a production Firestore write'
      );
    } finally {
      await db.terminate();
    }
  });
});
