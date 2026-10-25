/**
 * emotional_data/{uid}/points against the Firestore emulator, with the real
 * @google-cloud/firestore client: legacy points carrying the caller's words are
 * stripped on load (getEmotionalDataPoints) and by the one-off job. The dry run
 * counts and writes nothing; --apply strips every slice; a re-run writes 0.
 * Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   firebase emulators:exec --only firestore --project demo-emotion \
 *     "pnpm vitest run -c vitest.config.unit.ts scripts/migrations/__tests__/strip-emotional-data-snippets.emulator.test.ts"
 */
import { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, PARTIALS, SENTINEL } from '../../../src/tests/helpers/snippet-leak.js';
import type { PointsDb } from '../strip-emotional-data-snippets.js';

const handle = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../src/utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => handle.db }));

const { main, strip } = await import('../strip-emotional-data-snippets.js');
const { getEmotionalDataPoints } = await import('../../../src/personality/pattern-persistence.js');

const T = '2026-09-01T10:00:00.000Z';
const PEOPLE = 3;

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'emotional_data points on the emulator',
  () => {
    let db: Firestore;
    let out: string[];

    /** Every point document, path → data. */
    const all = async () => {
      const snap = await db.collectionGroup('points').get();
      return new Map(
        snap.docs.map((d) => [d.ref.path, { data: d.data(), at: d.updateTime.toMillis() }])
      );
    };

    beforeEach(async () => {
      db = new Firestore({
        projectId: `demo-emodata-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });
      handle.db = db;
      out = [];
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
      vi.spyOn(console, 'error').mockImplementation(
        (...a: unknown[]) => void out.push(a.join(' '))
      );
      process.exitCode = undefined;
      // Per person: 2 legacy points to rewrite, 1 to delete, 1 clean. No parent document,
      // as saveEmotionalDataPoint never wrote one.
      for (let i = 0; i < PEOPLE; i++) {
        const col = db.collection('emotional_data').doc(`person-${i}`).collection('points');
        await col
          .doc('a')
          .set({
            timestamp: T,
            emotion: 'anxious',
            intensity: 0.7,
            topics: ['work'],
            context: SENTINEL.slice(0, 100),
            createdAt: T,
          });
        await col
          .doc('b')
          .set({ timestamp: T, emotion: 'sad', intensity: 0.4, meta: { snippet: PARTIALS[1] } });
        await col
          .doc('c')
          .set({ timestamp: 'last week', emotion: 'calm', intensity: 0.2, context: PARTIALS[0] });
        await col.doc('d').set({ timestamp: T, emotion: 'happy', intensity: 0.9, createdAt: T });
      }
    });
    afterEach(() => vi.restoreAllMocks());

    it('loading strips the words and skips a point without a valid time', async () => {
      const read = await getEmotionalDataPoints('person-0');
      expect(leakedPieces(read)).toEqual([]);
      expect(read.map((p) => p.emotion).sort()).toEqual(['anxious', 'happy', 'sad']);
    });

    it('dry run counts and writes nothing; apply strips every slice; a re-run writes 0', async () => {
      const before = await all();
      expect(leakedPieces([...before.values()]).length).toBeGreaterThan(0); // precondition

      await main(['node', 'script.ts'], db as unknown as PointsDb);
      const printed = out.join('\n');
      expect(printed).toContain(`scanned ${PEOPLE * 4} points for ${PEOPLE} people`);
      expect(printed).toContain(`DRY RUN: would rewrite ${PEOPLE * 2} points and delete ${PEOPLE}`);
      expect(leakedPieces(printed)).toEqual([]);
      expect(printed).not.toContain('person-');
      expect(await all()).toEqual(before); // same data, same update times

      await main(['node', 'script.ts', '--apply'], db as unknown as PointsDb);
      expect(process.exitCode).toBe(1); // unconfirmed: refused
      expect(await all()).toEqual(before);
      process.exitCode = undefined;

      const c = await strip(db as unknown as PointsDb, true, 2); // several pages per person
      expect(c).toMatchObject({ scanned: PEOPLE * 4, rewritten: PEOPLE * 2, deleted: PEOPLE });
      const after = await all();
      expect(leakedPieces([...after.values()])).toEqual([]);
      expect(after.size).toBe(PEOPLE * 3);
      expect(after.get('emotional_data/person-1/points/a')!.data).toEqual({
        timestamp: T,
        emotion: 'anxious',
        intensity: 0.7,
        createdAt: T,
      });
      expect(after.get('emotional_data/person-1/points/d')!.at).toBe(
        before.get('emotional_data/person-1/points/d')!.at
      );

      const again = await strip(db as unknown as PointsDb, true, 2);
      expect(again).toMatchObject({ toRewrite: 0, toDelete: 0, rewritten: 0, deleted: 0 });
      expect(await all()).toEqual(after);
    });
  }
);
