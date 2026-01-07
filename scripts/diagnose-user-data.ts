#!/usr/bin/env npx tsx
/**
 * Diagnose User Data - Check all superhuman collections for a user
 *
 * Usage: FERNI_USER_ID=seth npx tsx scripts/diagnose-user-data.ts
 */

import { getFirestoreDb, getSuperhmanHealth, SUPERHUMAN_SERVICES } from '../src/services/superhuman/firestore-utils.js';

const COLLECTIONS_TO_CHECK = [
  // Core superhuman services
  'relationship_network',   // People/contacts Ferni knows about
  'commitments',            // Promises and intentions
  'dreams',                 // Dreams being tracked
  'values',                 // User's values
  'capacity',               // Burnout/capacity data
  'milestones',             // Relationship milestones
  'seasonal',               // Seasonal awareness
  'narrative',              // Life narrative
  'patterns',               // Predictive coaching patterns

  // Contacts
  'contacts',               // Phone contacts
  'contact_relationships',  // Contact relationships

  // Semantic intelligence
  'semantic_open_loops',
  'semantic_growth',
  'semantic_coaching',
  'semantic_awareness',
  'semantic_correlations',

  // Persona services
  'habit_dna',              // Maya coaching
  'friction_points',
  'blind_spots',            // Peter analytics
  'event_patterns',         // Jordan planning
  'paradoxes',              // Nayan wisdom

  // Other
  'persona_affinities',
  'corrections',            // User corrections
  'implicit_preferences',
];

async function diagnoseUserData() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 FERNI USER DATA DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check superhuman health first
  const health = getSuperhmanHealth();
  console.log('📊 SUPERHUMAN HEALTH STATUS:');
  console.log(`   DB Available: ${health.dbAvailable ? '✅' : '❌'}`);
  console.log(`   Initialized: ${health.initialized ? '✅' : '❌'}`);
  if (health.initializationError) {
    console.log(`   ⚠️  Init Error: ${health.initializationError}`);
  }
  console.log(`   Degradation Count: ${health.degradationCount}`);
  if (health.recentDegradations.length > 0) {
    console.log(`   Recent Degradations:`);
    health.recentDegradations.slice(0, 3).forEach(d => {
      console.log(`      - ${d.service} at ${d.timestamp}: ${d.reason}`);
    });
  }
  console.log();

  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized - cannot query data\n');
    console.log('Make sure you have GOOGLE_APPLICATION_CREDENTIALS set or');
    console.log('are running in a GCP environment with default credentials.\n');
    return;
  }

  const userId = process.env.FERNI_USER_ID || 'seth';
  console.log(`👤 USER: ${userId}\n`);
  console.log('───────────────────────────────────────────────────────────────\n');

  const summary: { collection: string; count: number; sample?: string }[] = [];

  for (const collection of COLLECTIONS_TO_CHECK) {
    try {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection(collection)
        .limit(5)
        .get();

      const count = snapshot.size;
      let sample: string | undefined;

      if (count > 0) {
        const firstDoc = snapshot.docs[0].data();
        // Get a meaningful field to show
        sample = firstDoc.name || firstDoc.summary || firstDoc.title ||
                 firstDoc.canonicalName || firstDoc.statement ||
                 Object.keys(firstDoc).slice(0, 3).join(', ');
      }

      summary.push({ collection, count, sample });

      if (count > 0) {
        console.log(`✅ ${collection}: ${count}${count === 5 ? '+' : ''} docs`);
        if (sample) {
          console.log(`   → Sample: "${sample.slice(0, 50)}${sample.length > 50 ? '...' : ''}"`);
        }
      } else {
        console.log(`⚫ ${collection}: empty`);
      }
    } catch (error) {
      console.log(`❌ ${collection}: ERROR - ${String(error).slice(0, 50)}`);
      summary.push({ collection, count: -1 });
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('📈 SUMMARY:\n');

  const populated = summary.filter(s => s.count > 0);
  const empty = summary.filter(s => s.count === 0);
  const errored = summary.filter(s => s.count === -1);

  console.log(`   ✅ Populated: ${populated.length} collections`);
  console.log(`   ⚫ Empty: ${empty.length} collections`);
  if (errored.length > 0) {
    console.log(`   ❌ Errors: ${errored.length} collections`);
  }

  // Key insights
  console.log('\n🎯 KEY FINDINGS:\n');

  const hasContacts = summary.find(s => s.collection === 'relationship_network')?.count || 0;
  const hasCommitments = summary.find(s => s.collection === 'commitments')?.count || 0;
  const hasDreams = summary.find(s => s.collection === 'dreams')?.count || 0;

  if (hasContacts === 0) {
    console.log('   ⚠️  No relationship network data - Ferni won\'t remember people');
  } else {
    console.log(`   ✅ Relationship network has ${hasContacts}+ people stored`);
  }

  if (hasCommitments === 0) {
    console.log('   ⚠️  No commitments tracked - Ferni won\'t remember promises');
  } else {
    console.log(`   ✅ ${hasCommitments}+ commitments being tracked`);
  }

  if (hasDreams === 0) {
    console.log('   ⚠️  No dreams tracked');
  } else {
    console.log(`   ✅ ${hasDreams}+ dreams being tracked`);
  }

  // Show relationship network details
  if (hasContacts > 0) {
    console.log('\n👥 RELATIONSHIP NETWORK DETAILS:\n');
    const network = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_network')
      .orderBy('importance', 'desc')
      .limit(10)
      .get();

    network.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   • ${data.name} (${data.type || 'unknown'}) - ${data.mentionCount || 0} mentions`);
      if (data.aliases?.length > 0) {
        console.log(`     Aliases: ${data.aliases.join(', ')}`);
      }
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

diagnoseUserData().catch(console.error);
