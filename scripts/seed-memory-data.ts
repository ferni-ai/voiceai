#!/usr/bin/env npx tsx
/**
 * Seed Memory Data Script
 *
 * Seeds the Firestore database with test conversation data for development.
 * This allows testing the "What I Remember" / Memory Browser UI.
 *
 * Usage:
 *   npx tsx scripts/seed-memory-data.ts [userId]
 *
 * If no userId provided, uses 'test-user-dev'
 *
 * @module scripts/seed-memory-data
 */

import { Firestore } from '@google-cloud/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_USER_ID = process.argv[2] || 'test-user-dev';
const GCP_PROJECT = process.env.GCP_PROJECT_ID || 'voiceai-426116';
const FIRESTORE_DB = process.env.FIRESTORE_DATABASE || 'ferni-db';

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_CONVERSATIONS = [
  {
    id: 'conv_seed_001',
    personaId: 'ferni',
    summary: 'We talked about your morning routine and how you want to wake up earlier',
    topics: ['morning routine', 'sleep', 'habits'],
    turnCount: 12,
    daysAgo: 0,
  },
  {
    id: 'conv_seed_002',
    personaId: 'maya-santos',
    summary: 'You mentioned wanting to build a consistent exercise habit',
    topics: ['exercise', 'fitness', 'motivation'],
    turnCount: 8,
    daysAgo: 1,
  },
  {
    id: 'conv_seed_003',
    personaId: 'ferni',
    summary: 'We explored your goals for the new year and what excites you most',
    topics: ['goals', 'new year', 'career'],
    turnCount: 15,
    daysAgo: 3,
  },
  {
    id: 'conv_seed_004',
    personaId: 'peter-lynch',
    summary: 'Discussed your investment strategy and concerns about market volatility',
    topics: ['investing', 'finance', 'savings'],
    turnCount: 10,
    daysAgo: 5,
  },
  {
    id: 'conv_seed_005',
    personaId: 'ferni',
    summary: 'You shared about a difficult conversation with a friend',
    topics: ['relationships', 'communication', 'conflict'],
    turnCount: 18,
    daysAgo: 7,
  },
  {
    id: 'conv_seed_006',
    personaId: 'alex-rivera',
    summary: 'We worked on preparing for your upcoming presentation',
    topics: ['work', 'presentations', 'confidence'],
    turnCount: 14,
    daysAgo: 10,
  },
  {
    id: 'conv_seed_007',
    personaId: 'ferni',
    summary: 'Talked about feeling overwhelmed and finding balance',
    topics: ['stress', 'work-life balance', 'self-care'],
    turnCount: 20,
    daysAgo: 14,
  },
  {
    id: 'conv_seed_008',
    personaId: 'jordan-kim',
    summary: 'Planned your birthday celebration next month',
    topics: ['birthday', 'events', 'friends'],
    turnCount: 6,
    daysAgo: 21,
  },
  {
    id: 'conv_seed_009',
    personaId: 'ferni',
    summary: 'You reflected on how far you\'ve come this year',
    topics: ['reflection', 'growth', 'gratitude'],
    turnCount: 22,
    daysAgo: 30,
  },
  {
    id: 'conv_seed_010',
    personaId: 'nayan-patel',
    summary: 'Explored what gives your life meaning and purpose',
    topics: ['purpose', 'meaning', 'philosophy'],
    turnCount: 25,
    daysAgo: 45,
  },
];

