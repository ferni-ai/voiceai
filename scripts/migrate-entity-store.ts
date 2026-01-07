#!/usr/bin/env npx tsx
/**
 * Entity Store Migration Script
 *
 * Migrates user data from legacy fragmented collections into the unified entity store.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-entity-store.ts --user=<userId>           # Migrate single user
 *   pnpm tsx scripts/migrate-entity-store.ts --user=<userId> --dry-run # Preview only
 *   pnpm tsx scripts/migrate-entity-store.ts --all --limit=100         # Migrate batch
 *   pnpm tsx scripts/migrate-entity-store.ts --stats --user=<userId>   # Show stats
 *
 * @module scripts/migrate-entity-store
 */

import { parseArgs } from 'node:util';

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    user: { type: 'string', short: 'u' },
    all: { type: 'boolean', short: 'a' },
    'dry-run': { type: 'boolean', short: 'd' },
    limit: { type: 'string', short: 'l' },
    stats: { type: 'boolean', short: 's' },
    help: { type: 'boolean', short: 'h' },
  },
});

function printUsage() {
  console.log(`
Entity Store Migration Script

Migrates user data from legacy fragmented collections:
  - user_contacts
  - contact_relationships
  - relationship_network
  - relationship_nodes
  - guest_profiles

into the unified entity store.

USAGE:
  pnpm tsx scripts/migrate-entity-store.ts [OPTIONS]

OPTIONS:
  -u, --user <userId>    Migrate a single user
  -a, --all              Migrate all users (batch mode)
  -d, --dry-run          Preview changes without writing
  -l, --limit <n>        Limit batch size (default: 100)
  -s, --stats            Show migration stats for a user
  -h, --help             Show this help

EXAMPLES:
  # Preview migration for a user
  pnpm tsx scripts/migrate-entity-store.ts --user=abc123 --dry-run

  # Actually run migration for a user
  pnpm tsx scripts/migrate-entity-store.ts --user=abc123

  # Migrate first 50 users
  pnpm tsx scripts/migrate-entity-store.ts --all --limit=50

  # Check migration stats
  pnpm tsx scripts/migrate-entity-store.ts --stats --user=abc123
`);
}

async function main() {
  if (values.help) {
    printUsage();
    process.exit(0);
  }

  // Dynamic import to avoid loading heavy modules for help
  const { migrateUser, migrateAllUsers } = await import('../src/memory/entity-store/migration.js');
  const { getEntityStoreStats, hasEntityStore } = await import('../src/memory/entity-store/storage.js');
  const {
    readUserContacts,
    readContactRelationships,
    readRelationshipNetwork,
    readRelationshipNodes,
    readGuestProfiles,
  } = await import('../src/memory/entity-store/migration.js');

  const dryRun = values['dry-run'] ?? false;

  // Stats mode
  if (values.stats) {
    if (!values.user) {
      console.error('Error: --stats requires --user=<userId>');
      process.exit(1);
    }

    console.log(`\n📊 Migration stats for user: ${values.user}\n`);

    // Read legacy collections
    const [userContacts, contactRelationships, relationshipNetwork, relationshipNodes, guestProfiles] =
      await Promise.all([
        readUserContacts(values.user),
        readContactRelationships(values.user),
        readRelationshipNetwork(values.user),
        readRelationshipNodes(values.user),
        readGuestProfiles(values.user),
      ]);

    console.log('Legacy Collections:');
    console.log(`  user_contacts:         ${userContacts.length}`);
    console.log(`  contact_relationships: ${contactRelationships.length}`);
    console.log(`  relationship_network:  ${relationshipNetwork.length}`);
    console.log(`  relationship_nodes:    ${relationshipNodes.length}`);
    console.log(`  guest_profiles:        ${guestProfiles.length}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  TOTAL LEGACY:          ${userContacts.length + contactRelationships.length + relationshipNetwork.length + relationshipNodes.length + guestProfiles.length}`);

    // Check entity store
    const hasStore = await hasEntityStore(values.user);
    if (hasStore) {
      const stats = await getEntityStoreStats(values.user);
      console.log('\nUnified Entity Store:');
      console.log(`  entities:              ${stats.entityCount}`);
      console.log(`  mentions:              ${stats.mentionCount}`);
      console.log(`  relationships:         ${stats.relationshipCount}`);
      console.log('\nEntity Types:');
      for (const [type, count] of Object.entries(stats.entityTypes)) {
        console.log(`  ${type}: ${count}`);
      }
    } else {
      console.log('\nUnified Entity Store: NOT MIGRATED');
    }

    process.exit(0);
  }

  // Single user migration
  if (values.user) {
    console.log(`\n🚀 Migrating user: ${values.user}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE'}\n`);

    const result = await migrateUser(values.user, { dryRun });

    console.log('\n📋 Migration Result:');
    console.log(`   User:             ${result.userId}`);
    console.log(`   Entities Created: ${result.entitiesCreated}`);
    console.log(`   Duplicates Merged: ${result.entitiesMerged}`);
    console.log(`   Duration:         ${result.duration}ms`);

    console.log('\n   Legacy Collections Read:');
    console.log(`     user_contacts:         ${result.legacyCollections.userContacts}`);
    console.log(`     contact_relationships: ${result.legacyCollections.contactRelationships}`);
    console.log(`     relationship_network:  ${result.legacyCollections.relationshipNetwork}`);
    console.log(`     relationship_nodes:    ${result.legacyCollections.relationshipNodes}`);
    console.log(`     guest_profiles:        ${result.legacyCollections.guestProfiles}`);

    if (result.errors.length > 0) {
      console.log('\n   ⚠️  Errors:');
      for (const error of result.errors) {
        console.log(`     - ${error}`);
      }
    }

    if (dryRun) {
      console.log('\n   ℹ️  This was a dry run. Run without --dry-run to apply changes.');
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  }

  // Batch migration
  if (values.all) {
    const limit = parseInt(values.limit || '100', 10);

    console.log(`\n🚀 Batch migration starting`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
    console.log(`   Limit: ${limit} users\n`);

    const result = await migrateAllUsers({ dryRun, limit });

    console.log('\n📋 Batch Migration Result:');
    console.log(`   Total Users:      ${result.totalUsers}`);
    console.log(`   Successful:       ${result.successfulUsers}`);
    console.log(`   Failed:           ${result.failedUsers}`);
    console.log(`   Total Entities:   ${result.totalEntities}`);
    console.log(`   Total Merged:     ${result.totalMerged}`);

    if (result.errors.length > 0) {
      console.log(`\n   ⚠️  Errors (${result.errors.length}):`);
      for (const error of result.errors.slice(0, 10)) {
        console.log(`     - ${error}`);
      }
      if (result.errors.length > 10) {
        console.log(`     ... and ${result.errors.length - 10} more`);
      }
    }

    if (dryRun) {
      console.log('\n   ℹ️  This was a dry run. Run without --dry-run to apply changes.');
    }

    process.exit(result.failedUsers > 0 ? 1 : 0);
  }

  // No valid option provided
  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
