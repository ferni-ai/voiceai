#!/usr/bin/env npx tsx

/**
 * Entity Store Migration CLI
 *
 * Batch migration script for migrating all users from legacy collections
 * to the unified entity store.
 *
 * Usage:
 *   npx tsx scripts/migrate-all-users.ts --dry-run              # Preview migration
 *   npx tsx scripts/migrate-all-users.ts --limit 10             # Migrate 10 users
 *   npx tsx scripts/migrate-all-users.ts --user USER_ID         # Migrate single user
 *   npx tsx scripts/migrate-all-users.ts --validate USER_ID     # Validate user
 *   npx tsx scripts/migrate-all-users.ts --rollback MIGRATION_ID USER_ID  # Rollback
 *   npx tsx scripts/migrate-all-users.ts --status               # Show migration status
 *
 * @module scripts/migrate-all-users
 */

import { parseArgs } from 'node:util';

// Parse CLI arguments
const { values, positionals } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string', default: '100' },
    user: { type: 'string' },
    validate: { type: 'string' },
    rollback: { type: 'boolean', default: false },
    status: { type: 'boolean', default: false },
    'start-after': { type: 'string' },
    parallelism: { type: 'string', default: '5' },
    'conflict-strategy': { type: 'string', default: 'merge' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

// ============================================================================
// HELPERS
// ============================================================================

function printUsage(): void {
  console.log(`
Entity Store Migration CLI

Usage:
  npx tsx scripts/migrate-all-users.ts [options]

Options:
  --dry-run                  Preview migration without making changes
  --limit <n>                Maximum number of users to migrate (default: 100)
  --user <id>                Migrate a single user by ID
  --validate <id>            Validate migration for a user without executing
  --rollback <migration_id>  Rollback a migration (requires positional user_id)
  --status                   Show migration health/status
  --start-after <id>         Start after this user ID (for pagination)
  --parallelism <n>          Number of concurrent migrations (default: 5)
  --conflict-strategy <s>    Strategy: merge|prefer_new|prefer_existing (default: merge)
  -h, --help                 Show this help message

Examples:
  # Preview migration for all users (first 100)
  npx tsx scripts/migrate-all-users.ts --dry-run

  # Migrate 50 users
  npx tsx scripts/migrate-all-users.ts --limit 50

  # Migrate a single user
  npx tsx scripts/migrate-all-users.ts --user user_abc123

  # Validate migration for a user
  npx tsx scripts/migrate-all-users.ts --validate user_abc123

  # Rollback a migration
  npx tsx scripts/migrate-all-users.ts --rollback mig_123 user_abc123

  # Check migration status
  npx tsx scripts/migrate-all-users.ts --status

  # Continue from last position
  npx tsx scripts/migrate-all-users.ts --start-after user_xyz --limit 100
`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatProgress(current: number, total: number): string {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
  return `[${bar}] ${percent}% (${current}/${total})`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  if (values.help) {
    printUsage();
    process.exit(0);
  }

  // Lazy import to avoid loading heavy dependencies for --help
  const {
    migrateUser,
    migrateAllUsers,
    validateMigration,
    rollbackMigration,
    getMigrationHealth,
  } = await import('../src/memory/entity-store/migration.js');

  const { ConflictStrategy } = await import('../src/memory/entity-store/migration.js');

  // ========== STATUS ==========
  if (values.status) {
    console.log('\n📊 Migration Status\n');
    const health = getMigrationHealth();

    console.log(`Active migrations:    ${health.activeMigrations}`);
    console.log(`Completed migrations: ${health.completedMigrations}`);
    console.log(`Failed migrations:    ${health.failedMigrations}`);

    if (health.recentMigrations.length > 0) {
      console.log('\nRecent migrations (last 24h):');
      console.log('─'.repeat(80));
      for (const m of health.recentMigrations) {
        const status = m.status === 'completed' ? '✅' : m.status === 'failed' ? '❌' : '⏳';
        console.log(
          `  ${status} ${m.migrationId} | User: ${m.userId} | ` +
            `Entities: ${m.entitiesCreated} | Duration: ${formatDuration(m.duration)}`
        );
      }
    }

    process.exit(0);
  }

  // ========== VALIDATE ==========
  if (values.validate) {
    const userId = values.validate;
    console.log(`\n🔍 Validating migration for user: ${userId}\n`);

    const validation = await validateMigration(userId);

    console.log('Validation Result:');
    console.log(`  Valid: ${validation.valid ? '✅ Yes' : '❌ No'}`);
    console.log('\nStats:');
    console.log(`  Legacy records:      ${validation.stats.legacyRecordCount}`);
    console.log(`  Existing entities:   ${validation.stats.existingEntityCount}`);
    console.log(`  Estimated new:       ${validation.stats.estimatedNewEntities}`);

    if (validation.issues.length > 0) {
      console.log('\nIssues:');
      for (const issue of validation.issues) {
        console.log(`  ⚠️  ${issue}`);
      }
    }

    process.exit(validation.valid ? 0 : 1);
  }

  // ========== ROLLBACK ==========
  if (values.rollback) {
    const migrationId = positionals[0];
    const userId = positionals[1];

    if (!migrationId || !userId) {
      console.error('❌ Rollback requires migration_id and user_id');
      console.error('   Usage: --rollback <migration_id> <user_id>');
      process.exit(1);
    }

    console.log(`\n🔄 Rolling back migration: ${migrationId} for user: ${userId}\n`);

    const result = await rollbackMigration(migrationId, userId);

    if (result.success) {
      console.log(`✅ Rollback successful`);
      console.log(`   Deleted ${result.deletedCount} entities`);
    } else {
      console.log(`❌ Rollback failed`);
      for (const error of result.errors) {
        console.log(`   Error: ${error}`);
      }
    }

    process.exit(result.success ? 0 : 1);
  }

  // ========== SINGLE USER MIGRATION ==========
  if (values.user) {
    const userId = values.user;
    const dryRun = values['dry-run'];

    console.log(`\n🚀 Migrating user: ${userId}${dryRun ? ' (DRY RUN)' : ''}\n`);

    const startTime = Date.now();
    const result = await migrateUser(userId, {
      dryRun,
      conflictStrategy: (values['conflict-strategy'] || 'merge') as 'merge' | 'prefer_new' | 'prefer_existing',
      onProgress: (progress) => {
        process.stdout.write(
          `\r  ${formatProgress(progress.processed, progress.total)} - ${progress.currentItem || ''}`
        );
      },
    });

    console.log('\n');
    console.log('─'.repeat(60));
    console.log(`Migration ID:     ${result.migrationId}`);
    console.log(`Status:           ${result.status}`);
    console.log(`Duration:         ${formatDuration(result.duration)}`);
    console.log('─'.repeat(60));
    console.log(`Entities created: ${result.entitiesCreated}`);
    console.log(`Entities merged:  ${result.entitiesMerged}`);
    console.log(`Conflicts:        ${result.conflicts.detected} (${result.conflicts.autoResolved} auto-resolved)`);
    console.log('─'.repeat(60));
    console.log('Legacy collections:');
    console.log(`  user_contacts:          ${result.legacyCollections.userContacts}`);
    console.log(`  contact_relationships:  ${result.legacyCollections.contactRelationships}`);
    console.log(`  relationship_network:   ${result.legacyCollections.relationshipNetwork}`);
    console.log(`  relationship_nodes:     ${result.legacyCollections.relationshipNodes}`);
    console.log(`  guest_profiles:         ${result.legacyCollections.guestProfiles}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors.slice(0, 10)) {
        console.log(`  ❌ ${error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    if (dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made');
    }

    process.exit(result.errors.length === 0 ? 0 : 1);
  }

  // ========== BATCH MIGRATION ==========
  const dryRun = values['dry-run'];
  const limit = parseInt(values.limit || '100', 10);
  const parallelism = parseInt(values.parallelism || '5', 10);
  const startAfter = values['start-after'];

  console.log(`\n🚀 Batch Migration${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`   Limit: ${limit} users`);
  console.log(`   Parallelism: ${parallelism}`);
  if (startAfter) {
    console.log(`   Starting after: ${startAfter}`);
  }
  console.log('');

  const startTime = Date.now();
  const result = await migrateAllUsers({
    dryRun,
    limit,
    parallelism,
    startAfter,
    conflictStrategy: (values['conflict-strategy'] || 'merge') as 'merge' | 'prefer_new' | 'prefer_existing',
    onBatchProgress: (progress) => {
      process.stdout.write(
        `\r  ${formatProgress(progress.processedUsers, progress.totalUsers)} ` +
          `| ✅ ${progress.successfulUsers} | ❌ ${progress.failedUsers}`
      );
    },
  });

  console.log('\n\n');
  console.log('═'.repeat(60));
  console.log('                    BATCH MIGRATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Batch ID:          ${result.batchId}`);
  console.log(`Duration:          ${formatDuration(result.duration)}`);
  console.log('─'.repeat(60));
  console.log(`Total users:       ${result.totalUsers}`);
  console.log(`Successful:        ${result.successfulUsers}`);
  console.log(`Failed:            ${result.failedUsers}`);
  console.log('─'.repeat(60));
  console.log(`Total entities:    ${result.totalEntities}`);
  console.log(`Total merged:      ${result.totalMerged}`);
  console.log(`Total conflicts:   ${result.totalConflicts}`);

  if (result.lastUserId) {
    console.log('─'.repeat(60));
    console.log(`Last user ID:      ${result.lastUserId}`);
    console.log(`(Use --start-after ${result.lastUserId} to continue)`);
  }

  if (result.errors.length > 0) {
    console.log('─'.repeat(60));
    console.log(`Errors (${result.errors.length}):`);
    for (const error of result.errors.slice(0, 10)) {
      console.log(`  ❌ ${error}`);
    }
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more errors`);
    }
  }

  console.log('═'.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes were made\n');
  }

  process.exit(result.failedUsers === 0 ? 0 : 1);
}

// Run
main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
