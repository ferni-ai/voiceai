#!/usr/bin/env npx tsx
/**
 * Bulk Migration Script: Legacy Profiles → Firebase UIDs
 * 
 * This script handles the migration of device:* and anon:* profiles.
 * 
 * STRATEGY:
 * - Device profiles can only be migrated when the user reconnects with Firebase UID
 *   (auto-migration handles this - see user-identification.ts)
 * - This script focuses on:
 *   1. Identifying profiles that need migration
 *   2. Cleaning up truly abandoned anon:* profiles (>30 days old, 0 conversations)
 *   3. Generating a report for monitoring migration progress
 * 
 * Usage:
 *   npx tsx scripts/migrate-legacy-profiles.ts [--clean] [--dry-run]
 * 
 * Options:
 *   --clean    Delete abandoned anon:* profiles (>30 days, 0 convos)
 *   --dry-run  Show what would happen without making changes
 */

import { Firestore } from '@google-cloud/firestore';

const db = new Firestore({ projectId: 'johnb-2025' });
const COLLECTION = 'bogle_users';

interface ProfileStats {
  total: number;
  firebaseUid: number;
  device: number;
  anon: number;
  phone: number;
  other: number;
  withNames: number;
  withConversations: number;
  abandonedAnon: number;
}

interface ProfileDoc {
  id: string;
  name?: string;
  totalConversations?: number;
  lastContact?: { toDate?: () => Date } | Date;
  updatedAt?: { toDate?: () => Date } | Date;
  createdAt?: { toDate?: () => Date } | Date;
}

function categorizeProfileId(id: string): 'firebaseUid' | 'device' | 'anon' | 'phone' | 'other' {
  if (id.startsWith('device:')) return 'device';
  if (id.startsWith('anon:')) return 'anon';
  if (id.startsWith('phone:')) return 'phone';
  // Firebase UIDs are alphanumeric, ~28 characters
  if (/^[a-zA-Z0-9]{20,}$/.test(id)) return 'firebaseUid';
  return 'other';
}

function getDate(field: unknown): Date | null {
  if (!field) return null;
  if (field instanceof Date) return field;
  if (typeof field === 'object' && 'toDate' in field && typeof (field as { toDate: () => Date }).toDate === 'function') {
    return (field as { toDate: () => Date }).toDate();
  }
  if (typeof field === 'string') return new Date(field);
  return null;
}

async function analyzeProfiles(): Promise<{
  stats: ProfileStats;
  abandonedAnon: ProfileDoc[];
  deviceWithData: ProfileDoc[];
}> {
  console.log('📊 Analyzing all profiles in Firestore...\n');
  
  const stats: ProfileStats = {
    total: 0,
    firebaseUid: 0,
    device: 0,
    anon: 0,
    phone: 0,
    other: 0,
    withNames: 0,
    withConversations: 0,
    abandonedAnon: 0,
  };

  const abandonedAnon: ProfileDoc[] = [];
  const deviceWithData: ProfileDoc[] = [];
  
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all profiles (paginated for large collections)
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let batchCount = 0;
  
  while (true) {
    let query = db.collection(COLLECTION).limit(500);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snap = await query.get();
    if (snap.empty) break;
    
    batchCount++;
    console.log(`  Processing batch ${batchCount} (${snap.size} profiles)...`);
    
    for (const doc of snap.docs) {
      const id = doc.id;
      const data = doc.data() as ProfileDoc;
      stats.total++;
      
      const category = categorizeProfileId(id);
      stats[category]++;
      
      if (data.name && data.name !== 'Friend') {
        stats.withNames++;
      }
      
      if ((data.totalConversations ?? 0) > 0) {
        stats.withConversations++;
      }
      
      // Track device profiles with valuable data
      if (category === 'device') {
        const hasData = 
          (data.totalConversations ?? 0) > 0 ||
          (data.name && data.name !== 'Friend');
        
        if (hasData) {
          deviceWithData.push({
            id,
            name: data.name,
            totalConversations: data.totalConversations,
            updatedAt: data.updatedAt,
          });
        }
      }
      
      // Track abandoned anon profiles
      if (category === 'anon') {
        const lastActivity = getDate(data.updatedAt) || getDate(data.lastContact) || getDate(data.createdAt);
        const isOld = lastActivity && lastActivity < thirtyDaysAgo;
        const isEmpty = (data.totalConversations ?? 0) === 0;
        
        if (isOld && isEmpty) {
          stats.abandonedAnon++;
          abandonedAnon.push({
            id,
            name: data.name,
            totalConversations: data.totalConversations,
            updatedAt: data.updatedAt,
          });
        }
      }
    }
    
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  
  return { stats, abandonedAnon, deviceWithData };
}

async function cleanupAbandonedProfiles(profiles: ProfileDoc[], dryRun: boolean): Promise<number> {
  console.log(`\n🧹 ${dryRun ? '[DRY RUN] Would clean' : 'Cleaning'} ${profiles.length} abandoned anon profiles...\n`);
  
  if (profiles.length === 0) {
    console.log('  No abandoned profiles to clean.');
    return 0;
  }
  
  let deleted = 0;
  const batchSize = 100;
  
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    
    if (dryRun) {
      for (const profile of batch) {
        console.log(`  [DRY RUN] Would delete: ${profile.id}`);
        deleted++;
      }
    } else {
      const writeBatch = db.batch();
      for (const profile of batch) {
        writeBatch.delete(db.collection(COLLECTION).doc(profile.id));
        deleted++;
      }
      await writeBatch.commit();
      console.log(`  Deleted batch ${Math.floor(i / batchSize) + 1} (${batch.length} profiles)`);
    }
  }
  
  return deleted;
}

