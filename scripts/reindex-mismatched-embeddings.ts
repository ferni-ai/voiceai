#!/usr/bin/env npx tsx
/**
 * Re-index Documents with Mismatched Embedding Dimensions
 *
 * This script finds documents in the Firestore vector store that have
 * embeddings with incorrect dimensions (e.g., 384 instead of 768) and
 * re-generates them using the current embedding model.
 *
 * USAGE:
 *   npx tsx scripts/reindex-mismatched-embeddings.ts
 *   npx tsx scripts/reindex-mismatched-embeddings.ts --dry-run
 *   npx tsx scripts/reindex-mismatched-embeddings.ts --delete  # Delete instead of re-index
 *
 * PREREQUISITES:
 *   - Set GOOGLE_API_KEY for embedding generation
 *   - Set GOOGLE_CLOUD_PROJECT for Firestore access
 *
 * @module scripts/reindex-mismatched-embeddings
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EXPECTED_DIMENSION = 768; // Google text-embedding-004
const COLLECTION_NAME = 'vectors';
const BATCH_SIZE = 50; // Process in batches to avoid rate limits

// ============================================================================
// CLI ARGS
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DELETE_MODE = args.includes('--delete');

// ============================================================================
// FIREBASE INIT
// ============================================================================

function initFirebase(): void {
  if (getApps().length > 0) return;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable required');
  }

  // Try to use default credentials
  try {
    initializeApp({ projectId });
    console.log(`✅ Firebase initialized for project: ${projectId}`);
  } catch (error) {
    // If default credentials fail, try with service account
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (serviceAccountPath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(serviceAccountPath);
      initializeApp({ credential: cert(serviceAccount), projectId });
      console.log(`✅ Firebase initialized with service account for project: ${projectId}`);
    } else {
      throw error;
    }
  }
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable required');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { embedding?: { values?: number[] } };
  const embedding = data.embedding?.values;

  if (!embedding || embedding.length !== EXPECTED_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: ${embedding?.length}`);
  }

  return embedding;
}

// ============================================================================
// MAIN
// ============================================================================

interface MismatchedDoc {
  id: string;
  text: string;
  currentDimension: number;
  metadata: Record<string, unknown>;
}

async function findMismatchedDocuments(): Promise<MismatchedDoc[]> {
  const db = getFirestore();
  const mismatched: MismatchedDoc[] = [];

  console.log(`\n🔍 Scanning ${COLLECTION_NAME} collection for dimension mismatches...`);
  console.log(`   Expected dimension: ${EXPECTED_DIMENSION}`);

  const snapshot = await db.collection(COLLECTION_NAME).get();
  console.log(`   Total documents: ${snapshot.size}`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const embedding = data.embedding;

    if (Array.isArray(embedding) && embedding.length !== EXPECTED_DIMENSION) {
      mismatched.push({
        id: doc.id,
        text: data.text || '',
        currentDimension: embedding.length,
        metadata: data.metadata || {},
      });
    }
  }

  return mismatched;
}

async function reindexDocument(
  db: FirebaseFirestore.Firestore,
  doc: MismatchedDoc
): Promise<boolean> {
  if (!doc.text || doc.text.trim().length === 0) {
    console.log(`   ⚠️  Skipping ${doc.id} - no text content`);
    return false;
  }

  try {
    const newEmbedding = await generateEmbedding(doc.text);

    if (!DRY_RUN) {
      await db.collection(COLLECTION_NAME).doc(doc.id).update({
        embedding: FieldValue.vector(newEmbedding),
        'metadata.reindexedAt': new Date().toISOString(),
        'metadata.previousDimension': doc.currentDimension,
      });
    }

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to reindex ${doc.id}:`, error);
    return false;
  }
}

async function deleteDocument(
  db: FirebaseFirestore.Firestore,
  doc: MismatchedDoc
): Promise<boolean> {
  try {
    if (!DRY_RUN) {
      await db.collection(COLLECTION_NAME).doc(doc.id).delete();
    }
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to delete ${doc.id}:`, error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Re-index Mismatched Embeddings');
  console.log('═══════════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (DELETE_MODE) {
    console.log('\n🗑️  DELETE MODE - Documents will be deleted, not re-indexed\n');
  }

  // Initialize Firebase
  initFirebase();
  const db = getFirestore();

  // Find mismatched documents
  const mismatched = await findMismatchedDocuments();

  if (mismatched.length === 0) {
    console.log('\n✅ No mismatched documents found!');
    return;
  }

  // Group by dimension for reporting
  const byDimension = new Map<number, MismatchedDoc[]>();
  for (const doc of mismatched) {
    const existing = byDimension.get(doc.currentDimension) || [];
    existing.push(doc);
    byDimension.set(doc.currentDimension, existing);
  }

  console.log(`\n📊 Found ${mismatched.length} documents with wrong dimensions:`);
  for (const [dim, docs] of byDimension) {
    console.log(`   - ${dim} dimensions: ${docs.length} documents`);
    // Show first few doc IDs
    const sample = docs.slice(0, 3).map((d) => d.id);
    console.log(`     Examples: ${sample.join(', ')}${docs.length > 3 ? '...' : ''}`);
  }

  // Process in batches
  console.log(`\n${DELETE_MODE ? '🗑️  Deleting' : '🔄 Re-indexing'} documents...`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < mismatched.length; i += BATCH_SIZE) {
    const batch = mismatched.slice(i, i + BATCH_SIZE);

    for (const doc of batch) {
      const success = DELETE_MODE
        ? await deleteDocument(db, doc)
        : await reindexDocument(db, doc);

      processed++;
      if (success) {
        succeeded++;
        const action = DELETE_MODE ? 'Deleted' : 'Re-indexed';
        console.log(
          `   ✅ [${processed}/${mismatched.length}] ${action} ${doc.id} (${doc.currentDimension} → ${DELETE_MODE ? 'removed' : EXPECTED_DIMENSION})`
        );
      } else {
        failed++;
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < mismatched.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Total processed: ${processed}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN - Run without --dry-run to apply changes');
  } else {
    console.log(`\n✅ ${DELETE_MODE ? 'Deletion' : 'Re-indexing'} complete!`);
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
