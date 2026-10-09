#!/usr/bin/env npx tsx
/**
 * Re-index tool-routing embeddings from retired text-embedding-004 (768-d)
 * to gemini-embedding-001 (3072-d).
 *
 * Dry-run by default. Does not write production vectors unless
 * FIRESTORE_EMULATOR_HOST is set or you pass --apply --allow-prod.
 *
 *   npx tsx scripts/reindex-tool-embeddings.ts
 *   npx tsx scripts/reindex-tool-embeddings.ts --apply
 *   npx tsx scripts/reindex-tool-embeddings.ts --apply --allow-prod
 *
 * @module scripts/reindex-tool-embeddings
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'semantic_router_tool_embeddings';
const TARGET_MODEL = 'gemini-embedding-001';
const TARGET_DIMENSION = 3072;
const RETIRED_MODEL = 'text-embedding-004';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALLOW_PROD = args.has('--allow-prod');

function isEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

function initFirebase(): FirebaseFirestore.Firestore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'demo-ferni';
  if (getApps().length === 0) {
    initializeApp({ projectId });
  }
  return getFirestore();
}

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is required to generate embeddings');
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TARGET_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${TARGET_MODEL}`,
        content: { parts: [{ text }] },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`embed failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values || values.length !== TARGET_DIMENSION) {
    throw new Error(`expected ${TARGET_DIMENSION} dimensions, got ${values?.length ?? 0}`);
  }
  return values;
}

async function main(): Promise<void> {
  if (APPLY && !isEmulator() && !ALLOW_PROD) {
    throw new Error(
      'Refusing to write: set FIRESTORE_EMULATOR_HOST or pass --apply --allow-prod'
    );
  }

  const db = initFirebase();
  const snapshot = await db.collection(COLLECTION).get();
  let stale = 0;
  let written = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as {
      embeddingModel?: string;
      descriptionEmbedding?: number[];
      toolId?: string;
    };
    const dim = data.descriptionEmbedding?.length ?? 0;
    const model = data.embeddingModel ?? 'unknown';
    const needs =
      model === RETIRED_MODEL || dim !== TARGET_DIMENSION || model !== TARGET_MODEL;
    if (!needs) continue;
    stale += 1;
    process.stdout.write(
      `${APPLY ? 'rewrite' : 'stale'} ${doc.id} model=${model} dim=${dim}\n`
    );
    if (!APPLY) continue;
    const description = typeof data.toolId === 'string' ? data.toolId : doc.id;
    const descriptionEmbedding = await embed(description);
    await doc.ref.set(
      {
        ...data,
        descriptionEmbedding,
        embeddingModel: TARGET_MODEL,
        reindexedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    written += 1;
  }

  process.stdout.write(
    `scanned=${snapshot.size} stale=${stale} written=${written} apply=${APPLY} emulator=${isEmulator()}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
