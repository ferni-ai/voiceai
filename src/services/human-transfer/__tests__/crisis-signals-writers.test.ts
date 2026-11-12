/**
 * Every crisis record is kept permanently, a member's or not (2026-11-11). So:
 *  - no crisis_signals write carries an expireAt, and no TTL policy covers the collection (one
 *    would silently delete a caller's 14-day crisis quiet and their crisis history);
 *  - no record holds words (2026-11-12). A non-member's (anon:, onbehalf:, try-first
 *    device:demo_) holds only NON_MEMBER_SIGNAL_FIELDS; a member's adds its session id;
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

const { followUpCrisis, logCrisisSignal } = await import('../index.js');

/** Every field a non-member's record may hold: the time, flags and severity, and caller turn. */
const NON_MEMBER_SIGNAL_FIELDS: readonly string[] = ['timestamp', 'signals', 'turn'];
const { crisisFromSignal } = await import('../crisis-signals.js');

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
    'a member (%s) keeps the session, no words and no expireAt',
    async (userId) => {
      const [doc, ...more] = await written(userId);
      expect(more).toEqual([]);
      for (const field of Object.keys(doc!)) {
        expect([...NON_MEMBER_SIGNAL_FIELDS, 'sessionId'], field).toContain(field);
      }
      expect(doc).not.toHaveProperty('expireAt');
      expect(doc).toMatchObject({ sessionId: 'session-w-1', turn: 4 });
    }
  );

  it.each([
    'AbCdEfGhIjKlMnOpQrStUvWxYz12',
    'device:phone-1',
    'family_sp1',
    'anon:call-7f3a',
    'device:demo_1730000000_ab12',
  ])("no record (%s) carries the caller's words", async (userId) => {
    const [doc] = await written(userId);
    expect(doc).toBeDefined();
    expect(doc).not.toHaveProperty('transcriptSnippet');
    expect(JSON.stringify(doc)).not.toContain(SAID.slice(0, 12));
  });

  it.each(['anon:call-7f3a', 'device:demo_1730000000_ab12'])(
    'a non-member (%s) keeps tier and time only, and no expireAt',
    async (userId) => {
      const [doc, ...more] = await written(userId);
      expect(more).toEqual([]);
      for (const field of Object.keys(doc!)) {
        expect(NON_MEMBER_SIGNAL_FIELDS, field).toContain(field);
      }
      expect(doc).not.toHaveProperty('sessionId');
      expect(doc).not.toHaveProperty('transcriptSnippet');
      expect(doc).not.toHaveProperty('expireAt');
      expect(doc!.turn).toBe(4);
      expect(doc!.timestamp).toBe(NOW.toISOString());
      expect((doc!.signals as { severity: number }).severity).toBe(9);
    }
  );

  it.each(['AbCdEfGhIjKlMnOpQrStUvWxYz12', 'anon:call-7f3a'])(
    'the ignored transcript argument (%s) is stored nowhere',
    async (userId) => {
      const unused = 'fictional-unused-value-q9z'; // written for this test
      docs.clear();
      await logCrisisSignal(userId, SIGNALS, unused, 'session-u-1', 4);
      const [doc, ...more] = [...docs.values()];
      expect(more).toEqual([]);
      expect(doc).toBeDefined();
      expect(Object.values(doc!)).not.toContain(unused);
      expect(doc!.sessionId).not.toBe(unused);
      expect([undefined, 'session-u-1']).toContain(doc!.sessionId);
      expect(JSON.stringify(doc)).not.toContain(unused);
    }
  );

  it('a shared placeholder id stores nothing', async () => {
    expect(await written('anon:')).toEqual([]);
    expect(docs.size).toBe(0);
  });
});

describe('the same-call note (CRISIS_SAME_CALL_NOTE_FADES)', () => {
  const NON_MEMBERS = ['anon:call-7f3a', 'device:demo_1730000000_ab12', 'onbehalf:call-2b'];
  const MEMBER = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';

  /** Log on `sessionId` at caller turn 2, and read the record back as the follow-up sees it. */
  async function loggedOn(userId: string, sessionId: string) {
    docs.clear();
    await logCrisisSignal(userId, SIGNALS, SAID, sessionId, 2);
    const [[, doc]] = [...docs.entries()].filter(([path]) => path.includes('/crisis_signals/'));
    return { doc, record: crisisFromSignal(userId, doc)! };
  }

  it.each(NON_MEMBERS)(
    "a non-member's note (%s) fades after 3 turns on the call that wrote it, like a member's",
    async (userId) => {
      const call = `session-fade-${userId}`;
      const { doc, record } = await loggedOn(userId, call);
      expect(doc).not.toHaveProperty('sessionId'); // the call is known from memory, not stored
      expect(followUpCrisis([record], call, 5)).toBeDefined();
      expect(followUpCrisis([record], call, 6)).toBeUndefined();
    }
  );

  it.each(NON_MEMBERS)(
    "a non-member's note (%s) from an earlier call keeps showing",
    async (userId) => {
      const { record } = await loggedOn(userId, `session-earlier-${userId}`);
      expect(followUpCrisis([record], `session-now-${userId}`, 20)).toBeDefined();
    }
  );

  it.each(NON_MEMBERS)(
    "fail-safe: a non-member's record this process did not write (%s) never fades early",
    (userId) => {
      // A restart mid-call, or another process wrote it: unknown counts as an earlier call
      const unknown = {
        userId,
        timestamp: NOW.toISOString(),
        escalationType: 'crisis_immediate',
        turn: 2,
      };
      expect(followUpCrisis([unknown as never], 'session-unknown-1', 20)).toBeDefined();
    }
  );

  it("another caller's record at the same moment is not this call's", async () => {
    const { record } = await loggedOn('anon:call-first', 'session-shared-1');
    const other = { ...record, userId: 'anon:call-second' };
    expect(followUpCrisis([record], 'session-shared-1', 6)).toBeUndefined();
    expect(followUpCrisis([other], 'session-shared-1', 20)).toBeDefined();
  });

  it("flag off: a non-member's record is as on main (no turn, nothing remembered)", async () => {
    vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', 'off');
    const { doc, record } = await loggedOn('anon:call-off', 'session-off-1');
    expect(Object.keys(doc).sort()).toEqual(['signals', 'timestamp']);
    expect(followUpCrisis([record], 'session-off-1', 20)).toBeDefined();
  });

  it.each(['on', 'off'])("flag %s: a member's note is as on main", async (flag) => {
    vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', flag);
    const { doc, record } = await loggedOn(MEMBER, 'session-m-1');
    expect(doc.sessionId).toBe('session-m-1');
    expect(followUpCrisis([record], 'session-m-2', 20)).toBeDefined(); // an earlier call
    expect(followUpCrisis([record], 'session-m-1', 5)).toBeDefined();
    // On, it fades after 3 turns by its stored session; off, the doc has no turn and stays
    expect(followUpCrisis([record], 'session-m-1', 6) === undefined).toBe(flag === 'on');
  });

  it("a member's record without a session id counts as an earlier call, as on main", () => {
    const older = {
      userId: MEMBER,
      timestamp: NOW.toISOString(),
      escalationType: 'crisis_immediate',
      turn: 2,
    };
    expect(followUpCrisis([older as never], 'session-w-1', 20)).toBeDefined();
  });
});
