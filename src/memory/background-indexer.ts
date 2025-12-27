/**
 * Background Persona Content Indexer
 *
 * Solves the production indexing problem:
 * - Indexes persona content in the background (non-blocking)
 * - Checks if content is already indexed to avoid duplicate work
 * - Uses persistent FirestoreVectorStore so vectors survive restarts
 * - Tracks indexing status per persona bundle
 *
 * Philosophy: The agent should start fast. Memory can warm up in the background.
 */

import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../utils/firestore-utils.js';
import type { FirestoreVectorStore } from './firestore-vector-store.js';
import type { VectorStore } from './vector-store.js';

type AnyVectorStore = VectorStore | FirestoreVectorStore;

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface IndexingStatus {
  bundleId: string;
  status: 'pending' | 'indexing' | 'complete' | 'failed';
  documentsIndexed: number;
  lastIndexedAt: Date | null;
  contentHash: string | null;
  error?: string;
}

interface BackgroundIndexerConfig {
  /** Delay before starting background indexing (ms) */
  startDelayMs?: number;
  /** Max concurrent embedding requests */
  concurrency?: number;
  /** Skip if already indexed within this time (ms) */
  reindexThresholdMs?: number;
}

// ============================================================================
// STATE
// ============================================================================

const indexingStatus = new Map<string, IndexingStatus>();
let isIndexing = false;
let indexingPromise: Promise<void> | null = null;

// ============================================================================
// CONTENT HASHING
// ============================================================================

/**
 * Generate a hash of content to detect changes
 */
function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 12);
}

/**
 * Get combined hash for all knowledge files in a bundle
 */
async function getBundleContentHash(bundlePath: string): Promise<string> {
  const { readdir, readFile } = await import('fs/promises');
  const { join } = await import('path');

  try {
    const knowledgePath = join(bundlePath, 'content', 'knowledge');
    const files = await readdir(knowledgePath);
    const hashes: string[] = [];

    for (const file of files.sort()) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;
      const content = await readFile(join(knowledgePath, file), 'utf-8');
      hashes.push(hashContent(content));
    }

    return hashContent(hashes.join(''));
  } catch {
    return 'empty';
  }
}

// ============================================================================
// INDEX STATUS PERSISTENCE
// ============================================================================

/**
 * Load indexing status from Firestore
 */
async function loadIndexStatus(): Promise<void> {
  try {
    const { getGCPProjectId, getFirestoreDatabase } = await import('../config/environment.js');
    const { Firestore } = await import('@google-cloud/firestore');

    const db = new Firestore({
      projectId: getGCPProjectId(),
      databaseId: getFirestoreDatabase(),
    });

    const snapshot = await db.collection('vector_index_status').get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      indexingStatus.set(doc.id, {
        bundleId: doc.id,
        status: data.status || 'pending',
        documentsIndexed: data.documentsIndexed || 0,
        lastIndexedAt: data.lastIndexedAt?.toDate() || null,
        contentHash: data.contentHash || null,
        error: data.error,
      });
    }

    log.debug({ bundles: indexingStatus.size }, 'Loaded vector index status');
  } catch (error) {
    log.debug({ error }, 'Could not load index status (will re-index)');
  }
}

/**
 * Save indexing status to Firestore
 */
