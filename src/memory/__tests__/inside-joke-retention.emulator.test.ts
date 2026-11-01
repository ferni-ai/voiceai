/**
 * Inside-joke retention on the Firestore emulator, for the two stores #2971 missed (Seth,
 * 2026-10-26: 80 characters of the caller's words, a year to live, in the export and gone with
 * delete-my-data): bogle_users/{uid}/human_signals/inside_jokes (persistHumanSignals, from the
 * session-end STM promotion) and the insideJokes of bogle_users/{uid}/summaries (summarizeWithLLM
 * then FirestoreStore.saveSummary). The real writers write; the stored words are cut to 80 and
 * expire a year out; the real readers skip an expired joke; the next save (human_signals) and the
 * after-call sweep (summaries) take it out; the real export carries both and the real erasure
 * leaves none of the person's and all of another's. Synthetic uids and words. Skips unless
 * FIRESTORE_EMULATOR_HOST is set:
 *
 *   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8794 &
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8794 GCLOUD_PROJECT=demo-inside-jokes \
 *     pnpm vitest run -c vitest.config.unit.ts <this file>
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MOMENT_TTL_MS, MOMENT_WORDS_MAX } from '../../utils/shared-moment-retention.js';
import type { InsideJoke } from '../../types/human-memory.js';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async () => null),
}));
// Recall and the sweep read Firestore through this module (the shared setup fakes it): the emulator's
vi.mock('../../utils/firestore-utils.js', async () => {
  const real = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  return { ...real, getFirestoreDb: () => getAdminFirestore(), recordDegradation: () => undefined };
});

process.env.GCLOUD_PROJECT ??= 'demo-inside-jokes';
const DAY = 24 * 60 * 60 * 1000;
const SESSION = { sessionId: 'session-1' }; // what onSessionEnd passes
const AFTER_THE_CUT = 'county line';
/** n characters of words, never ending on a space */
const words = (n: number) => 'the herons and the brother '.repeat(40).slice(0, n - 1) + 'z';
const SAID = `haha the mushroom police ${words(420)} we never got past the ${AFTER_THE_CUT}`;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CASES: Record<string, string> = {
  c79: words(79),
  c80: words(80),
  c81: words(81),
  c500: `${words(488)} ${AFTER_THE_CUT}`,
  emoji: `${'a'.repeat(78)}😂 and the rest`, // the emoji straddles the cut
};

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('inside-joke retention (emulator)', () => {
  let db: Firestore;
  let n = 0;
  const uid = () => `IJRet${++n}${Math.random().toString(36).slice(2, 8)}`;
  const jokesDoc = (u: string) => db.doc(`bogle_users/${u}/human_signals/inside_jokes`);
  const storedJokes = async (u: string) =>
    ((await jokesDoc(u).get()).get('items') ?? []) as Array<Record<string, unknown>>;
  const summaries = (u: string) => db.collection('bogle_users').doc(u).collection('summaries');
  const joke = (id: string, text: string, expireAt?: Date): InsideJoke & { expireAt?: Date } => ({
    id,
    reference: text,
    origin: text,
    originatedAt: new Date(),
    usageCount: 1,
    status: 'fresh',
    ...(expireAt && { expireAt }),
  });
  const yearOut = (ms: number, before: number) => {
    expect(ms).toBeGreaterThanOrEqual(before + MOMENT_TTL_MS);
    expect(ms).toBeLessThanOrEqual(Date.now() + MOMENT_TTL_MS);
  };

  beforeAll(async () => {
    const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
    db = getAdminFirestore();
  });

  /** The session-end writer's jokes, from the real extractor, and a call summary, for u */
  async function writeBoth(u: string): Promise<void> {
    const { detectInsideJokePotential } =
      await import('../signals/human-signal-extractor/growth-challenges.js');
    const extracted = detectInsideJokePotential([
      { role: 'user', content: `lol remember when ${SAID}`, timestamp: new Date() },
      { role: 'assistant', content: 'ha, that again', timestamp: new Date() },
    ] as never);
    expect(extracted).toHaveLength(1);
    const { persistHumanSignals } = await import('../storage/human-signal-persistence.js');
    expect((await persistHumanSignals(u, { insideJokes: extracted }, SESSION)).errors).toEqual([]);

    const { summarizeWithLLM } = await import('../operations/summarizer.js');
    const turns = [
      { role: 'user' as const, content: SAID },
      { role: 'assistant' as const, content: 'the mushroom police strike again' },
    ];
    const reply = {
      mainTopics: ['cooking'],
      keyPoints: ['made risotto'],
      emotionalArc: 'light',
      openThreads: [],
      followUps: [],
      userConcerns: [],
      relationshipProgress: 'joked',
      insideJokes: [{ bit: 'the mushroom police', quote: SAID, speaker: 'user' }],
    };
    const summary = await summarizeWithLLM(`s-${u}`, turns, async () => JSON.stringify(reply), {
      generateEmbedding: false,
    });
    const { FirestoreStore } = await import('../storage/firestore-store.js');
    await new FirestoreStore({ projectId: process.env.GCLOUD_PROJECT }).saveSummary(u, summary);
  }

  it('human_signals keeps 80 characters of their words and an expireAt a year out', async () => {
    const u = uid();
    const before = Date.now();
    const { persistHumanSignals } = await import('../storage/human-signal-persistence.js');
    const jokes = Object.entries(CASES).map(([id, text]) => joke(id, text));
    expect((await persistHumanSignals(u, { insideJokes: jokes }, SESSION)).errors).toEqual([]);

    const byId: Record<string, Record<string, unknown>> = Object.fromEntries(
      (await storedJokes(u)).map((j) => [j.id, j])
    );
    for (const field of ['reference', 'origin']) {
      expect(byId.c79[field]).toBe(CASES.c79);
      expect(byId.c80[field]).toBe(CASES.c80);
      expect((byId.c81[field] as string).length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
      expect(byId.c81[field]).toMatch(/…$/); // cut on a word, marked
      const cut = byId.c500[field] as string;
      expect(cut.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
      expect(cut.length).toBeGreaterThan(MOMENT_WORDS_MAX / 2);
      expect(cut).not.toContain(AFTER_THE_CUT);
      const emoji = byId.emoji[field] as string;
      expect(emoji.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
      expect(emoji).not.toMatch(LONE_SURROGATE);
    }
    for (const j of Object.values(byId)) {
      yearOut((j.expireAt as { toMillis: () => number }).toMillis(), before);
    }
    // The mirror the next session reads holds the cut words too
    const profile = (await db.doc(`bogle_users/${u}/human_memory/profile`).get()).data()!;
    expect(JSON.stringify(profile.insideJokes)).not.toContain(AFTER_THE_CUT);
  }, 30_000);

  it('human_signals: readers skip an expired joke and the next save removes it', async () => {
    const u = uid();
    await jokesDoc(u).set({
      items: [
        joke('expired', 'the expired quokka', new Date(Date.now() - DAY)),
        joke('live', 'the live heron', new Date(Date.now() + DAY)),
        joke('legacy', 'the joke from before'), // no expireAt: kept as it is
      ],
    });
    const { getPersistedHumanSignals, persistHumanSignals } =
      await import('../storage/human-signal-persistence.js');
    const read = await getPersistedHumanSignals(u);
    expect(read.insideJokes!.map((j) => j.id)).toEqual(['live', 'legacy']);

    // A save with no new joke still drops the expired one
    const dream = { id: 'd1', content: 'sail somewhere warm' };
    expect((await persistHumanSignals(u, { dreams: [dream as never] }, SESSION)).errors).toEqual(
      []
    );
    expect((await storedJokes(u)).map((j) => j.id)).toEqual(['live', 'legacy']);
    const profile = (await db.doc(`bogle_users/${u}/human_memory/profile`).get()).data()!;
    expect(JSON.stringify(profile.insideJokes)).not.toContain('quokka');
  }, 30_000);

  it('summaries keep 80 characters of the line, a year to live, and lose a bit once it expires', async () => {
    const u = uid();
    const someone = uid();
    const before = Date.now();
    await writeBoth(u);
    await writeBoth(someone);

    const [doc] = (await summaries(u).get()).docs;
    const [bit] = doc.get('insideJokes') as Array<Record<string, string>>;
    expect(bit.quote.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(bit.quote.startsWith('haha the mushroom police')).toBe(true);
    expect(JSON.stringify(doc.data())).not.toContain(AFTER_THE_CUT);
    yearOut(Date.parse(bit.expireAt), before);
    expect(doc.get('insideJokesExpireAt')).toBe(bit.expireAt);

    const { loadRecallSnapshot } = await import('../recall/session-recall.js');
    const { firestoreRecallStore } =
      await import('../../agents/multi-agent/recall-firestore-store.js');
    expect((await loadRecallSnapshot(firestoreRecallStore, u)).insideJokes).toHaveLength(1);

    // A year on (the same doc, its bit past its expiry), next to a live bit and a pre-policy summary
    const past = new Date(Date.now() - DAY).toISOString();
    const live = {
      bit: 'the heron parade',
      quote: 'haha the heron parade again',
      speaker: 'user',
      expireAt: new Date(Date.now() + DAY).toISOString(),
    };
    await doc.ref.update({ insideJokes: [{ ...bit, expireAt: past }, live] });
    await doc.ref.update({ insideJokesExpireAt: past });
    const legacy = { bit: 'the old bit', quote: 'the old bit from before', speaker: 'user' };
    await summaries(u)
      .doc('legacy')
      .set({ timestamp: '2025-01-01T00:00:00.000Z', insideJokes: [legacy] });
    const recalled = (await loadRecallSnapshot(firestoreRecallStore, u)).insideJokes!;
    expect(recalled.map((j) => j.bit).sort()).toEqual(['the heron parade', 'the old bit']);

    // The after-call sweep, registered as the job executor registers every task, runs once the
    // next call's summary is saved
    const tasks = await import('../../services/session/after-call-tasks.js');
    await import('../../agents/after-call-register.js');
    expect(tasks.registeredAfterCallTasks()).toContain('summary-joke-retention');
    tasks.runAfterCallTasks({
      userId: u,
      sessionId: `next-${u}`,
      turns: [],
      startedAt: new Date(),
    });
    expect(await tasks.drainAfterCallTasks(20_000)).toBe(0);
    const swept = (await doc.ref.get()).data()!;
    expect(swept.insideJokes).toEqual([live]);
    expect(swept.insideJokesExpireAt).toBe(live.expireAt);
    expect((await summaries(u).doc('legacy').get()).get('insideJokes')).toEqual([legacy]);

    // Its last bit expired: the field goes; another person's summary is not touched
    await doc.ref.update({ insideJokes: [{ ...live, expireAt: past }], insideJokesExpireAt: past });
    const { dropExpiredSummaryJokes } = await import('../storage/summary-joke-retention.js');
    expect(await dropExpiredSummaryJokes(u)).toBe(1);
    const emptied = (await doc.ref.get()).data()!;
    expect(emptied).not.toHaveProperty('insideJokes');
    expect(emptied).not.toHaveProperty('insideJokesExpireAt');
    expect(emptied.sessionId).toBe(`s-${u}`); // the rest of the summary stays
    const [theirs] = (await summaries(someone).get()).docs;
    expect(theirs.get('insideJokes')).toHaveLength(1);
  }, 60_000);

  it("the export carries both stores; erasure leaves none of the person's and all of another's", async () => {
    const u = uid();
    const someone = uid();
    await writeBoth(u);
    await writeBoth(someone);
    const { exportUserRecords } = await import('../../services/platform/user-records-export.js');
    const out = (await exportUserRecords(u, undefined, db)) as Record<string, unknown>;
    const signals = JSON.stringify(out['bogle_users/{uid}/human_signals']);
    expect(signals).toContain('the mushroom police'); // their words
    expect(signals).toContain('expireAt');
    const summary = JSON.stringify(out['bogle_users/{uid}/summaries']);
    expect(summary).toContain('haha the mushroom police');
    expect(summary).toContain('insideJokesExpireAt');
    expect(JSON.stringify(out)).not.toContain(someone);

    const { eraseUserRecord } = await import('../../services/platform/erase-user-record.js');
    await eraseUserRecord(u, db);
    expect((await jokesDoc(u).get()).exists).toBe(false);
    expect((await summaries(u).get()).empty).toBe(true);
    expect((await jokesDoc(someone).get()).exists).toBe(true);
    expect((await summaries(someone).get()).size).toBe(1);
  }, 60_000);
});
