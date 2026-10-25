/**
 * The backfill's I/O (backfill-remembered-facts.ts): the cursor file, and the
 * Firestore, embedding and secret-model connections a real run makes.
 *
 * @module scripts/memory/backfill-remembered-facts-io
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FieldPath, Firestore } from '@google-cloud/firestore';
import { CLASSIFICATION_MODEL } from '../../src/config/gemini-config.js';
import { readForgottenTopics } from '../../src/memory/recall/forget.js';
import { defaultEmbedder, defaultEmbeddingModel } from '../../src/memory/recall/semantic-recall.js';
import { createGeminiCrisisGenerate } from '../../src/services/safety/crisis-classifier.js';
import type { BackfillDeps, MemorySource } from './backfill-remembered-facts.js';

const READ_FIELDS = ['content', 'type', 'archived', 'forgottenAt'];

/** The default cursor file, per database and --uid (hashed), so a trial never moves the full run's. */
export function defaultCursorFile(database: string, uid?: string): string {
  const scope = uid ? `.uid-${createHash('sha256').update(uid).digest('hex').slice(0, 12)}` : '';
  return `backfill-remembered-facts.${database}${scope}.cursor`;
}

/** The cursor in `file`, saved with the run's --uid; one saved by another scope is refused. */
export function fileCursor(
  file: string,
  uid: string | undefined,
  restart: boolean
): BackfillDeps['cursor'] {
  const scope = uid ?? null;
  return {
    read() {
      if (restart || !existsSync(file)) return undefined;
      let saved: { uid?: unknown; after?: unknown } = {};
      try {
        saved = JSON.parse(readFileSync(file, 'utf8')) as typeof saved;
      } catch {
        // not one this version wrote: refused below
      }
      if (saved.uid !== scope || typeof saved.after !== 'string') {
        throw new Error(`Refusing: ${file} was saved by another run (--uid or full); pass --restart or another --cursor.`); // prettier-ignore
      }
      return saved.after;
    },
    write: (after) => writeFileSync(file, JSON.stringify({ uid: scope, after })),
  };
}

/** bogle_users/{uid}/memories (one user, or all by collection group), by path. */
export function firestoreMemorySource(db: Firestore, uid?: string): MemorySource {
  const facts = (userId: string) => db.collection('bogle_users').doc(userId).collection('dynamic_facts'); // prettier-ignore
  return {
    async page(after, size) {
      let q = (
        uid
          ? db.collection('bogle_users').doc(uid).collection('memories')
          : db.collectionGroup('memories')
      )
        .orderBy(FieldPath.documentId())
        .select(...READ_FIELDS)
        .limit(size);
      // One user's collection orders by document id, the collection group by path.
      if (after) q = q.startAfter(uid ? after.split('/').pop() : after);
      const snap = await q.get();
      return snap.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
    },
    async create(userId, doc) {
      await facts(userId).doc(doc.id).create(doc.data);
    },
    forgottenTopics: (userId) => readForgottenTopics(db, userId),
    async existing(userId, ids) {
      const snaps = await db.getAll(...ids.map((id) => facts(userId).doc(id)), { fieldMask: [] });
      return new Set(snaps.filter((s) => s.exists).map((s) => s.id));
    },
  };
}

/** What a real run connects to: --database, Vertex embeddings, the live write's secret model. */
export type Connect = (projectId: string, database: string, uid?: string) => Omit<BackfillDeps, 'cursor' | 'log'>; // prettier-ignore
export const connect: Connect = (projectId, database, uid) => ({
  source: firestoreMemorySource(new Firestore({ projectId, databaseId: database, ignoreUndefinedProperties: true }), uid), // prettier-ignore
  embed: defaultEmbedder,
  model: defaultEmbeddingModel,
  // As agents/remembered-fact-store-register.ts hands the live write
  secretCheck: { model: createGeminiCrisisGenerate(CLASSIFICATION_MODEL) },
});
