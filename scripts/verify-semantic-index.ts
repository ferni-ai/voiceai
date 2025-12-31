#!/usr/bin/env npx tsx

/**
 * Semantic Index Verification Script
 *
 * Verifies the semantic index health and provides statistics.
 *
 * Usage:
 *   npx tsx scripts/verify-semantic-index.ts [options]
 *
 * Options:
 *   --user <userId>     Check for a specific user
 *   --query <query>     Test semantic search with a query
 *   --domain <domain>   Filter by domain
 *   --verbose           Show detailed results
 *
 * @module scripts/verify-semantic-index
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../src/utils/safe-logger.js';
import { getFirestoreVectorStore } from '../src/memory/firestore-vector-store.js';
import type { StoreType } from '../src/services/data-layer/types.js';

const log = createLogger({ name: 'VerifySemanticIndex' });

// ============================================================================
// TYPES
// ============================================================================

interface VerifyOptions {
  userId?: string;
  query?: string;
  domain?: StoreType;
  verbose: boolean;
}

interface IndexStats {
  totalDocuments: number;
  byStoreType: Record<string, number>;
  byEntityType: Record<string, number>;
  oldestDoc?: Date;
  newestDoc?: Date;
  avgContentLength: number;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initFirebase(): void {
  if (getApps().length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'ferni-ai-dev';
    initializeApp({ projectId });
  }
}

// ============================================================================
// VERIFICATION LOGIC
// ============================================================================

async function getIndexStats(options: VerifyOptions): Promise<IndexStats> {
  const db = getFirestore();
  const stats: IndexStats = {
    totalDocuments: 0,
    byStoreType: {},
    byEntityType: {},
    avgContentLength: 0,
  };

  let query = db.collection('semantic_memory');

  if (options.userId) {
    query = query.where('metadata.userId', '==', options.userId) as typeof query;
  }

  if (options.domain) {
    query = query.where('metadata.storeType', '==', options.domain) as typeof query;
  }

  const snapshot = await query.limit(10000).get();
  let totalContentLength = 0;
  let oldestTimestamp: Date | undefined;
  let newestTimestamp: Date | undefined;

  for (const doc of snapshot.docs) {
    stats.totalDocuments++;

    const data = doc.data();
    const metadata = data.metadata || {};

    // Count by store type
    const storeType = metadata.storeType || 'unknown';
    stats.byStoreType[storeType] = (stats.byStoreType[storeType] || 0) + 1;

    // Count by entity type
    const entityType = metadata.entityType || 'unknown';
    stats.byEntityType[entityType] = (stats.byEntityType[entityType] || 0) + 1;

    // Track content length
    totalContentLength += (data.text || data.content || '').length;

    // Track timestamps
    const timestamp = data.createdAt?.toDate() || data.timestamp?.toDate();
    if (timestamp) {
      if (!oldestTimestamp || timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
      }
      if (!newestTimestamp || timestamp > newestTimestamp) {
        newestTimestamp = timestamp;
      }
    }
  }

  stats.oldestDoc = oldestTimestamp;
  stats.newestDoc = newestTimestamp;
  stats.avgContentLength = stats.totalDocuments > 0
    ? Math.round(totalContentLength / stats.totalDocuments)
    : 0;

  return stats;
}

async function testSemanticSearch(
  query: string,
  options: VerifyOptions
): Promise<void> {
  const vectorStore = getFirestoreVectorStore();
  await vectorStore.initialize();

  const filters: Record<string, unknown> = {};

  if (options.userId) {
    filters.userId = options.userId;
  }

  if (options.domain) {
    filters.storeType = options.domain;
  }

  console.log(`\nSearching for: "${query}"`);
  console.log('Filters:', JSON.stringify(filters));
  console.log('---');

  const results = await vectorStore.search(query, 10, filters);

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    console.log(`\n#${i + 1} (score: ${result.score.toFixed(3)})`);
    console.log(`  Content: ${result.content.slice(0, 150)}...`);
    if (options.verbose && result.metadata) {
      console.log(`  Metadata: ${JSON.stringify(result.metadata, null, 2)}`);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: VerifyOptions = {
    verbose: args.includes('--verbose'),
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' && args[i + 1]) {
      options.userId = args[++i];
    } else if (args[i] === '--query' && args[i + 1]) {
      options.query = args[++i];
    } else if (args[i] === '--domain' && args[i + 1]) {
      options.domain = args[++i] as StoreType;
    }
  }

  log.info({ options }, 'Verifying semantic index');

  initFirebase();

  // Get stats
  console.log('\n========================================');
  console.log('SEMANTIC INDEX STATISTICS');
  console.log('========================================');

  const stats = await getIndexStats(options);

  console.log(`\nTotal Documents: ${stats.totalDocuments}`);

  if (stats.oldestDoc) {
    console.log(`Oldest Document: ${stats.oldestDoc.toISOString()}`);
  }
  if (stats.newestDoc) {
    console.log(`Newest Document: ${stats.newestDoc.toISOString()}`);
  }

  console.log(`Average Content Length: ${stats.avgContentLength} chars`);

  console.log('\nBy Store Type:');
  const storeTypesSorted = Object.entries(stats.byStoreType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of storeTypesSorted) {
    console.log(`  ${type}: ${count}`);
  }

  if (options.verbose) {
    console.log('\nBy Entity Type:');
    const entityTypesSorted = Object.entries(stats.byEntityType).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of entityTypesSorted.slice(0, 20)) {
      console.log(`  ${type}: ${count}`);
    }
    if (entityTypesSorted.length > 20) {
      console.log(`  ... and ${entityTypesSorted.length - 20} more`);
    }
  }

  // Test search if query provided
  if (options.query) {
    await testSemanticSearch(options.query, options);
  }

  console.log('\n========================================\n');
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Verification failed');
  process.exit(1);
});
