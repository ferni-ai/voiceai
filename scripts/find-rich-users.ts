#!/usr/bin/env npx tsx
/**
 * Find users with the most data
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

async function findRichUsers() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 SEARCHING FOR USERS WITH DATA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  // First, let's look for specific patterns
  console.log('Looking for users by name patterns...\n');
  
  const usersSnapshot = await db.collection('bogle_users').get();
  
  const usersWithData: {
    id: string;
    name: string;
    conversations: number;
    dataScore: number;
  }[] = [];
  
  for (const doc of usersSnapshot.docs) {
    const userId = doc.id;
    const data = doc.data();
    
    // Skip anonymous users with minimal data
    const name = data.name || data.preferredName || '';
    const conversations = data.totalConversations || 0;
    
    // Count subcollections
    let dataScore = 0;
    
    const collections = ['memories', 'contacts', 'sessions', 'habits', 'goals', 
                         'relationship_network', 'commitments', 'dreams', 'values',
                         'journal_entries', 'tasks', 'notes'];
    
    for (const col of collections) {
      try {
        const snap = await db.collection('bogle_users').doc(userId).collection(col).limit(1).get();
        if (!snap.empty) {
          dataScore += 10;
        }
      } catch {
        // Ignore errors
      }
    }
    
    // Also add score for profile data
    dataScore += Object.keys(data).length;
    dataScore += conversations * 5;
    
    usersWithData.push({ id: userId, name, conversations, dataScore });
  }
  
  // Sort by data score
  usersWithData.sort((a, b) => b.dataScore - a.dataScore);
  
  console.log('TOP 20 USERS BY DATA RICHNESS:\n');
  
  for (const user of usersWithData.slice(0, 20)) {
    console.log(`📊 Score: ${user.dataScore.toString().padStart(3)} | ID: ${user.id.slice(0, 30).padEnd(30)} | Name: ${user.name || 'Unknown'} | Convos: ${user.conversations}`);
  }
  
  // Also look for any user IDs containing common patterns
  console.log('\n\nSEARCHING FOR SPECIFIC PATTERNS...\n');
  
  const patterns = ['seth', 'ford', 'admin', 'test', 'demo', 'founder'];
  for (const pattern of patterns) {
    const matches = usersWithData.filter(u => 
      u.id.toLowerCase().includes(pattern) || 
      u.name.toLowerCase().includes(pattern)
    );
    if (matches.length > 0) {
      console.log(`Pattern "${pattern}": ${matches.map(m => m.id).join(', ')}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

findRichUsers().catch(console.error);