const MOCK_TURNS = [
  { role: 'user', content: 'I want to start waking up earlier but I keep hitting snooze' },
  { role: 'assistant', content: 'I hear you - the snooze button is a tempting friend at 6am. What time are you actually waking up now versus when you want to wake up?' },
  { role: 'user', content: 'I wake up around 8 but I want to be up by 6:30' },
  { role: 'assistant', content: 'That\'s a 90-minute shift - quite ambitious! Rather than jumping straight to 6:30, what if we tried moving it 15 minutes earlier each week? Your body adjusts better to gradual changes.' },
  { role: 'user', content: 'That makes sense. I just feel like I waste the morning otherwise' },
  { role: 'assistant', content: 'I notice you mentioned "waste" - there\'s some pressure you\'re putting on yourself there. What would you do with that extra time if you had it? Having a compelling reason makes it much easier to get up.' },
];

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedMemoryData(): Promise<void> {
  console.log('🌱 Seeding memory data...');
  console.log(`   User ID: ${TEST_USER_ID}`);
  console.log(`   Project: ${GCP_PROJECT}`);
  console.log(`   Database: ${FIRESTORE_DB}`);

  const db = new Firestore({
    projectId: GCP_PROJECT,
    databaseId: FIRESTORE_DB,
  });

  const userRef = db.collection('bogle_users').doc(TEST_USER_ID);
  const conversationsRef = userRef.collection('conversations');

  // Delete existing seed data
  console.log('\n🧹 Cleaning up existing seed data...');
  const existingConvs = await conversationsRef.where('__seeded', '==', true).get();
  for (const doc of existingConvs.docs) {
    // Delete turns subcollection first
    const turnsRef = doc.ref.collection('turns');
    const turns = await turnsRef.get();
    for (const turn of turns.docs) {
      await turn.ref.delete();
    }
    await doc.ref.delete();
  }
  console.log(`   Deleted ${existingConvs.size} existing seeded conversations`);

  // Create conversations with turns
  console.log('\n📝 Creating conversations...');
  for (const conv of MOCK_CONVERSATIONS) {
    const startedAt = new Date(Date.now() - conv.daysAgo * 24 * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + conv.turnCount * 60 * 1000); // ~1min per turn

    const convDoc = {
      personaId: conv.personaId,
      startedAt,
      endedAt,
      turnCount: conv.turnCount,
      summarized: true,
      summary: conv.summary,
      topics: conv.topics,
      voiceVerified: Math.random() > 0.3, // 70% voice verified
      __seeded: true, // Mark as seed data for easy cleanup
    };

    await conversationsRef.doc(conv.id).set(convDoc);

    // Add turns
    const turnsRef = conversationsRef.doc(conv.id).collection('turns');
    const turnsToAdd = Math.min(MOCK_TURNS.length, conv.turnCount);
    for (let i = 0; i < turnsToAdd; i++) {
      const turn = MOCK_TURNS[i % MOCK_TURNS.length];
      await turnsRef.add({
        role: turn.role,
        content: turn.content,
        timestamp: new Date(startedAt.getTime() + i * 60 * 1000),
      });
    }

    console.log(`   ✓ ${conv.id}: "${conv.summary.slice(0, 50)}..."`);
  }

  // Update user profile with stats
  console.log('\n👤 Updating user profile...');
  await userRef.set(
    {
      totalConversations: MOCK_CONVERSATIONS.length,
      lastConversation: new Date(),
      firstConversation: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      __seeded: true,
    },
    { merge: true }
  );

  console.log('\n✅ Seed complete!');
  console.log(`   Total conversations: ${MOCK_CONVERSATIONS.length}`);
  console.log(`   User ID: ${TEST_USER_ID}`);
  console.log('\n💡 To use this data in the browser:');
  console.log(`   localStorage.setItem('ferni_user_id', '${TEST_USER_ID}')`);
}

async function clearSeedData(): Promise<void> {
  console.log('🧹 Clearing all seed data...');

  const db = new Firestore({
    projectId: GCP_PROJECT,
    databaseId: FIRESTORE_DB,
  });

  const userRef = db.collection('bogle_users').doc(TEST_USER_ID);
  const conversationsRef = userRef.collection('conversations');

  const seededConvs = await conversationsRef.where('__seeded', '==', true).get();
  for (const doc of seededConvs.docs) {
    const turnsRef = doc.ref.collection('turns');
    const turns = await turnsRef.get();
    for (const turn of turns.docs) {
      await turn.ref.delete();
    }
    await doc.ref.delete();
  }

  console.log(`   Deleted ${seededConvs.size} seeded conversations`);
  console.log('✅ Seed data cleared!');
}

// ============================================================================
// MAIN
// ============================================================================

const command = process.argv[3];

if (command === '--clear') {
  clearSeedData().catch(console.error);
} else {
  seedMemoryData().catch(console.error);
}
