#!/usr/bin/env npx tsx
/**
 * 1. Clean up misclassified relationship network entries
 * 2. Show detailed data from all collections
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

const COMMON_WORDS_TO_REMOVE = [
  'and', 'to', 'the', 'a', 'an', 'for', 'in', 'on', 'at', 'is', 'was', 
  'here', 'there', 'bought', 'got', 'will', 'can', 'be', 'have', 'has',
  'do', 'does', 'did', 'been', 'being', 'it', 'that', 'this', 'with',
  'from', 'or', 'but', 'not', 'are', 'were', 'they', 'we', 'you', 'i',
  'me', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'of', 'by'
];

async function cleanupAndDetail() {
  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  const userId = process.env.FERNI_USER_ID || 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
  
  // ═══════════════════════════════════════════════════════════════════
  // PART 1: CLEAN UP RELATIONSHIP NETWORK
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🧹 CLEANING UP RELATIONSHIP NETWORK');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const network = await db.collection('bogle_users').doc(userId).collection('relationship_network').get();
  
  let deletedCount = 0;
  let keptCount = 0;
  
  for (const doc of network.docs) {
    const data = doc.data();
    const name = (data.name || '').toLowerCase().trim();
    
    if (COMMON_WORDS_TO_REMOVE.includes(name) || name.length <= 2) {
      console.log(`  🗑️  Deleting misclassified entry: "${data.name}" (type: ${data.type})`);
      await doc.ref.delete();
      deletedCount++;
    } else {
      console.log(`  ✅ Keeping: "${data.name}" (type: ${data.type})`);
      keptCount++;
    }
  }
  
  console.log(`\n  Summary: Deleted ${deletedCount} misclassified entries, kept ${keptCount} valid entries\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PART 2: DETAILED DATA FROM ALL COLLECTIONS  
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 DETAILED DATA EXPLORATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // List all subcollections we want to explore
  const collections = [
    'memories',
    'contacts', 
    'sessions',
    'commitments',
    'relationship_network',
    'dreams',
    'values',
    'capacity',
    'milestones',
    'seasonal',
    'narrative',
    'patterns',
    'habits',
    'goals',
    'journal_entries',
    'tasks',
    'notes',
    'wellbeing_snapshots',
    'trust_boundaries',
    'trust_growth',
    'corrections',
    'semantic_contexts',
    'persona_affinities',
    'implicit_preferences',
    'habit_dna',
    'friction_points',
    'blind_spots',
    'event_patterns',
    'paradoxes',
    'engagement'
  ];

  for (const collectionName of collections) {
    const snapshot = await db.collection('bogle_users').doc(userId).collection(collectionName).limit(10).get();
    
    if (!snapshot.empty) {
      console.log(`\n────────────────────────────────────────────────────────────`);
      console.log(`📁 ${collectionName.toUpperCase()} (${snapshot.size} documents)`);
      console.log(`────────────────────────────────────────────────────────────\n`);
      
      snapshot.docs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`  [${idx + 1}] Document ID: ${doc.id}`);
        
        // Pretty print the data, but limit depth
        const prettyData = JSON.stringify(data, (key, value) => {
          // Truncate very long strings
          if (typeof value === 'string' && value.length > 200) {
            return value.slice(0, 200) + '...';
          }
          // Truncate arrays
          if (Array.isArray(value) && value.length > 5) {
            return [...value.slice(0, 5), `... and ${value.length - 5} more`];
          }
          return value;
        }, 2);
        
        console.log(prettyData.split('\n').map(line => '      ' + line).join('\n'));
        console.log();
      });
    }
  }

  // Also show the main profile document in full
  console.log(`\n────────────────────────────────────────────────────────────`);
  console.log(`📋 FULL PROFILE DOCUMENT`);
  console.log(`────────────────────────────────────────────────────────────\n`);
  
  const profileDoc = await db.collection('bogle_users').doc(userId).get();
  if (profileDoc.exists) {
    const data = profileDoc.data();
    const prettyData = JSON.stringify(data, (key, value) => {
      if (typeof value === 'string' && value.length > 300) {
        return value.slice(0, 300) + '...';
      }
      if (Array.isArray(value) && value.length > 10) {
        return [...value.slice(0, 10), `... and ${value.length - 10} more`];
      }
      return value;
    }, 2);
    console.log(prettyData);
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

cleanupAndDetail().catch(console.error);
