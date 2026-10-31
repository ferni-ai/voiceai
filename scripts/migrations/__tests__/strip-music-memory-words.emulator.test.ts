/**
 * bogle_users/{uid}/music_learning/memories against the Firestore emulator, with the real
 * @google-cloud/firestore client: the one-off job strips the caller's words from old music
 * memories. The dry run counts and writes nothing; --apply leaves no piece of the words and keeps
 * every label; a re-run writes 0. Synthetic docs only. Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   firebase emulators:exec --only firestore --project demo-music \
 *     "pnpm vitest run -c vitest.config.unit.ts scripts/migrations/__tests__/strip-music-memory-words.emulator.test.ts"
 */
import { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, PARTIALS, SENTINEL } from '../../../src/tests/helpers/snippet-leak.js';
import { main, strip, type MusicDb } from '../strip-music-memory-words.js';

const T = '2026-09-01T10:00:00.000Z';
const PEOPLE = 3;
const memory = (id: string, evidence: Record<string, unknown>) => ({
  id,
  createdAt: T,
  emotionalContext: { state: 'stressed', intensity: 0.8 },
  music: { trackName: 'synthetic track', wasAmbient: true },
  evidence,
  effectiveTransition: 'presence',
  confidence: 0.8,
  tags: ['comfort', 'ambient'],
});
const LABELS = { emotionalShift: 'positive', continuedSession: true, explicitPositive: true };

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('music memories on the emulator', () => {
  let db: Firestore;
  let out: string[];

  /** Every music_learning document, path -> data and update time. */
  const all = async () => {
    const snap = await db.collectionGroup('music_learning').get();
    return new Map(
      snap.docs.map((d) => [d.ref.path, { data: d.data(), at: d.updateTime.toMillis() }])
    );
  };

  beforeEach(async () => {
    db = new Firestore({
      projectId: `demo-music-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    process.exitCode = undefined;
    // Per person: one memory with the words, one with a nested slice, one clean; and a profile
    // doc the job never touches. No parent document, as the persistence layer never wrote one.
    for (let i = 0; i < PEOPLE; i++) {
      const col = db.collection('bogle_users').doc(`person-${i}`).collection('music_learning');
      await col.doc('memories').set({
        userId: `person-${i}`,
        updatedAt: T,
        _updatedAt: new Date(T),
        memories: [
          memory('a', { ...LABELS, userResponse: SENTINEL }),
          memory('b', { ...LABELS, voiceTone: 'calmer', userSaid: { text: PARTIALS[1] } }),
          memory('c', { ...LABELS, voiceTone: 'warmer' }),
        ],
        preferences: [{ context: { emotionalState: 'stressed' }, strength: 0.8 }],
      });
      await col.doc('profile').set({ userId: `person-${i}`, totalTransitions: 3 });
    }
    // A person whose memories are already clean
    await db
      .doc('bogle_users/person-clean/music_learning/memories')
      .set({ userId: 'person-clean', memories: [memory('c', LABELS)], preferences: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('(e) dry run counts only; apply leaves no words and keeps the labels; a re-run writes 0', async () => {
    const before = await all();
    expect(leakedPieces([...before.values()]).length).toBeGreaterThan(0); // precondition

    await main(['node', 'script.ts'], db as unknown as MusicDb);
    const printed = out.join('\n');
    expect(printed).toContain(`scanned ${PEOPLE + 1} docs for ${PEOPLE + 1} people`);
    expect(printed).toContain(`DRY RUN: would rewrite ${PEOPLE} docs (${PEOPLE * 2} memories)`);
    expect(leakedPieces(printed)).toEqual([]);
    expect(printed).not.toContain('person-');
    expect(await all()).toEqual(before); // same data, same update times

    await main(['node', 'script.ts', '--apply'], db as unknown as MusicDb);
    expect(process.exitCode).toBe(1); // unconfirmed: refused
    expect(await all()).toEqual(before);
    process.exitCode = undefined;

    const c = await strip(db as unknown as MusicDb, true);
    expect(c).toMatchObject({ people: PEOPLE + 1, withWords: PEOPLE, written: PEOPLE });
    const after = await all();
    expect(leakedPieces([...after.values()])).toEqual([]);
    const doc = after.get('bogle_users/person-1/music_learning/memories')!.data;
    expect(doc.memories.map((m: { evidence: unknown }) => m.evidence)).toEqual([
      LABELS,
      { ...LABELS, voiceTone: 'calmer' },
      { ...LABELS, voiceTone: 'warmer' },
    ]);
    expect(doc.memories[0]).toMatchObject({ id: 'a', tags: ['comfort', 'ambient'], createdAt: T });
    expect(doc.preferences).toEqual(
      before.get('bogle_users/person-1/music_learning/memories')!.data.preferences
    );
    for (const path of [
      'bogle_users/person-clean/music_learning/memories',
      'bogle_users/person-0/music_learning/profile',
    ])
      expect(after.get(path)!.at).toBe(before.get(path)!.at); // never rewritten

    const again = await strip(db as unknown as MusicDb, true);
    expect(again).toMatchObject({ withWords: 0, memoriesWithWords: 0, written: 0 });
    expect(await all()).toEqual(after);
  });
});
