/**
 * The live crisis writer (logCrisisSignal) on the Firestore emulator:
 * - a shared placeholder id, plain or disguised, writes nothing anywhere;
 * - a non-member (anon:<id>) gets a doc with no words and an expireAt Timestamp 90 days
 *   out, the field a crisis_signals TTL policy deletes on;
 * - a member's doc is unchanged (snippet, no expiry);
 * - the crisis follow-up read (hadRecentCrisis) finds both, so the same call still follows up.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// The shared setup fakes Firestore for every test; here the reads and writes reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
const real = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => real.db,
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-crisis-signals';

let db: Firestore;
beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  real.db = db;
});

const LINE = "I want to kill myself. I've got the pills right here.";
const NINETY_DAYS_MS = 90 * 86_400_000;
const run = Math.random().toString(36).slice(2, 8);

describe.skipIf(!emulator)('crisis_signals writer on the emulator', () => {
  const signalsOf = async (userId: string) =>
    (await db.collection('bogle_users').doc(userId).collection('crisis_signals').get()).docs;

  it('a placeholder id, plain or disguised, writes nothing', async () => {
    const { detectCrisisSignals, logCrisisSignal } = await import('../index.js');
    const ids = ['unknown', 'anonymous', 'anon:', '​unknown', 'ｕｎｋｎｏｗｎ'];
    for (const id of ids) await logCrisisSignal(id, detectCrisisSignals(LINE), LINE, 's');
    for (const id of ids) expect(await signalsOf(id)).toHaveLength(0);
  });

  it('a non-member doc holds no words and a 90-day expireAt Timestamp; a member doc is unchanged', async () => {
    const { detectCrisisSignals, hadRecentCrisis, logCrisisSignal } = await import('../index.js');
    const anon = `anon:emu-${run}`;
    const member = `uid-emu-${run}`;
    const t0 = Date.now();
    await logCrisisSignal(anon, detectCrisisSignals(LINE), LINE, `session-${run}`);
    await logCrisisSignal(member, detectCrisisSignals(LINE), LINE, `session-${run}`);

    const [anonDoc] = await signalsOf(anon);
    const stored = anonDoc.data();
    expect(Object.keys(stored).sort()).toEqual(['expireAt', 'sessionId', 'signals', 'timestamp']);
    expect(JSON.stringify(stored)).not.toMatch(/pills|kill/i);
    expect(stored.expireAt).toBeInstanceOf(Timestamp);
    const expireAt = (stored.expireAt as Timestamp).toMillis();
    expect(expireAt).toBeGreaterThanOrEqual(t0 + NINETY_DAYS_MS);
    expect(expireAt).toBeLessThanOrEqual(Date.now() + NINETY_DAYS_MS);

    const [memberDoc] = await signalsOf(member);
    expect(memberDoc.get('transcriptSnippet')).toBe(LINE.slice(0, 200));
    expect(memberDoc.get('expireAt')).toBeUndefined();

    expect((await hadRecentCrisis(anon)).hasCrisis).toBe(true);
    expect((await hadRecentCrisis(member)).hasCrisis).toBe(true);
  });
});