async function saveIndexStatus(bundleId: string, status: IndexingStatus): Promise<void> {
  try {
    const { getGCPProjectId, getFirestoreDatabase } = await import('../config/environment.js');
    const { Firestore } = await import('@google-cloud/firestore');

    const db = new Firestore({
      projectId: getGCPProjectId(),
      databaseId: getFirestoreDatabase(),
    });

    await db
      .collection('vector_index_status')
      .doc(bundleId)
      .set(
        removeUndefined({
          ...status,
          lastIndexedAt: status.lastIndexedAt || new Date(),
          updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.debug({ error, bundleId }, 'Could not save index status');
  }
}

// ============================================================================
// BACKGROUND INDEXING
// ============================================================================

/**
 * Index a single persona bundle's knowledge content
 */
async function indexBundleContent(
  bundleId: string,
  bundlePath: string,
  vectorStore: AnyVectorStore
): Promise<number> {
  const { readdir, readFile } = await import('fs/promises');
  const { join } = await import('path');
  const { indexPersonaContent } = await import('./semantic-rag.js');

  const knowledgePath = join(bundlePath, 'content', 'knowledge');
  let documentsIndexed = 0;

  try {
    const files = await readdir(knowledgePath);

    for (const file of files) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;

      const filePath = join(knowledgePath, file);
      const content = await readFile(filePath, 'utf-8');
      const id = `${bundleId}_${file.replace('.md', '')}`;

      // Infer category from file name
      let category = 'knowledge';
      if (file.includes('story') || file.includes('anecdote')) category = 'stories';
      else if (file.includes('wisdom') || file.includes('opinion')) category = 'wisdom';
      else if (file.includes('coach') || file.includes('event')) category = 'coaching';
      else if (file.includes('bio') || file.includes('personal')) category = 'personal';
      else if (file.includes('style') || file.includes('conversation')) category = 'style';
      else if (file.includes('history') || file.includes('finance')) category = 'history';
      else if (file.includes('principle') || file.includes('vanguard')) category = 'principles';

      await indexPersonaContent(id, content, category, vectorStore);
      documentsIndexed++;
    }
  } catch {
    // Knowledge directory may not exist
  }

  return documentsIndexed;
}

/**
 * Check if a bundle needs re-indexing
 */
async function bundleNeedsIndexing(
  bundleId: string,
  bundlePath: string,
  config: BackgroundIndexerConfig
): Promise<boolean> {
  const status = indexingStatus.get(bundleId);

  // Never indexed
  if (!status || status.status !== 'complete') {
    return true;
  }

  // Check if content changed
  const currentHash = await getBundleContentHash(bundlePath);
  if (currentHash !== status.contentHash) {
    log.info(
      { bundleId, oldHash: status.contentHash, newHash: currentHash },
      'Bundle content changed'
    );
    return true;
  }

  // Check if index is too old
  const threshold = config.reindexThresholdMs || 7 * 24 * 60 * 60 * 1000; // 7 days default
  if (status.lastIndexedAt && Date.now() - status.lastIndexedAt.getTime() > threshold) {
    log.info({ bundleId, lastIndexed: status.lastIndexedAt }, 'Bundle index expired');
    return true;
  }

  return false;
}

/**
 * Start background indexing of all persona content
 * Non-blocking - returns immediately and indexes in background
 */
export async function startBackgroundIndexing(
  vectorStore: AnyVectorStore,
  config: BackgroundIndexerConfig = {}
): Promise<void> {
  // Don't start if already indexing
  if (isIndexing) {
    log.debug('Background indexing already in progress');
    return;
  }

  isIndexing = true;

  // Start after delay to let agent initialize first
  const startDelay = config.startDelayMs ?? 5000;

  indexingPromise = (async () => {
    try {
      // Wait before starting
      await new Promise((resolve) => {
        setTimeout(resolve, startDelay);
      });

      log.info('Starting background persona content indexing...');

      // Load existing index status
      await loadIndexStatus();

      // Find all persona bundles
      const { readdir } = await import('fs/promises');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const bundlesPath = join(__dirname, '..', 'personas', 'bundles');

      const bundles = await readdir(bundlesPath, { withFileTypes: true });
      let totalIndexed = 0;
      let bundlesProcessed = 0;

      for (const bundle of bundles) {
        if (!bundle.isDirectory()) continue;

        const bundlePath = join(bundlesPath, bundle.name);

        // Check if needs indexing
        if (!(await bundleNeedsIndexing(bundle.name, bundlePath, config))) {
          log.debug({ bundleId: bundle.name }, 'Bundle already indexed, skipping');
          bundlesProcessed++;
          continue;
        }

        // Update status
        const status: IndexingStatus = {
          bundleId: bundle.name,
          status: 'indexing',
          documentsIndexed: 0,
          lastIndexedAt: null,
          contentHash: null,
        };
        indexingStatus.set(bundle.name, status);

        try {
          // Index bundle content
          const docsIndexed = await indexBundleContent(bundle.name, bundlePath, vectorStore);

          // Update status
          status.status = 'complete';
          status.documentsIndexed = docsIndexed;
          status.lastIndexedAt = new Date();
          status.contentHash = await getBundleContentHash(bundlePath);

          await saveIndexStatus(bundle.name, status);

          totalIndexed += docsIndexed;
          bundlesProcessed++;

          log.debug({ bundleId: bundle.name, documents: docsIndexed }, 'Bundle indexed');
        } catch (error) {
          status.status = 'failed';
          status.error = String(error);
          await saveIndexStatus(bundle.name, status);
          log.warn({ bundleId: bundle.name, error }, 'Bundle indexing failed');
        }
      }

      log.info(
        { bundles: bundlesProcessed, documents: totalIndexed },
        '✅ Background persona indexing complete'
      );
    } catch (error) {
      log.error({ error }, 'Background indexing failed');
    } finally {
      isIndexing = false;
    }
  })();
}

/**
 * Wait for background indexing to complete (for tests/shutdown)
 */
export async function waitForIndexing(): Promise<void> {
  if (indexingPromise) {
    await indexingPromise;
  }
}

/**
 * Get current indexing status
 */
export function getIndexingStatus(): Map<string, IndexingStatus> {
  return new Map(indexingStatus);
}

/**
 * Check if indexing is in progress
 */
export function isIndexingInProgress(): boolean {
  return isIndexing;
}

/**
 * Reset indexing state (for testing)
 */
export function resetIndexingState(): void {
  indexingStatus.clear();
  isIndexing = false;
  indexingPromise = null;
}

export default {
  startBackgroundIndexing,
  waitForIndexing,
  getIndexingStatus,
  isIndexingInProgress,
  resetIndexingState,
};