function printReport(stats: ProfileStats, deviceWithData: ProfileDoc[]): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 LEGACY PROFILE MIGRATION REPORT');
  console.log('═'.repeat(60));
  
  console.log('\n📈 PROFILE DISTRIBUTION:');
  console.log('─'.repeat(40));
  console.log(`  Total profiles:      ${stats.total}`);
  console.log(`  Firebase UIDs:       ${stats.firebaseUid} (${pct(stats.firebaseUid, stats.total)})`);
  console.log(`  Device IDs:          ${stats.device} (${pct(stats.device, stats.total)})`);
  console.log(`  Anonymous:           ${stats.anon} (${pct(stats.anon, stats.total)})`);
  console.log(`  Phone:               ${stats.phone} (${pct(stats.phone, stats.total)})`);
  console.log(`  Other:               ${stats.other} (${pct(stats.other, stats.total)})`);
  
  console.log('\n📊 DATA QUALITY:');
  console.log('─'.repeat(40));
  console.log(`  With names:          ${stats.withNames} (${pct(stats.withNames, stats.total)})`);
  console.log(`  With conversations:  ${stats.withConversations} (${pct(stats.withConversations, stats.total)})`);
  console.log(`  Abandoned anon:      ${stats.abandonedAnon} (${pct(stats.abandonedAnon, stats.anon)} of anon)`);
  
  console.log('\n🎯 MIGRATION STATUS:');
  console.log('─'.repeat(40));
  const legacyWithData = deviceWithData.length;
  const migrated = stats.firebaseUid;
  const pending = legacyWithData;
  console.log(`  Already migrated:    ${migrated} profiles`);
  console.log(`  Pending migration:   ${pending} device profiles with data`);
  console.log(`  Auto-migration:      ✅ Enabled (will migrate on reconnect)`);
  
  if (deviceWithData.length > 0) {
    console.log('\n📋 DEVICE PROFILES WITH DATA (will auto-migrate on reconnect):');
    console.log('─'.repeat(60));
    deviceWithData.slice(0, 10).forEach((p, i) => {
      const updated = getDate(p.updatedAt);
      console.log(`  ${i + 1}. ${p.id.slice(0, 35)}...`);
      console.log(`     Name: ${p.name || '(none)'} | Convos: ${p.totalConversations || 0} | Last: ${updated?.toISOString().slice(0, 10) || 'unknown'}`);
    });
    if (deviceWithData.length > 10) {
      console.log(`  ... and ${deviceWithData.length - 10} more`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldClean = args.includes('--clean');
  const dryRun = args.includes('--dry-run');
  
  console.log('🔄 LEGACY PROFILE MIGRATION TOOL\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚡ LIVE'}`);
  console.log(`Clean abandoned: ${shouldClean ? '✅ Yes' : '❌ No'}`);
  console.log('');
  
  // Analyze profiles
  const { stats, abandonedAnon, deviceWithData } = await analyzeProfiles();
  
  // Print report
  printReport(stats, deviceWithData);
  
  // Clean up abandoned profiles if requested
  if (shouldClean && abandonedAnon.length > 0) {
    const deleted = await cleanupAbandonedProfiles(abandonedAnon, dryRun);
    console.log(`\n✅ ${dryRun ? 'Would delete' : 'Deleted'} ${deleted} abandoned profiles.`);
  }
  
  // Next steps
  console.log('\n📝 NEXT STEPS:');
  console.log('─'.repeat(40));
  console.log('1. Device profiles will auto-migrate when users reconnect with Firebase');
  console.log('2. Run this script periodically to monitor migration progress');
  console.log('3. Use --clean to remove abandoned anon profiles (>30 days, 0 convos)');
  console.log('4. Validate with: npx tsx scripts/validate-identity.ts --recent');
}

main().catch(console.error);

