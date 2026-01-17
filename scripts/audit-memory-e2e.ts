#!/usr/bin/env npx ts-node
/**
 * Memory System E2E Audit Script
 *
 * Validates the complete memory capture flow:
 * 1. fastCapture() → extracts entities/emotions/topics
 * 2. recordTurn() → stores in STM buffer
 * 3. onSessionEnd() → promotes STM to Firestore
 * 4. Verify data persisted in Firestore
 *
 * Usage:
 *   npx ts-node scripts/audit-memory-e2e.ts --user-id <userId>
 *   npx ts-node scripts/audit-memory-e2e.ts --audit-only --user-id <userId>
 *
 * @module scripts/audit-memory-e2e
 */

import { Firestore } from '@google-cloud/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_USER_ID = process.argv.includes('--user-id')
  ? process.argv[process.argv.indexOf('--user-id') + 1]
  : 'memory-audit-test-user';

const AUDIT_ONLY = process.argv.includes('--audit-only');
const PRODUCTION = process.argv.includes('--production');
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';

// ============================================================================
// HELPERS
// ============================================================================

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string, data?: object) {
  const icons = { INFO: '📋', WARN: '⚠️', ERROR: '❌', SUCCESS: '✅' };
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${icons[level]} ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// ============================================================================
// FIRESTORE AUDIT
// ============================================================================

async function auditUserMemory(db: Firestore, userId: string) {
  log('INFO', `Auditing memory for user: ${userId}`);

  // Check bogle_users
  const userDoc = await db.collection('bogle_users').doc(userId).get();
  if (!userDoc.exists) {
    log('WARN', `User ${userId} not found in bogle_users`);
    return null;
  }

  const userData = userDoc.data();
  log('INFO', 'User document found', {
    keys: Object.keys(userData || {}),
  });

  // Check subcollections
  const collections = await userDoc.ref.listCollections();
  const collectionNames = collections.map((c) => c.id);
  log('INFO', 'User subcollections', { collections: collectionNames });

  // Memory-specific subcollections to check
  const memoryCollections = [
    'memories',
    'promoted_entities',
    'emotional_arcs',
    'topic_patterns',
    'voice_sessions',
    'conversations',
    'deep_understanding',
  ];

  const memoryStats: Record<string, number> = {};

  for (const collName of memoryCollections) {
    const collRef = userDoc.ref.collection(collName);
    const snap = await collRef.limit(100).get();
    memoryStats[collName] = snap.size;

    if (snap.size > 0 && collName === 'memories') {
      log('INFO', `Sample memories:`, {
        samples: snap.docs.slice(0, 5).map((d) => d.data().content || d.data().text || d.id),
      });
    }

    if (snap.size > 0 && collName === 'promoted_entities') {
      log('INFO', `Sample promoted_entities:`, {
        samples: snap.docs.slice(0, 5).map((d) => ({
          name: d.data().name,
          type: d.data().type,
          mentionCount: d.data().mentionCount,
        })),
      });
    }

    if (snap.size > 0 && collName === 'voice_sessions') {
      // Get most recent sessions
      const recentSessions = await collRef.orderBy('startedAt', 'desc').limit(5).get();
      log('INFO', `Recent voice_sessions:`, {
        samples: recentSessions.docs.map((d) => ({
          id: d.id,
          startedAt: d.data().startedAt?.toDate?.()?.toISOString() || d.data().startedAt,
          factsExtracted: d.data().factsExtracted || 0,
          memoryCaptures: d.data().memoryCaptures || 0,
          turnCount: d.data().turnCount || 0,
        })),
      });
    }
  }

  log('INFO', 'Memory collection stats', memoryStats);

  // Check humanization
  const humanization = await userDoc.ref.collection('humanization').get();
  if (humanization.size > 0) {
    const comfortDoc = humanization.docs.find((d) => d.id === 'comfort');
    if (comfortDoc) {
      const comfortData = comfortDoc.data();
      try {
        const parsed = JSON.parse(comfortData.data || '{}');
        log('INFO', 'Humanization comfort level', {
          comfortLevel: parsed.comfortLevel,
          relationshipStage: parsed.relationshipStage,
        });
      } catch {
        log('INFO', 'Humanization comfort (raw)', comfortData);
      }
    }
  }

  return {
    userId,
    memoryStats,
    hasData: Object.values(memoryStats).some((v) => v > 0),
  };
}

// ============================================================================
// MEMORY CAPTURE TEST
// ============================================================================

async function testMemoryCapture(userId: string) {
  log('INFO', 'Testing memory capture flow...');

  // Import the memory modules
  const { fastCapture, recordTurn, onSessionEnd, getSTMBuffer } = await import(
    '../src/memory/dynamic/index.js'
  );

  const sessionId = `audit-session-${Date.now()}`;
  const testTranscripts = [
    "My mom called me yesterday, we talked about my sister Sarah's wedding.",
    "I'm feeling a bit anxious about the presentation tomorrow at work.",
    "We should plan a trip to New York, maybe with my friend Mike.",
    "I've been thinking about my career goals lately, feeling stuck.",
    "Remember I mentioned Beethoven? I really love his 5th symphony.",
  ];

  // Test fastCapture on each transcript
  for (let i = 0; i < testTranscripts.length; i++) {
    const transcript = testTranscripts[i];
    log('INFO', `Processing turn ${i + 1}: "${transcript.substring(0, 50)}..."`);

    const result = await fastCapture({
      userId,
      sessionId,
      turnNumber: i + 1,
      transcript,
      personaId: 'ferni',
    });

    log('INFO', `Turn ${i + 1} capture result:`, {
      entities: result.mentionedEntities.map((e) => e.name),
      emotions: result.emotionSignals.map((e) => e.emotion),
      topics: result.topicHints,
      captureTimeMs: result.captureTimeMs,
      asyncJobId: result.asyncJobId,
    });

    // Record to STM
    recordTurn(sessionId, userId, result, transcript, i + 1, 'ferni');
  }

  // Check STM buffer state
  const buffer = getSTMBuffer(sessionId, userId);
  log('INFO', 'STM buffer state after all turns:', {
    turnCount: buffer.turns.length,
    entityCount: buffer.entityFrequency.size,
    entities: Array.from(buffer.entityFrequency.keys()),
    topics: buffer.topicHistory,
  });

  // Trigger session end (promotes to Firestore)
  log('INFO', 'Triggering session end promotion...');
  await onSessionEnd(sessionId, userId);

  return {
    sessionId,
    turnCount: testTranscripts.length,
    entitiesFound: buffer.entityFrequency.size,
  };
}

// ============================================================================
// VERIFY FIRESTORE WRITES
// ============================================================================

async function verifyFirestoreWrites(db: Firestore, userId: string, sessionId: string) {
  log('INFO', 'Verifying Firestore writes...');

  // Check promoted_entities
  const entities = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('promoted_entities')
    .where('sessionId', '==', sessionId)
    .get();

  log('INFO', `Promoted entities for session ${sessionId}:`, {
    count: entities.size,
    entities: entities.docs.map((d) => ({
      name: d.data().name,
      type: d.data().type,
      mentionCount: d.data().mentionCount,
      importance: d.data().importance,
    })),
  });

  // Check emotional_arcs
  const arc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('emotional_arcs')
    .doc(sessionId)
    .get();

  if (arc.exists) {
    log('SUCCESS', 'Emotional arc written:', arc.data());
  } else {
    log('WARN', 'No emotional arc written for session');
  }

  // Check topic_patterns
  const topics = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('topic_patterns')
    .doc(sessionId)
    .get();

  if (topics.exists) {
    log('SUCCESS', 'Topic patterns written:', topics.data());
  } else {
    log('WARN', 'No topic patterns written for session');
  }

  return {
    entitiesWritten: entities.size,
    emotionalArcWritten: arc.exists,
    topicPatternsWritten: topics.exists,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('🧠 MEMORY SYSTEM E2E AUDIT');
  console.log('═'.repeat(60));
  console.log(`User ID: ${TEST_USER_ID}`);
  console.log(`Mode: ${AUDIT_ONLY ? 'AUDIT ONLY' : 'FULL TEST'}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log('═'.repeat(60));

  // Initialize Firestore
  const db = new Firestore({ projectId: PROJECT_ID });

  // First, audit existing data
  const auditResult = await auditUserMemory(db, TEST_USER_ID);

  if (AUDIT_ONLY) {
    console.log('\n═'.repeat(60));
    console.log('AUDIT COMPLETE');
    console.log('═'.repeat(60));
    return;
  }

  // Run memory capture test
  console.log('\n═'.repeat(60));
  console.log('RUNNING MEMORY CAPTURE TEST');
  console.log('═'.repeat(60));

  const testResult = await testMemoryCapture(TEST_USER_ID);

  // Give Firestore a moment to propagate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify writes
  console.log('\n═'.repeat(60));
  console.log('VERIFYING FIRESTORE WRITES');
  console.log('═'.repeat(60));

  const verifyResult = await verifyFirestoreWrites(db, TEST_USER_ID, testResult.sessionId);

  // Summary
  console.log('\n═'.repeat(60));
  console.log('E2E TEST SUMMARY');
  console.log('═'.repeat(60));

  const success =
    verifyResult.entitiesWritten > 0 ||
    verifyResult.emotionalArcWritten ||
    verifyResult.topicPatternsWritten;

  if (success) {
    log('SUCCESS', 'Memory capture E2E test PASSED', {
      ...testResult,
      ...verifyResult,
    });
  } else {
    log('ERROR', 'Memory capture E2E test FAILED - no data written to Firestore', {
      ...testResult,
      ...verifyResult,
    });
    process.exit(1);
  }
}

main().catch((error) => {
  log('ERROR', 'E2E test failed with error', { error: String(error), stack: error.stack });
  process.exit(1);
});
