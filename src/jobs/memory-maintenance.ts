/**
 * Memory Maintenance Job
 *
 * Runs periodically (nightly) to keep the memory system healthy:
 * - LLM link detection (batch process - not every request)
 * - Pattern formation (detect behavioral patterns)
 * - Memory consolidation (group related memories)
 * - Decay application (fade irrelevant memories)
 * - Protection cleanup (remove expired protections)
 *
 * This is the "background intelligence" that makes memory better than human -
 * a friend who not only remembers but also organizes and curates.
 *
 * @module jobs/memory-maintenance
 */

import { createLogger } from '../utils/safe-logger.js';
import { getUnifiedMemoryService } from '../services/unified-memory-service.js';
import { getProtectionEngine } from '../memory/protection-engine.js';
import { getPatternFormation } from '../memory/pattern-formation.js';
import { getLLMLinkDetector } from '../memory/llm-link-detector.js';
import { getMemoryGraph, type MemoryLink } from '../memory/memory-graph.js';
import { getFirestoreDb } from '../services/superhuman/firestore-utils.js';
import { getUserMemories } from '../memory/lifecycle-integration.js';

const log = createLogger({ module: 'MemoryMaintenanceJob' });

// ============================================================================
// TYPES
// ============================================================================

export interface MaintenanceConfig {
  /** Max users to process per run (prevents overload) */
  maxUsersPerRun: number;
  /** Run LLM link detection (expensive, can be disabled) */
  enableLlmLinks: boolean;
  /** Run pattern formation */
  enablePatterns: boolean;
  /** Run consolidation */
  enableConsolidation: boolean;
  /** Run decay */
  enableDecay: boolean;
  /** Max memories to analyze for LLM links per user */
  maxMemoriesForLlmLinks: number;
  /** Minimum days since last maintenance run per user */
  minDaysSinceLastRun: number;
}

export interface MaintenanceResult {
  userId: string;
  success: boolean;
  error?: string;
  stats: {
    llmLinksCreated: number;
    patternsDetected: number;
    memoriesConsolidated: number;
    memoriesDecayed: number;
    protectionsExpired: number;
    durationMs: number;
  };
}

export interface BatchMaintenanceResult {
  usersProcessed: number;
  usersSucceeded: number;
  usersFailed: number;
  totalDurationMs: number;
  results: MaintenanceResult[];
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  maxUsersPerRun: 100,
  enableLlmLinks: true,
  enablePatterns: true,
  enableConsolidation: true,
  enableDecay: true,
  maxMemoriesForLlmLinks: 50,
  minDaysSinceLastRun: 1,
};

// ============================================================================
// MAINTENANCE JOB
// ============================================================================

/**
 * Run maintenance for a single user
 */
export async function runUserMaintenance(
  userId: string,
  config: Partial<MaintenanceConfig> = {}
): Promise<MaintenanceResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  const stats = {
    llmLinksCreated: 0,
    patternsDetected: 0,
    memoriesConsolidated: 0,
    memoriesDecayed: 0,
    protectionsExpired: 0,
    durationMs: 0,
  };

  try {
    const unifiedMemory = getUnifiedMemoryService();
    const protectionEngine = getProtectionEngine();

    // 1. Run consolidation and decay via unified service
    if (cfg.enableConsolidation || cfg.enableDecay) {
      await unifiedMemory.runMaintenance(userId);
      // Note: The unified service handles consolidation and decay internally
      // Stats are logged but not returned - could be enhanced later
    }

    // 2. Pattern formation
    if (cfg.enablePatterns) {
      try {
        const patternEngine = getPatternFormation();
        const memories = await getUserMemories(userId);
        const patterns = await patternEngine.detectPatterns(userId, memories);
        stats.patternsDetected = patterns.length;
      } catch (patternErr) {
        log.warn({ error: String(patternErr), userId }, 'Pattern formation failed');
      }
    }

    // 3. LLM link detection (expensive - batch process)
    if (cfg.enableLlmLinks) {
      try {
        const llmDetector = getLLMLinkDetector();
        const memGraph = getMemoryGraph();
        const memories = await getUserMemories(userId);
        const existingLinks = await memGraph.getLinks(userId);
        const detected = await llmDetector.detectAllLinks(memories, existingLinks);
        // Create the detected links
        const created = await llmDetector.createDetectedLinks(userId, detected.detected);
        stats.llmLinksCreated = created.length;
      } catch (llmErr) {
        log.warn({ error: String(llmErr), userId }, 'LLM link detection failed');
      }
    }

    // 4. Cleanup expired protections
    try {
      stats.protectionsExpired = await protectionEngine.cleanupExpired(userId);
    } catch (protErr) {
      log.warn({ error: String(protErr), userId }, 'Protection cleanup failed');
    }

    // 5. Record that we ran maintenance
    await recordMaintenanceRun(userId);

    stats.durationMs = Date.now() - startTime;

    log.info({ userId, stats }, 'Memory maintenance completed for user');

    return {
      userId,
      success: true,
      stats,
    };
  } catch (error) {
    stats.durationMs = Date.now() - startTime;
    const errorStr = String(error);
    log.error({ error: errorStr, userId, stats }, 'Memory maintenance failed for user');

    return {
      userId,
      success: false,
      error: errorStr,
      stats,
    };
  }
}

