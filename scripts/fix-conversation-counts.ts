/**
 * Fix Conversation Counts Migration Script
 * 
 * This script fixes a critical bug where totalConversations was never
 * incremented in session-manager.ts, causing all users to appear as
 * new users every time they connected.
 * 
 * What it does:
 * 1. Finds all users in Firestore
 * 2. Counts their actual conversations from the conversations subcollection
 * 3. Updates totalConversations to match the actual count
 * 4. Updates lastContact if conversations exist but it's not set
 * 
 * Run with:
 *   npx tsx scripts/fix-conversation-counts.ts
 * 
 * Or dry-run first:
 *   npx tsx scripts/fix-conversation-counts.ts --dry-run
 */

import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  databaseId: process.env.FIRESTORE_DATABASE || '(default)',
});

interface UserProfile {
  id: string;
  totalConversations?: number;
  lastContact?: Timestamp | Date;
  lastConversationSummary?: string;
}

interface ConversationDoc {
  startedAt: Timestamp;
  endedAt?: Timestamp;
  personaId: string;
  turnCount: number;
}

async function countUserConversations(userId: string): Promise<{
  count: number;
  lastConversation?: ConversationDoc;
}> {
  const conversationsRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversations');
  
  // Count all conversations
  const snapshot = await conversationsRef.get();
  const count = snapshot.size;
  
  // Get the most recent conversation
  let lastConversation: ConversationDoc | undefined;
  if (!snapshot.empty) {
    const sorted = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ConversationDoc & { id: string }))
      .sort((a, b) => {
        const aTime = a.startedAt?.toMillis?.() || 0;
        const bTime = b.startedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
    
    if (sorted.length > 0) {
      lastConversation = sorted[0];
    }
  }
  
  return { count, lastConversation };
}

async function fixUserProfile(userId: string, profile: UserProfile): Promise<{
  fixed: boolean;
  oldCount: number;
  newCount: number;
  lastContactUpdated: boolean;
}> {
  const { count, lastConversation } = await countUserConversations(userId);
  
  const oldCount = profile.totalConversations || 0;
  const needsCountFix = count > 0 && (oldCount === 0 || oldCount < count);
  const needsLastContactFix = count > 0 && !profile.lastContact && lastConversation?.startedAt;
  
  if (!needsCountFix && !needsLastContactFix) {
    return { fixed: false, oldCount, newCount: oldCount, lastContactUpdated: false };
  }
  
  const updates: Record<string, unknown> = {};
  
  if (needsCountFix) {
    updates.totalConversations = count;
    updates.updatedAt = FieldValue.serverTimestamp();
  }
  
  if (needsLastContactFix && lastConversation?.startedAt) {
    updates.lastContact = lastConversation.startedAt;
  }
  
  if (!DRY_RUN) {
    await db.collection('bogle_users').doc(userId).update(updates);
  }
  
  return {
    fixed: true,
    oldCount,
    newCount: count,
    lastContactUpdated: needsLastContactFix,
  };
}

async function main() {
  console.log('🔧 Fix Conversation Counts Migration');
  console.log('=====================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update Firestore)'}`);
  console.log('');
  
  let totalUsers = 0;
  let fixedUsers = 0;
  let skippedUsers = 0;
  let errorUsers = 0;
  
  // Get all users
  const usersSnapshot = await db.collection('bogle_users').get();
  totalUsers = usersSnapshot.size;
  
  console.log(`Found ${totalUsers} users to check`);
  console.log('');
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const profile = { id: userId, ...userDoc.data() } as UserProfile;
    
    try {
      const result = await fixUserProfile(userId, profile);
      
      if (result.fixed) {
        fixedUsers++;
        console.log(
          `✅ ${userId.slice(0, 20)}... : ${result.oldCount} → ${result.newCount} conversations` +
          (result.lastContactUpdated ? ' (lastContact updated)' : '')
        );
      } else {
        skippedUsers++;
        // Only log skips in verbose mode
        if (process.argv.includes('--verbose')) {
          console.log(`⏭️  ${userId.slice(0, 20)}... : OK (${result.oldCount} conversations)`);
        }
      }
    } catch (error) {
      errorUsers++;
      console.error(`❌ ${userId.slice(0, 20)}... : ERROR - ${error}`);
    }
  }
  
  console.log('');
  console.log('=====================================');
  console.log('Summary:');
  console.log(`  Total users:   ${totalUsers}`);
  console.log(`  Fixed:         ${fixedUsers}`);
  console.log(`  Skipped (OK):  ${skippedUsers}`);
  console.log(`  Errors:        ${errorUsers}`);
  console.log('');
  
  if (DRY_RUN && fixedUsers > 0) {
    console.log('⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else if (!DRY_RUN && fixedUsers > 0) {
    console.log('✅ Migration complete! Changes applied to Firestore.');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

