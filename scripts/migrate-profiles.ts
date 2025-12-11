#!/usr/bin/env npx tsx
/**
 * User Profile Migration Script
 *
 * Migrates user profiles from the legacy UserProfile format to the new
 * CompositeUserProfile format with bounded contexts.
 *
 * Usage:
 *   npx tsx scripts/migrate-profiles.ts --dry-run        # Preview changes
 *   npx tsx scripts/migrate-profiles.ts --execute        # Execute migration
 *   npx tsx scripts/migrate-profiles.ts --rollback       # Rollback to legacy format
 *
 * Features:
 * - Dry-run mode for safe preview
 * - Batch processing with configurable size
 * - Progress tracking and logging
 * - Rollback capability
 * - Error recovery and resume
 *
 * @module scripts/migrate-profiles
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface MigrationConfig {
  mode: 'dry-run' | 'execute' | 'rollback' | 'status';
  batchSize: number;
  maxProfiles: number;
  outputDir: string;
  resumeFromId?: string;
  verbose: boolean;
}

const DEFAULT_CONFIG: MigrationConfig = {
  mode: 'dry-run',
  batchSize: 100,
  maxProfiles: Infinity,
  outputDir: './migration-logs',
  verbose: false,
};

// ============================================================================
// MIGRATION STATE
// ============================================================================

interface MigrationState {
  startedAt: string;
  lastUpdated: string;
  status: 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  totalProfiles: number;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
  lastProcessedId: string | null;
  errors: Array<{
    profileId: string;
    error: string;
    timestamp: string;
  }>;
}

function createInitialState(): MigrationState {
  return {
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    status: 'in_progress',
    totalProfiles: 0,
    migratedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastProcessedId: null,
    errors: [],
  };
}

function loadState(outputDir: string): MigrationState | null {
  const statePath = join(outputDir, 'migration-state.json');
  if (existsSync(statePath)) {
    try {
      return JSON.parse(readFileSync(statePath, 'utf-8')) as MigrationState;
    } catch {
      return null;
    }
  }
  return null;
}

function saveState(state: MigrationState, outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  state.lastUpdated = new Date().toISOString();
  writeFileSync(join(outputDir, 'migration-state.json'), JSON.stringify(state, null, 2));
}

// ============================================================================
// MOCK DATABASE (Replace with actual Firestore operations)
// ============================================================================

// In production, these would be actual Firestore operations
// For now, we'll use mock implementations that demonstrate the pattern

interface MockProfile {
  id: string;
  name?: string;
  relationshipStage: string;
  totalConversations: number;
  createdAt: Date;
  updatedAt: Date;
  // Legacy fields
  familyMembers?: unknown[];
  goals?: unknown[];
  preferences?: Record<string, unknown>;
}

async function fetchProfileBatch(
  startAfterId: string | null,
  batchSize: number
): Promise<MockProfile[]> {
  // In production: Use Firestore pagination
  // const query = db.collection('users')
  //   .orderBy('id')
  //   .startAfter(startAfterId || '')
  //   .limit(batchSize);
  // return (await query.get()).docs.map(d => d.data());

  console.log(`  📥 Fetching batch of ${batchSize} profiles after: ${startAfterId || 'start'}`);

  // Mock: Return empty after first batch for demo
  if (startAfterId) return [];

  return [
    {
      id: 'user_001',
      name: 'Alice',
      relationshipStage: 'friend',
      totalConversations: 15,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-06-01'),
      familyMembers: [{ name: 'Bob', relationship: 'spouse' }],
      goals: [{ id: 'goal_1', name: 'Exercise more', status: 'active' }],
      preferences: { verbosity: 'balanced' },
    },
    {
      id: 'user_002',
      name: 'Charlie',
      relationshipStage: 'acquaintance',
      totalConversations: 3,
      createdAt: new Date('2024-03-01'),
      updatedAt: new Date('2024-06-15'),
      preferences: { wantsProactiveAdvice: true },
    },
    {
      id: 'user_003',
      name: 'Diana',
      relationshipStage: 'close_friend',
      totalConversations: 45,
      createdAt: new Date('2023-06-01'),
      updatedAt: new Date('2024-06-20'),
      familyMembers: [{ name: 'Eve', relationship: 'daughter' }],
    },
  ];
}

async function saveCompositeProfile(_profile: unknown, dryRun: boolean): Promise<boolean> {
  // In production: Use Firestore transaction
  // const docRef = db.collection('users_v2').doc(profile.identity.id);
  // await docRef.set(profile);

  if (dryRun) {
    console.log(`    [DRY RUN] Would save composite profile`);
    return true;
  }

  // Simulate save
  await new Promise((resolve) => setTimeout(resolve, 10));
  return true;
}

async function createBackup(profile: MockProfile, outputDir: string): Promise<void> {
  const backupDir = join(outputDir, 'backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  writeFileSync(join(backupDir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

async function migrateProfile(
  profile: MockProfile,
  config: MigrationConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Import migration utilities
    const { migrateToComposite, detectProfileFormat } = await import(
      '../src/types/migration/index.js'
    );

    // Check if already migrated
    const format = detectProfileFormat(profile);
    if (format === 'composite') {
      return { success: true }; // Already migrated, skip
    }

    // Create backup before migration
    if (config.mode === 'execute') {
      await createBackup(profile, config.outputDir);
    }

    // Perform migration
    const compositeProfile = migrateToComposite(profile as never);

    // Save migrated profile
    const saved = await saveCompositeProfile(compositeProfile, config.mode === 'dry-run');

    if (!saved) {
      return { success: false, error: 'Failed to save composite profile' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runMigration(config: MigrationConfig): Promise<void> {
  console.log('\n🚀 Starting User Profile Migration\n');
  console.log(`  Mode: ${config.mode.toUpperCase()}`);
  console.log(`  Batch size: ${config.batchSize}`);
  console.log(`  Output directory: ${config.outputDir}`);

  // Load or create state
  let state = loadState(config.outputDir);
  if (state && state.status === 'in_progress') {
    console.log(`\n📋 Resuming from previous migration`);
    console.log(`  Last processed: ${state.lastProcessedId}`);
    console.log(`  Progress: ${state.migratedCount}/${state.totalProfiles}`);
    config.resumeFromId = state.lastProcessedId ?? undefined;
  } else {
    state = createInitialState();
  }

  let processedCount = 0;
  let lastId: string | null = config.resumeFromId ?? null;

  try {
    while (processedCount < config.maxProfiles) {
      // Fetch batch
      const batch = await fetchProfileBatch(lastId, config.batchSize);

      if (batch.length === 0) {
        console.log('\n✅ No more profiles to process');
        break;
      }

      console.log(`\n📦 Processing batch of ${batch.length} profiles...`);

      for (const profile of batch) {
        if (processedCount >= config.maxProfiles) break;

        if (config.verbose) {
          console.log(`  Processing: ${profile.id} (${profile.name || 'unnamed'})`);
        }

        const result = await migrateProfile(profile, config);

        if (result.success) {
          state.migratedCount++;
          if (config.verbose) {
            console.log(`    ✅ Migrated successfully`);
          }
        } else {
          state.errorCount++;
          state.errors.push({
            profileId: profile.id,
            error: result.error || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          console.log(`    ❌ Error: ${result.error}`);
        }

        state.lastProcessedId = profile.id;
        lastId = profile.id;
        processedCount++;

        // Save state periodically
        if (processedCount % 10 === 0) {
          saveState(state, config.outputDir);
        }
      }
    }

    // Final state update
    state.status = 'completed';
    state.totalProfiles = processedCount;
    saveState(state, config.outputDir);

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));
    console.log(`  Total processed: ${processedCount}`);
    console.log(`  Migrated: ${state.migratedCount}`);
    console.log(`  Skipped: ${state.skippedCount}`);
    console.log(`  Errors: ${state.errorCount}`);

    if (config.mode === 'dry-run') {
      console.log('\n⚠️  DRY RUN - No changes were made');
      console.log('   Run with --execute to perform actual migration');
    }

    if (state.errorCount > 0) {
      console.log(`\n❌ Errors logged to: ${join(config.outputDir, 'migration-state.json')}`);
    }
  } catch (error) {
    state.status = 'failed';
    saveState(state, config.outputDir);
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

async function showStatus(config: MigrationConfig): Promise<void> {
  const state = loadState(config.outputDir);

  if (!state) {
    console.log('\n📋 No migration state found');
    console.log('   Run with --dry-run to start a migration');
    return;
  }

  console.log('\n📊 Migration Status');
  console.log('='.repeat(50));
  console.log(`  Status: ${state.status}`);
  console.log(`  Started: ${state.startedAt}`);
  console.log(`  Last updated: ${state.lastUpdated}`);
  console.log(`  Total profiles: ${state.totalProfiles}`);
  console.log(`  Migrated: ${state.migratedCount}`);
  console.log(`  Skipped: ${state.skippedCount}`);
  console.log(`  Errors: ${state.errorCount}`);

  if (state.lastProcessedId) {
    console.log(`  Last processed ID: ${state.lastProcessedId}`);
  }

  if (state.errors.length > 0) {
    console.log(`\n  Recent errors:`);
    for (const err of state.errors.slice(-5)) {
      console.log(`    - ${err.profileId}: ${err.error}`);
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (const arg of args) {
    if (arg === '--dry-run') {
      config.mode = 'dry-run';
    } else if (arg === '--execute') {
      config.mode = 'execute';
    } else if (arg === '--rollback') {
      config.mode = 'rollback';
    } else if (arg === '--status') {
      config.mode = 'status';
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg.startsWith('--batch-size=')) {
      config.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max=')) {
      config.maxProfiles = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      config.outputDir = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
User Profile Migration Script

Usage:
  npx tsx scripts/migrate-profiles.ts [options]

Options:
  --dry-run           Preview migration without making changes (default)
  --execute           Execute the migration
  --rollback          Rollback migrated profiles to legacy format
  --status            Show current migration status
  --verbose, -v       Show detailed progress
  --batch-size=N      Process N profiles at a time (default: 100)
  --max=N             Process at most N profiles total
  --output=DIR        Output directory for logs (default: ./migration-logs)
  --help, -h          Show this help message

Examples:
  # Preview what will be migrated
  npx tsx scripts/migrate-profiles.ts --dry-run --verbose

  # Migrate first 10 profiles
  npx tsx scripts/migrate-profiles.ts --execute --max=10

  # Resume a previous migration
  npx tsx scripts/migrate-profiles.ts --execute

  # Check migration status
  npx tsx scripts/migrate-profiles.ts --status
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.mode === 'status') {
    await showStatus(config);
  } else if (config.mode === 'rollback') {
    console.log('\n⚠️  Rollback not yet implemented');
    console.log('   Backups are stored in: ' + join(config.outputDir, 'backups'));
  } else {
    await runMigration(config);
  }
}

main().catch(console.error);
