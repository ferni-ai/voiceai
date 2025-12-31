/**
 * Profile Analysis Script
 *
 * Analyzes user profiles in Firestore to identify:
 * - Empty anonymous test profiles
 * - Real user profiles
 * - Profiles with conversation data
 *
 * Usage:
 *   pnpm ops:profiles
 *   npx tsx scripts/analyze-profiles.ts
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { getLogger } from '../src/utils/safe-logger.js';

const log = getLogger();

interface ProfileAnalysis {
  id: string;
  isAnonymous: boolean;
  hasProfileData: boolean;
  hasConversations: boolean;
  createdAt: string;
  lastSeen: string;
}

async function analyzeProfiles(): Promise<void> {
  log.info('📊 Starting profile analysis...');

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
    admin.initializeApp({ projectId });
    log.info({ projectId }, 'Firebase Admin initialized');
  }

  const db = admin.firestore();
  const profilesRef = db.collection('bogle_users');
  const snapshot = await profilesRef.limit(500).get();

  log.info({ totalProfiles: snapshot.size }, 'Profiles found');

  const analysis: ProfileAnalysis[] = [];
  let emptyAnonymousCount = 0;
  let withConversationsCount = 0;
  let realUsersCount = 0;
  const realUserIds: string[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = doc.id;
    const isAnonymous = userId.startsWith('anon:');

    // Check for nested profile data
    const hasProfileData =
      !!data.profile?.name ||
      !!data.profile?.fourTendency ||
      Object.keys(data.profile || {}).length > 2;

    // Check for conversations
    const hasConversations = (data.profile?.totalConversations || 0) > 0;

    analysis.push({
      id: userId.substring(0, 20) + (userId.length > 20 ? '...' : ''),
      isAnonymous,
      hasProfileData,
      hasConversations,
      createdAt: data.createdAt?.toDate?.().toISOString().split('T')[0] || 'unknown',
      lastSeen: data.lastSeen?.toDate?.().toISOString().split('T')[0] || 'unknown',
    });

    if (isAnonymous && !hasProfileData && !hasConversations) {
      emptyAnonymousCount++;
    } else if (hasConversations) {
      withConversationsCount++;
    } else if (!isAnonymous && hasProfileData) {
      realUsersCount++;
      realUserIds.push(userId);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 PROFILE ANALYSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total profiles:              ${snapshot.size}`);
  console.log(`Empty anonymous (deletable): ${emptyAnonymousCount}`);
  console.log(`With conversations:          ${withConversationsCount}`);
  console.log(`Real users (non-anon):       ${realUsersCount}`);
  console.log('='.repeat(60));

  if (emptyAnonymousCount > 0) {
    console.log('\n💡 TIP: Run "pnpm ops:profiles:clean" to delete empty anonymous profiles');
  }

  // Print sample table
  console.log('\n📋 Sample profiles (first 15):');
  console.table(analysis.slice(0, 15));

  if (realUserIds.length > 0) {
    console.log(`\n👤 Real user IDs: ${realUserIds.slice(0, 5).join(', ')}${realUserIds.length > 5 ? '...' : ''}`);
  }
}

analyzeProfiles().catch((err) => {
  log.error({ error: String(err) }, 'Profile analysis failed');
  process.exit(1);
});
