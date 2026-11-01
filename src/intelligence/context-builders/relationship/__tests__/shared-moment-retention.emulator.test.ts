/**
 * Shared-moment retention on the Firestore emulator (Seth, 2026-10-26: 80 characters of the
 * caller's words, a year to live, in the export and gone with delete-my-data). The real writers
 * of every store that keeps them (shared_moments twice, the relationship engine's doc, the trust
 * inside-jokes doc) write; the stored docs keep 80 characters and an expireAt a year out; the
 * readers drop an expired moment and keep a live one; the real export carries them and the real
 * erasure leaves none of the person's and all of another's. Synthetic docs only. Skips unless
 * FIRESTORE_EMULATOR_HOST is set:
 *
 *   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8793 &
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8793 GCLOUD_PROJECT=demo-shared-moments \
 *     pnpm vitest run -c vitest.config.unit.ts <this file>
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MOMENT_TTL_MS, MOMENT_WORDS_MAX } from '../../../../utils/shared-moment-retention.js';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async () => null),
}));
// inside-joke-memory reads Firestore through this module (the shared setup fakes it): the emulator's
vi.mock('../../../../services/superhuman/firestore-utils.js', async () => {
  const real = await vi.importActual<typeof import('../../../../utils/firestore-utils.js')>(
    '../../../../utils/firestore-utils.js'
  );
  const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
  return { ...real, getFirestoreDb: () => getAdminFirestore(), recordDegradation: () => undefined };
});
vi.mock('../../../../services/data-layer/hooks/trust-hooks.js', () => ({
  onInsideJokeChange: () => undefined, // the semantic index isn't under test
}));

process.env.GCLOUD_PROJECT ??= 'demo-shared-moments';
const DAY = 24 * 60 * 60 * 1000;
const SAID =
  'one time my brother and I drove all the way to the coast just to see the herons, and the ' +
  'car broke down twice before we even got past the county line';
const AFTER_THE_CUT = 'county line';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('shared-moment retention (emulator)', () => {
  let db: Firestore;
  let n = 0;
  const uid = () => `ShMoRet${++n}${Math.random().toString(36).slice(2, 8)}`;
  const moments = (u: string) => db.collection('bogle_users').doc(u).collection('shared_moments');
  const docsOf = async (u: string) => (await moments(u).get()).docs.map((d) => d.data());
  /** A Timestamp (what a TTL policy reads) or, inside the engine's doc, one that went through JSON */
  const yearOut = (at: unknown, before: number) => {
    const t = at as { toMillis?: () => number; _seconds?: number; _nanoseconds?: number };
    const ms = t.toMillis ? t.toMillis() : t._seconds! * 1000 + Math.floor(t._nanoseconds! / 1e6);
    expect(ms).toBeGreaterThanOrEqual(before + MOMENT_TTL_MS);
    expect(ms).toBeLessThanOrEqual(Date.now() + MOMENT_TTL_MS);
  };

  beforeAll(async () => {
    const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
    db = getAdminFirestore();
  });

  /** Writes through all four writers for u; resolves when every store holds its moment */
  async function writeAll(u: string): Promise<void> {
    await db.collection('bogle_users').doc(u).set({ totalConversations: 4 });
    const { recordSharedMoment } = await import('../shared-moments.js');
    await recordSharedMoment(u, {
      type: 'running_gag',
      content: SAID,
      whatTheySaid: SAID,
      triggers: ['heron'],
    });
    const ijm = await import('../../../../services/superhuman/inside-joke-memory.js');
    await ijm.recordSharedMoment(u, 'memorable_quote', SAID, SAID, ['heron'], SAID);
    const { RelationshipEngine } = await import('../../../relationship/engine.js');
    const { saveRelationshipMemory } = await import('../../../relationship/persistence.js');
    const engine = new RelationshipEngine(u, 'ferni');
    engine.recordMoment('breakthrough', SAID, { userPhrase: SAID });
    await saveRelationshipMemory(engine.getMemory() as never);
    const { detectCallbackMoment, exportInsideJokesProfile } =
      await import('../../../../services/trust-systems/inside-jokes.js');
    detectCallbackMoment(u, SAID);
    const { writeTrustDoc } = await import('../../../../services/trust-systems/trust-doc.js');
    expect(await writeTrustDoc(u, 'inside_jokes', exportInsideJokesProfile(u))).toBe(true);
  }

  it('every writer keeps 80 characters of what they said and an expireAt a year out', async () => {
    const u = uid();
    const before = Date.now();
    await writeAll(u);

    const stored = await docsOf(u);
    expect(stored).toHaveLength(2);
    const gag = stored.find((m) => m.type === 'running_gag')!;
    expect((gag.origin as { whatTheySaid: string }).whatTheySaid.length).toBeLessThanOrEqual(
      MOMENT_WORDS_MAX
    );
    expect((gag.content as string).length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(typeof (gag.expireAt as { toMillis?: unknown }).toMillis).toBe('function');
    yearOut(gag.expireAt, before);
    const quote = stored.find((m) => m.type === 'memorable_quote')!;
    for (const f of ['essence', 'context', 'callbackPhrase'])
      expect((quote[f] as string).length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(typeof (quote.expireAt as { toMillis?: unknown }).toMillis).toBe('function');
    yearOut(quote.expireAt, before);
    expect(JSON.stringify(stored)).not.toContain(AFTER_THE_CUT);

    const rel = (await db.doc(`bogle_users/${u}/relationships/ferni`).get()).data()!;
    const [relMoment] = rel.sharedMoments as Array<Record<string, unknown>>;
    expect((relMoment.userPhrase as string).length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect((relMoment.summary as string).length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    yearOut(relMoment.expireAt, before);
    expect(JSON.stringify(rel)).not.toContain(AFTER_THE_CUT);

    const trust = (await db.doc(`bogle_users/${u}/trust_profiles/inside_jokes`).get()).data()!;
    const profile = JSON.parse(trust.data as string) as { moments: Array<Record<string, unknown>> };
    expect(profile.moments).toHaveLength(1);
    expect(Date.parse(profile.moments[0].expireAt as string)).toBeGreaterThanOrEqual(
      before + MOMENT_TTL_MS
    );
    expect(trust.data).not.toContain(AFTER_THE_CUT);
  }, 30_000);

  it('the readers drop an expired moment (the TTL deletes late) and keep a live one', async () => {
    const u = uid();
    await db.collection('bogle_users').doc(u).set({ totalConversations: 6 });
    const at = (ms: number) => new Date(Date.now() + ms);
    const gag = (said: string, trigger: string, expireAt: Date) => ({
      type: 'running_gag',
      content: `the ${trigger} thing`,
      origin: { whatTheySaid: said },
      triggers: [trigger],
      callbackReception: 'positive',
      createdAt: new Date(Date.now() - 400 * DAY).toISOString(),
      expireAt,
    });
    await moments(u)
      .doc('gone')
      .set(gag('the expired quokka words', 'quokka', at(-DAY)));
    await moments(u)
      .doc('live')
      .set(gag('the live heron words', 'heron', at(DAY)));
    await moments(u)
      .doc('quote-gone')
      .set({
        type: 'memorable_quote',
        essence: 'expired quote',
        resonance: 0.9,
        createdAt: 1,
        expireAt: at(-DAY),
      });
    await moments(u)
      .doc('quote-live')
      .set({
        type: 'memorable_quote',
        essence: 'live quote',
        resonance: 0.8,
        createdAt: 2,
        expireAt: at(DAY),
      });

    const { buildDeepRelationshipContext } = await import('../deep-relationship.js');
    const context = JSON.stringify(
      await buildDeepRelationshipContext({
        userText: 'ha, remember the quokka and the heron?',
        userData: { turnCount: 5 },
        services: { userId: u },
      } as never)
    );
    expect(context).toContain('the live heron words');
    expect(context).not.toContain('the expired quokka words');
    const { loadSharedMoments } =
      await import('../../../../services/superhuman/inside-joke-memory.js');
    expect((await loadSharedMoments(u)).map((m) => m.essence).filter(Boolean)).toEqual([
      'live quote',
    ]);

    const { saveRelationshipMemory, loadRelationshipMemory } =
      await import('../../../relationship/persistence.js');
    const { RelationshipEngine } = await import('../../../relationship/engine.js');
    const engine = new RelationshipEngine(u, 'ferni');
    engine.recordMoment('laughter', 'the live one');
    await saveRelationshipMemory(engine.getMemory() as never);
    const ref = db.doc(`bogle_users/${u}/relationships/ferni`);
    const [live] = (await ref.get()).get('sharedMoments') as Array<Record<string, unknown>>;
    // The save stores Timestamps through JSON ({_seconds, _nanoseconds}): an expired one as it would be
    const expireAt = {
      ...(live.expireAt as object),
      _seconds: Math.floor((Date.now() - DAY) / 1000),
    };
    await ref.update({
      sharedMoments: [{ ...live, id: 'expired', summary: 'expired one', expireAt }, live],
    });
    const read = await loadRelationshipMemory(u, 'ferni');
    expect(read!.sharedMoments.map((m) => m.summary)).toEqual(['the live one']);
    // A loaded moment keeps its expiry: one that lost it would read as pre-policy, kept forever
    expect(read!.sharedMoments[0].expireAt?.getTime()).toBe(
      (live.expireAt as { _seconds: number })._seconds * 1000 +
        Math.floor((live.expireAt as { _nanoseconds: number })._nanoseconds / 1e6)
    );
    await saveRelationshipMemory(read!); // the next save leaves the expired one out
    const saved = (await ref.get()).data()!;
    expect(JSON.stringify(saved)).not.toContain('expired one');
    const [kept] = saved.sharedMoments as Array<Record<string, unknown>>;
    expect(kept.expireAt).toEqual(live.expireAt);
  }, 30_000);

  it("the export carries the person's moments; erasure leaves none of theirs and all of another's", async () => {
    const u = uid();
    const someone = uid();
    await writeAll(u);
    await writeAll(someone);
    const { exportUserRecords } =
      await import('../../../../services/platform/user-records-export.js');
    const out = (await exportUserRecords(u, undefined, db)) as Record<string, unknown>;
    const rows = out['bogle_users/{uid}/shared_moments'] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.type).sort()).toEqual(['memorable_quote', 'running_gag']);
    for (const row of rows) {
      expect(JSON.stringify(row)).toContain('one time my brother'); // their words
      expect(row.createdAt).toBeDefined();
      expect(row.expireAt).toBeDefined();
    }
    const rel = JSON.stringify(out['bogle_users/{uid}/relationships']);
    expect(rel).toContain('one time my brother');
    expect(rel).toContain('expireAt');
    expect(JSON.stringify(out['bogle_users/{uid}/trust_profiles'])).toContain(
      'one time my brother'
    );
    expect(JSON.stringify(out)).not.toContain(someone);

    const { eraseUserRecord } = await import('../../../../services/platform/erase-user-record.js');
    await eraseUserRecord(u, db);
    expect(await docsOf(u)).toEqual([]);
    expect((await db.doc(`bogle_users/${u}/relationships/ferni`).get()).exists).toBe(false);
    expect((await db.doc(`bogle_users/${u}/trust_profiles/inside_jokes`).get()).exists).toBe(false);
    expect(await docsOf(someone)).toHaveLength(2);
    expect((await db.doc(`bogle_users/${someone}/relationships/ferni`).get()).exists).toBe(true);
    expect((await db.doc(`bogle_users/${someone}/trust_profiles/inside_jokes`).get()).exists).toBe(
      true
    );
  }, 60_000);
});