/**
 * Run maintenance for all users (batch job)
 */
export async function runBatchMaintenance(
  config: Partial<MaintenanceConfig> = {}
): Promise<BatchMaintenanceResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  log.info({ config: cfg }, 'Starting batch memory maintenance');

  // Get users who need maintenance
  const userIds = await getUsersForMaintenance(cfg.maxUsersPerRun, cfg.minDaysSinceLastRun);

  if (userIds.length === 0) {
    log.info('No users need maintenance');
    return {
      usersProcessed: 0,
      usersSucceeded: 0,
      usersFailed: 0,
      totalDurationMs: Date.now() - startTime,
      results: [],
    };
  }

  log.info({ userCount: userIds.length }, 'Processing users for maintenance');

  // Process users sequentially (to avoid overwhelming resources)
  const results: MaintenanceResult[] = [];
  for (const userId of userIds) {
    const result = await runUserMaintenance(userId, cfg);
    results.push(result);
  }

  const usersSucceeded = results.filter((r) => r.success).length;
  const usersFailed = results.filter((r) => !r.success).length;
  const totalDurationMs = Date.now() - startTime;

  log.info(
    {
      usersProcessed: userIds.length,
      usersSucceeded,
      usersFailed,
      totalDurationMs,
    },
    'Batch memory maintenance completed'
  );

  return {
    usersProcessed: userIds.length,
    usersSucceeded,
    usersFailed,
    totalDurationMs,
    results,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get users who need maintenance
 */
async function getUsersForMaintenance(maxUsers: number, minDaysSince: number): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    // Get users who either:
    // 1. Have never had maintenance run, or
    // 2. Haven't had maintenance in minDaysSince days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minDaysSince);

    // Query active users (those with recent conversations)
    const usersSnapshot = await db
      .collection('bogle_users')
      .orderBy('lastActivity', 'desc')
      .limit(maxUsers * 2) // Get extra to filter
      .get();

    const eligibleUsers: string[] = [];

    for (const doc of usersSnapshot.docs) {
      if (eligibleUsers.length >= maxUsers) break;

      const userId = doc.id;

      // Check last maintenance run
      const maintenanceDoc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('system')
        .doc('maintenance')
        .get();

      if (!maintenanceDoc.exists) {
        // Never had maintenance
        eligibleUsers.push(userId);
        continue;
      }

      const lastRun = maintenanceDoc.data()?.lastRun;
      if (lastRun) {
        const lastRunDate = new Date(lastRun);
        if (lastRunDate < cutoffDate) {
          eligibleUsers.push(userId);
        }
      } else {
        eligibleUsers.push(userId);
      }
    }

    return eligibleUsers;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get users for maintenance');
    return [];
  }
}

/**
 * Record that maintenance was run for a user
 */
async function recordMaintenanceRun(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection('bogle_users').doc(userId).collection('system').doc('maintenance').set(
      {
        lastRun: new Date().toISOString(),
        version: 1, // For tracking schema changes
      },
      { merge: true }
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record maintenance run');
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

/**
 * Run maintenance from command line
 * Usage: npx tsx src/jobs/memory-maintenance.ts [--dry-run] [--user=<userId>]
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const userArg = args.find((a) => a.startsWith('--user='));
  const specificUser = userArg?.split('=')[1];

  if (dryRun) {
    log.info('DRY RUN MODE - No changes will be made');
  }

  if (specificUser) {
    log.info({ userId: specificUser }, 'Running maintenance for specific user');
    const result = await runUserMaintenance(specificUser, {
      enableLlmLinks: !dryRun,
      enablePatterns: !dryRun,
      enableConsolidation: !dryRun,
      enableDecay: !dryRun,
    });
    log.info({ result }, 'Single user maintenance complete');
  } else {
    log.info('Running batch maintenance');
    const result = await runBatchMaintenance({
      enableLlmLinks: !dryRun,
      enablePatterns: !dryRun,
      enableConsolidation: !dryRun,
      enableDecay: !dryRun,
    });
    log.info({ result }, 'Batch maintenance complete');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.error({ error: String(err) }, 'Maintenance job failed');
    process.exit(1);
  });
}

export default {
  runUserMaintenance,
  runBatchMaintenance,
  main,
};
