/**
 * Every crisis record is kept permanently, a member's or not (2026-11-11). So:
 *  - no crisis_signals write carries an expireAt, and no TTL policy covers the collection (one
 *    would silently delete a caller's 14-day crisis quiet and their crisis history);
 *  - a non-member's record (anon:, try-first device:demo_) holds tier and time only
 *    (NON_MEMBER_SIGNAL_FIELDS): no words, no session id;
 *  - every place that can write the collection is listed below, so a new one fails this test
 *    until someone decides what it writes.
 * Linking a record into an account: identity/__tests__/crisis-signals-linking.test.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../outreach/proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => pathFirestore(docs),
}));

const { NON_MEMBER_SIGNAL_FIELDS, followUpCrisis, logCrisisSignal } = await import('../index.js');

// ---- Static inventory -------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, '../../../..');
/** Not production code, and never the sealed, held-out or blind crisis sets. */
const SKIP = /(__tests__|\.test\.ts$|fixtures|heldout|held-out|blind|sealed|corpus|node_modules)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIP.test(path)) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}
/** The file's code, without comment lines (a comment naming the collection writes nothing). */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

/**
 * Every file whose code names crisis_signals, or that copies whole record trees (listCollections
 * plus a write: such a copier never names the collection, and moves it anyway). What each one
 * does with a crisis_signals doc, and why that keeps every record free of an expireAt.
 */
const INVENTORY: Record<string, string> = {
  'src/services/human-transfer/index.ts':
    'WRITER logCrisisSignal: no expireAt for anyone; anon:/device:demo_ -> NON_MEMBER_SIGNAL_FIELDS (tested below)',
  'src/services/identity/identity-linking.ts':
    'COPIER copyTree on sign-in: copies a non-member record into the account, dropping an older expireAt (linking test)',
  'scripts/devdb/copy-user.ts':
    'COPIER prod -> dev, same uid and path, fields as stored: adds no expireAt',
  'src/services/human-transfer/crisis-signals.ts': 'READ crisisLevelSignalsSince',
  'src/services/safety/index.ts': 'READ getUserCrisisHistory (top-level crisis_signals/{uid})',
  'src/services/platform/user-stores.ts': 'LIST of stores account erase deletes and export reads',
  'scripts/migrations/purge-synthetic-data.ts':
    'READ + DELETE synthetic owners (its .add is a Set)',
  'scripts/data/orphaned-erasure-audit.ts': 'READ counts only (its .set/.add are a Map and a Set)',
  'scripts/gdpr/verify-erasure.ts': 'EMULATOR probe: seeds a fixed list without crisis_signals',
};

function inventoried(): string[] {
  return [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'scripts'))]
    .filter((path) => {
      const text = code(path);
      const names = /\bcrisis_signals\b/.test(text);
      const copiesTrees = /listCollections\(\)/.test(text) && /\.(set|add|create)\(/.test(text);
      return names || copiesTrees;
    })
    .map((path) => relative(ROOT, path))
    .sort();
}

describe('every crisis_signals writer is accounted for', () => {
  it('no TTL policy covers crisis_signals: the records are kept permanently', () => {
    const { fieldOverrides } = JSON.parse(
      readFileSync(join(ROOT, 'firestore.indexes.json'), 'utf8')
    ) as { fieldOverrides: Array<{ collectionGroup: string; ttl?: boolean }> };
    expect(fieldOverrides.filter((o) => o.collectionGroup === 'crisis_signals' && o.ttl)).toEqual(
      []
    );
  });

  it('the files that name the collection or copy record trees are exactly the inventory', () => {
    expect(inventoried()).toEqual(Object.keys(INVENTORY).sort());
  });
});

// ---- The writer -------------------------------------------------------------------------------

const NOW = new Date('2026-11-02T17:00:00Z');
const SIGNALS = {
  suicidalIdeation: true,
  selfHarmIndicators: false,
  traumaIndicators: false,
  persistentDepression: false,
  anxietyDisorder: false,
  dangerToOthers: false,
  domesticViolence: false,
  severity: 9,
} as never;
// A fictional line, written for this test
const SAID = "I don't want to be here anymore";

async function written(userId: string): Promise<Record<string, unknown>[]> {
  await logCrisisSignal(userId, SIGNALS, SAID, 'session-w-1', 4);
  return [...docs.entries()]
    .filter(([path]) => path.startsWith(`bogle_users/${userId}/crisis_signals/`))
    .map(([, doc]) => doc);
}

beforeEach(() => {
  docs.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('logCrisisSignal', () => {
  it.each(['AbCdEfGhIjKlMnOpQrStUvWxYz12', 'device:phone-1', 'family_sp1'])(
    'a member (%s) keeps words and session, and no expireAt',
    async (userId) => {
      const [doc, ...more] = await written(userId);
      expect(more).toEqual([]);
      expect(doc).not.toHaveProperty('expireAt');
      expect(doc).toMatchObject({ transcriptSnippet: SAID, sessionId: 'session-w-1', turn: 4 });
    }
  );

  it.each(['anon:call-7f3a', 'device:demo_1730000000_ab12'])(
    'a non-member (%s) keeps tier and time only, and no expireAt',
    async (userId) => {
      const [doc, ...more] = await written(userId);
      expect(more).toEqual([]);
      for (const field of Object.keys(doc!)) {
        expect(NON_MEMBER_SIGNAL_FIELDS as readonly string[], field).toContain(field);
      }
      expect(doc).not.toHaveProperty('sessionId');
      expect(doc).not.toHaveProperty('transcriptSnippet');
      expect(doc).not.toHaveProperty('expireAt');
      expect(doc!.turn).toBe(4);
      expect(doc!.timestamp).toBe(NOW.toISOString());
      expect((doc!.signals as { severity: number }).severity).toBe(9);
    }
  );

  it('a shared placeholder id stores nothing', async () => {
    expect(await written('anon:')).toEqual([]);
    expect(docs.size).toBe(0);
  });
});

describe('the same-call note (CRISIS_SAME_CALL_NOTE_FADES) without a stored session id', () => {
  // No non-member id shape is proven fresh per call (a given anon: session_id and an unsigned
  // device_id can both come back), so a record without a session id always counts as from an
  // earlier call: the note keeps showing, never fades early.
  const record = (userId: string) =>
    ({
      userId,
      timestamp: NOW.toISOString(),
      escalationType: 'crisis_immediate',
      turn: 2,
    }) as never;

  it.each(['anon:call-7f3a', 'device:demo_1730000000_ab12'])(
    "a non-member's record (%s) counts as an earlier call, so it shows past 3 turns",
    (userId) => {
      expect(followUpCrisis([record(userId)], 'session-w-1', 20)).toBeDefined();
    }
  );

  it("a member's record without a session id counts as an earlier call, as on main", () => {
    expect(
      followUpCrisis([record('AbCdEfGhIjKlMnOpQrStUvWxYz12')], 'session-w-1', 20)
    ).toBeDefined();
  });

  it('a record from this call (same session id) fades after 3 turns', () => {
    const same = {
      ...(record('AbCdEfGhIjKlMnOpQrStUvWxYz12') as object),
      sessionId: 'session-w-1',
    };
    expect(followUpCrisis([same as never], 'session-w-1', 5)).toBeDefined();
    expect(followUpCrisis([same as never], 'session-w-1', 6)).toBeUndefined();
  });
});
