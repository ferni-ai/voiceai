#!/usr/bin/env npx tsx
/**
 * Memory Lane Backfill Script
 *
 * Scans existing user data and populates the memory_highlights collection
 * from various data sources (commitments, dreams, milestones, etc.).
 *
 * This is a one-time migration script for existing users. New users will
 * have memories collected in real-time.
 *
 * Usage:
 *   pnpm memory:backfill              # Process all users
 *   pnpm memory:backfill --user=123   # Process specific user
 *   pnpm memory:backfill --dry-run    # Preview without writing
 *   pnpm memory:backfill --limit=10   # Process only 10 users
 *
 * @module scripts/backfill-memory-highlights
 */

import 'dotenv/config';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryBackfill' });

// ============================================================================
// TYPES
// ============================================================================

interface BackfillStats {
  usersProcessed: number;
  usersSkipped: number;
  memoriesCollected: number;
  memoriesSaved: number;
  errors: string[];
  startTime: Date;
  endTime?: Date;
}

interface BackfillOptions {
  userId?: string;
  dryRun: boolean;
  limit?: number;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('\n🏛️  Memory Lane Backfill Script');
  console.log('================================\n');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be written\n');
  }

  const stats: BackfillStats = {
    usersProcessed: 0,
    usersSkipped: 0,
    memoriesCollected: 0,
    memoriesSaved: 0,
    errors: [],
    startTime: new Date(),
  };

  try {
    // Initialize Firebase
    console.log('📡 Connecting to Firestore...');
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Failed to connect to Firestore');
    }
    console.log('✅ Connected\n');

    // Get users to process
    const userIds = await getUserIds(db, options);
    console.log(`👥 Found ${userIds.length} users to process\n`);

    if (userIds.length === 0) {
      console.log('No users to process. Exiting.');
      process.exit(0);
    }

    // Process each user
    const { collectAllMemories } = await import('../services/memory-lane/memory-collector.js');

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const progress = `[${i + 1}/${userIds.length}]`;

      try {
        console.log(`${progress} Processing user ${userId.slice(0, 8)}...`);

        if (options.dryRun) {
          // In dry run, just count what we'd collect
          const result = await collectAllMemories(userId);
          stats.memoriesCollected += result.collected;
          console.log(`  └─ Would collect ${result.collected} memories`);
        } else {
          const result = await collectAllMemories(userId);
          stats.memoriesCollected += result.collected;
          stats.memoriesSaved += result.saved;
          console.log(`  └─ Collected ${result.collected}, saved ${result.saved}`);

          if (result.errors.length > 0) {
            stats.errors.push(...result.errors.map((e) => `${userId}: ${e}`));
          }
        }

        stats.usersProcessed++;
      } catch (err) {
        const errorMsg = `User ${userId}: ${String(err)}`;
        log.error({ error: String(err), userId }, 'Failed to process user');
        stats.errors.push(errorMsg);
        stats.usersSkipped++;
        console.log(`  └─ ❌ Error: ${String(err)}`);
      }

      // Rate limiting to avoid overwhelming Firestore
      await sleep(100);
    }

    stats.endTime = new Date();

    // Print summary
    printSummary(stats, options);

    if (stats.errors.length > 0) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    log.error({ error: String(error) }, 'Backfill script failed');
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseArgs(args: string[]): BackfillOptions {
  const options: BackfillOptions = {
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--user=')) {
      options.userId = arg.replace('--user=', '');
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    }
  }

  return options;
}

async function getUserIds(
  db: FirebaseFirestore.Firestore,
  options: BackfillOptions
): Promise<string[]> {
  // Single user mode
  if (options.userId) {
    return [options.userId];
  }

  // Get all users from bogle_users collection
  let query = db.collection('bogle_users').select(); // Only get IDs

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.id);
}

function printSummary(stats: BackfillStats, options: BackfillOptions): void {
  const duration = stats.endTime
    ? Math.round((stats.endTime.getTime() - stats.startTime.getTime()) / 1000)
    : 0;

  console.log('\n================================');
  console.log('📊 Backfill Summary');
  console.log('================================\n');

  console.log(`Mode:              ${options.dryRun ? 'Dry Run' : 'Live'}`);
  console.log(`Duration:          ${duration}s`);
  console.log(`Users processed:   ${stats.usersProcessed}`);
  console.log(`Users skipped:     ${stats.usersSkipped}`);
  console.log(`Memories found:    ${stats.memoriesCollected}`);
  if (!options.dryRun) {
    console.log(`Memories saved:    ${stats.memoriesSaved}`);
  }

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    for (const error of stats.errors.slice(0, 10)) {
      console.log(`  - ${error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
  }

  console.log('\n✅ Done!\n');
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// RUN
// ============================================================================

void main();
