/**
 * Strip the caller's words from old bogle_users/{uid}/music_learning/memories documents.
 *
 * Until 2026-10-25 each music memory kept `evidence.userResponse`: what the caller said after
 * the music. The app no longer writes it, and drops it (and any other non-label evidence field)
 * when it loads a doc (cleanMusicEvidence in src/audio/music-memory-integration.ts). This rewrites
 * each memory's evidence to the labels the app keeps; the rest of the doc stays, and nothing is
 * deleted.
 *
 * Dry run by default (scripts/destructive-gate.ts). It prints counts only: no user ids, no
 * document ids, no contents.
 *
 *   npx tsx scripts/migrations/strip-music-memory-words.ts
 *   npx tsx scripts/migrations/strip-music-memory-words.ts --apply --confirm-project=johnb-2025
 *
 * Each doc is read again inside its own transaction, so a doc changed mid-run is planned from
 * what it holds now. Re-running is safe: docs already clean are not written.
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { cleanMusicEvidence, hasExtraEvidence } from '../../src/audio/music-memory-integration.js';

type Data = Record<string, unknown>;
interface Ref {
  get(): Promise<{ exists: boolean; data(): Data | undefined }>;
}
/** The slice of Firestore the job uses, so a test can hand it a fake. */
export interface MusicDb {
  collection(name: string): { listDocuments(): Promise<Array<{ path: string }>> };
  doc(path: string): Ref;
  runTransaction<T>(
    fn: (tx: {
      get(ref: Ref): Promise<{ exists: boolean; data(): Data | undefined }>;
      update(ref: Ref, data: Data): unknown;
    }) => Promise<T>
  ): Promise<T>;
}

export interface StripCounts {
  people: number;
  docs: number;
  /** Docs holding at least one memory with words */
  withWords: number;
  /** Memories whose evidence held more than the labels */
  memoriesWithWords: number;
  written: number;
}

/** The doc's memories with label-only evidence, or null when none held anything else. */
export function strippedMemories(
  data: Data | undefined
): { memories: Data[]; count: number } | null {
  const list = Array.isArray(data?.memories) ? (data.memories as Data[]) : [];
  const count = list.filter((m) => hasExtraEvidence(m?.evidence)).length;
  if (count === 0) return null;
  // JSON round trip: the labels hold no Timestamps, and Firestore refuses undefined fields
  const memories = list.map((m) =>
    JSON.parse(JSON.stringify({ ...m, evidence: cleanMusicEvidence(m?.evidence) }))
  );
  return { memories, count };
}

export async function strip(db: MusicDb, apply: boolean): Promise<StripCounts> {
  const c: StripCounts = { people: 0, docs: 0, withWords: 0, memoriesWithWords: 0, written: 0 };
  for (const person of await db.collection('bogle_users').listDocuments()) {
    c.people++;
    const ref = db.doc(`${person.path}/music_learning/memories`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    c.docs++;
    const plan = strippedMemories(snap.data());
    if (!plan) continue;
    c.withWords++;
    c.memoriesWithWords += plan.count;
    if (!apply) continue;
    const wrote = await db.runTransaction(async (tx) => {
      const now = await tx.get(ref);
      const next = now.exists ? strippedMemories(now.data()) : null;
      if (next) tx.update(ref, { memories: next.memories });
      return next !== null;
    });
    if (wrote) c.written++;
  }
  return c;
}

export async function main(argv: readonly string[] = process.argv, db?: MusicDb): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const databaseId = process.env.FIRESTORE_DATABASE || '(default)';
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({ projectId, databaseId }) as unknown as MusicDb;
  }
  const c = await strip(db, mode === 'execute');
  const where = `bogle_users/*/music_learning/memories on ${projectId}/${databaseId}`;
  console.log(`${where}: scanned ${c.docs} docs for ${c.people} people`);
  if (mode === 'execute') {
    console.log(`Rewrote ${c.written} docs (${c.memoriesWithWords} memories had words)`);
  } else {
    console.log(`DRY RUN: would rewrite ${c.withWords} docs (${c.memoriesWithWords} memories)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Name and code only: a Firestore error can name a document (a user id)
    const { name, code } = err as { name?: string; code?: unknown };
    console.error('strip-music-memory-words failed:', name, code ?? '');
    process.exit(1);
  });
}
