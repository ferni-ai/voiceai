#!/usr/bin/env npx tsx
/**
 * Check all data stored for a user
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

const PROFILE_FIELDS = [
  'name', 'preferredName', 'email', 'firstContact', 'lastContact',
  'totalConversations', 'totalMinutesTalked', 'communicationStyle',
  'speakingPace', 'relationshipStage', 'preferredTopics', 'avoidTopics',
  'humorAppreciation', 'familyMembers', 'lifeEvents', 'goals'
];

async function checkMyData() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 YOUR FERNI DATA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  const userId = process.env.FERNI_USER_ID || 'seth';
  console.log(`👤 User ID: ${userId}\n`);

  // 1. Main profile document
  console.log('───────────────────────────────────────────────────────────────');
  console.log('📋 PROFILE DATA:\n');
  const profileDoc = await db.collection('bogle_users').doc(userId).get();
  if (profileDoc.exists) {
    const data = profileDoc.data() as Record<string, unknown>;
    for (const field of PROFILE_FIELDS) {
      if (data[field] !== undefined) {
        const value = data[field];
        if (typeof value === 'object') {
          console.log(`   ${field}: ${JSON.stringify(value, null, 2).split('\n').join('\n      ')}`);
        } else {
          console.log(`   ${field}: ${value}`);
        }
      }
    }
    
    // Show other fields
    const otherFields = Object.keys(data).filter(k => !PROFILE_FIELDS.includes(k));
    if (otherFields.length > 0) {
      console.log('\n   Other fields:', otherFields.join(', '));
    }
  } else {
    console.log('   No profile document found');
  }

  // 2. Memories
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('🧠 MEMORIES (what Ferni has learned):\n');
  const memories = await db.collection('bogle_users').doc(userId).collection('memories').limit(20).get();
  if (memories.empty) {
    console.log('   No memories stored');
  } else {
    console.log(`   Total: ${memories.size} memories\n`);
    memories.docs.forEach(doc => {
      const data = doc.data();
      const type = data.type || 'general';
      const content = data.content || data.summary || data.text || 'No content';
      const confidence = data.confidence ? ` (${Math.round(data.confidence * 100)}% confident)` : '';
      console.log(`   • [${type}]${confidence}`);
      console.log(`     "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`);
    });
  }

  // 3. Contacts
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('👥 CONTACTS (people Ferni knows about):\n');
  const contacts = await db.collection('bogle_users').doc(userId).collection('contacts').limit(20).get();
  if (contacts.empty) {
    console.log('   No contacts stored');
  } else {
    console.log(`   Total: ${contacts.size} contacts\n`);
    contacts.docs.forEach(doc => {
      const data = doc.data();
      const name = data.displayName || data.name || data.firstName || 'Unknown';
      const rel = data.relationship || data.type || '';
      console.log(`   • ${name}${rel ? ` (${rel})` : ''}`);
      if (data.phones?.length > 0) console.log(`     Phone: ${data.phones[0].number || data.phones[0]}`);
      if (data.emails?.length > 0) console.log(`     Email: ${data.emails[0].email || data.emails[0]}`);
    });
  }

  // 4. Conversation sessions
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('💬 RECENT CONVERSATIONS:\n');
  const sessions = await db.collection('bogle_users').doc(userId).collection('sessions')
    .orderBy('startedAt', 'desc')
    .limit(10)
    .get();
  if (sessions.empty) {
    console.log('   No conversation history');
  } else {
    console.log(`   Total: ${sessions.size} recent sessions\n`);
    sessions.docs.forEach(doc => {
      const data = doc.data();
      const date = data.startedAt?.toDate?.()?.toISOString?.() || 'unknown';
      const persona = data.personaId || 'ferni';
      const duration = data.durationMinutes ? `${data.durationMinutes} min` : '';
      console.log(`   • ${date.slice(0, 16)} with ${persona}${duration ? ` (${duration})` : ''}`);
    });
  }

  // 5. Habits
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('🔄 HABITS:\n');
  const habits = await db.collection('bogle_users').doc(userId).collection('habits').limit(10).get();
  if (habits.empty) {
    console.log('   No habits tracked');
  } else {
    habits.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   • ${data.name || data.title || 'Unnamed habit'}`);
      if (data.frequency) console.log(`     Frequency: ${data.frequency}`);
      if (data.streak) console.log(`     Streak: ${data.streak} days`);
    });
  }

  // 6. Goals
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('🎯 GOALS:\n');
  const goals = await db.collection('bogle_users').doc(userId).collection('goals').limit(10).get();
  if (goals.empty) {
    console.log('   No goals tracked');
  } else {
    goals.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   • ${data.name || data.title || 'Unnamed goal'}`);
      if (data.status) console.log(`     Status: ${data.status}`);
      if (data.progress) console.log(`     Progress: ${data.progress}%`);
    });
  }

  // 7. Engagement data
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('📈 ENGAGEMENT DATA:\n');
  const engagement = await db.collection('bogle_users').doc(userId).collection('engagement').limit(5).get();
  if (engagement.empty) {
    console.log('   No engagement data');
  } else {
    engagement.docs.forEach(doc => {
      console.log(`   • ${doc.id}:`, JSON.stringify(doc.data()).slice(0, 100));
    });
  }

  // 8. Other collections summary
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('📁 OTHER DATA COLLECTIONS:\n');
  
  const collectionsToCheck = [
    'preferences', 'predictions', 'mood_history', 'rituals', 
    'journal_entries', 'tasks', 'notes', 'wellbeing_snapshots',
    'trust_boundaries', 'trust_growth', 'corrections', 'semantic_contexts'
  ];
  
  for (const col of collectionsToCheck) {
    const snapshot = await db.collection('bogle_users').doc(userId).collection(col).limit(1).get();
    if (!snapshot.empty) {
      console.log(`   ✅ ${col}: has data`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

checkMyData().catch(console.error);
