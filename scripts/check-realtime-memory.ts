#!/usr/bin/env npx tsx
/**
 * Quick script to check realtime memory data in Firestore
 */

import { Firestore } from '@google-cloud/firestore';

async function main() {
  const db = new Firestore({
    projectId: 'johnb-2025',
    databaseId: '(default)',
  });

  console.log('🔍 Checking realtime memory in Firestore...\n');

  // Get all users with conversations subcollection
  const usersSnapshot = await db.collection('bogle_users').limit(10).get();
  
  console.log(`Found ${usersSnapshot.size} users in bogle_users\n`);

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    // Check for conversations subcollection
    const conversationsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .orderBy('startedAt', 'desc')
      .limit(5)
      .get();
    
    if (conversationsSnapshot.empty) {
      console.log(`📁 User ${userId.slice(0, 15)}... - No conversations yet`);
      console.log(`   lastConversationSummary: ${userData.lastConversationSummary || '(none)'}`);
      console.log(`   totalConversations: ${userData.totalConversations || 0}`);
      continue;
    }

    console.log(`📁 User ${userId.slice(0, 15)}... - ${conversationsSnapshot.size} recent conversations`);
    console.log(`   lastConversationSummary: ${(userData.lastConversationSummary || '(none)').slice(0, 50)}`);
    console.log(`   totalConversations: ${userData.totalConversations || 0}`);
    
    for (const convDoc of conversationsSnapshot.docs) {
      const conv = convDoc.data();
      const turnsSnapshot = await convDoc.ref.collection('turns').limit(1).get();
      
      const startedAt = conv.startedAt?.toDate?.()?.toISOString?.() || 'unknown';
      const endedAt = conv.endedAt?.toDate?.()?.toISOString?.() || 'ongoing';
      
      console.log(`   └─ ${convDoc.id.slice(0, 20)}...`);
      console.log(`      persona: ${conv.personaId || 'unknown'}, turns: ${conv.turnCount || 0}, summarized: ${conv.summarized || false}`);
      console.log(`      started: ${startedAt}`);
      console.log(`      ended: ${endedAt}`);
      if (conv.summary) {
        console.log(`      summary: ${conv.summary.slice(0, 60)}...`);
      }
    }
    console.log('');
  }

  // Check for any unsummarized conversations
  console.log('🔎 Checking for unsummarized conversations...');
  const unsummarizedSnapshot = await db
    .collectionGroup('conversations')
    .where('summarized', '==', false)
    .limit(10)
    .get();
  
  if (unsummarizedSnapshot.empty) {
    console.log('✅ No unsummarized conversations found');
  } else {
    console.log(`⚠️ Found ${unsummarizedSnapshot.size} unsummarized conversations:`);
    for (const doc of unsummarizedSnapshot.docs) {
      const conv = doc.data();
      console.log(`   - ${doc.ref.path}: ${conv.turnCount || 0} turns, ended: ${conv.endedAt ? 'yes' : 'no'}`);
    }
  }

  console.log('\n✅ Realtime memory check complete!');
}

main().catch(console.error);

