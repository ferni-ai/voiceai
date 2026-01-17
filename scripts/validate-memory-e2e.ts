#!/usr/bin/env npx tsx
/**
 * Memory E2E Validation Script
 *
 * Validates that the memory system is working correctly in a live environment.
 * Run this after deploying to verify:
 * - User turns are being persisted
 * - SSML is being stripped
 * - Social graph isn't capturing speech errors
 * - Session lifecycle hooks are firing
 *
 * Usage:
 *   npx tsx scripts/validate-memory-e2e.ts [userId]
 *
 * @module scripts/validate-memory-e2e
 */

import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.GCLOUD_PROJECT || 'ferni-prod',
  });
}

const db = getFirestore();

interface ValidationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: Record<string, unknown>;
}

const results: ValidationResult[] = [];

function addResult(
  check: string,
  status: 'PASS' | 'FAIL' | 'WARN',
  message: string,
  details?: Record<string, unknown>
) {
  results.push({ check, status, message, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${check}: ${message}`);
  if (details) {
    console.log('   ', JSON.stringify(details, null, 2).slice(0, 200));
  }
}

async function validateUserProfile(userId: string) {
  console.log('\n📋 Validating User Profile...\n');

  const profileRef = db.collection('bogle_users').doc(userId);
  const profile = await profileRef.get();

  if (!profile.exists) {
    addResult('User Profile', 'FAIL', 'Profile does not exist', { userId });
    return;
  }

  const data = profile.data()!;

  // Check if name is captured
  if (data.name) {
    addResult('Name Capture', 'PASS', `User name captured: "${data.name}"`);
  } else {
    addResult('Name Capture', 'WARN', 'No user name captured yet');
  }

  // Check conversation count
  if (data.totalConversations > 0) {
    addResult('Conversations', 'PASS', `${data.totalConversations} conversations recorded`);
  } else {
    addResult('Conversations', 'WARN', 'No conversations recorded yet');
  }

  // Check last conversation summary
  if (data.lastConversationSummary && data.lastConversationSummary !== 'Brief conversation') {
    addResult('Summarization', 'PASS', 'Last conversation has meaningful summary');
  } else {
    addResult(
      'Summarization',
      'WARN',
      data.lastConversationSummary || 'No summary captured'
    );
  }
}

async function validateConversationTurns(userId: string) {
  console.log('\n💬 Validating Conversation Turns...\n');

  const conversationsRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversations')
    .orderBy('startedAt', 'desc')
    .limit(5);

  const conversations = await conversationsRef.get();

  if (conversations.empty) {
    addResult('Conversations', 'WARN', 'No conversations found');
    return;
  }

  let totalUserTurns = 0;
  let totalAssistantTurns = 0;
  let ssmlFound = false;

  for (const conv of conversations.docs) {
    const turnsRef = conv.ref.collection('turns');
    const turns = await turnsRef.get();

    for (const turn of turns.docs) {
      const data = turn.data();

      if (data.role === 'user') {
        totalUserTurns++;
      } else {
        totalAssistantTurns++;

        // Check for SSML leakage (ISSUE-005)
        if (data.content && (data.content.includes('<break') || data.content.includes('<prosody'))) {
          ssmlFound = true;
        }
      }
    }
  }

  // BUG-001 validation: Both user and assistant turns should be present
  if (totalUserTurns > 0 && totalAssistantTurns > 0) {
    addResult('Turn Recording', 'PASS', `${totalUserTurns} user + ${totalAssistantTurns} assistant turns`, {
      userTurns: totalUserTurns,
      assistantTurns: totalAssistantTurns,
    });
  } else if (totalUserTurns === 0) {
    addResult(
      'Turn Recording',
      'FAIL',
      'BUG-001: No user turns found - user speech is not being persisted!',
      { userTurns: totalUserTurns, assistantTurns: totalAssistantTurns }
    );
  } else {
    addResult('Turn Recording', 'WARN', 'Missing some turn types', {
      userTurns: totalUserTurns,
      assistantTurns: totalAssistantTurns,
    });
  }

  // ISSUE-005 validation: SSML should be stripped
  if (ssmlFound) {
    addResult('SSML Stripping', 'FAIL', 'ISSUE-005: SSML tags found in persisted turns');
  } else {
    addResult('SSML Stripping', 'PASS', 'No SSML tags in persisted turns');
  }
}

async function validateSocialGraph(userId: string) {
  console.log('\n👥 Validating Social Graph...\n');

  const graphRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('social_graph')
    .limit(20);

  const graph = await graphRef.get();

  if (graph.empty) {
    addResult('Social Graph', 'WARN', 'No social graph entries');
    return;
  }

  const suspiciousNames = ['Here', 'And', 'But', 'Bought', 'Brought', 'Going', 'Gonna'];
  const foundSuspicious: string[] = [];

  for (const person of graph.docs) {
    const data = person.data();
    const name = data.name || person.id;

    if (suspiciousNames.includes(name)) {
      foundSuspicious.push(name);
    }
  }

  // ISSUE-006 validation: Speech errors should be filtered
  if (foundSuspicious.length > 0) {
    addResult(
      'Social Graph Filter',
      'FAIL',
      `ISSUE-006: Speech recognition errors in social graph: ${foundSuspicious.join(', ')}`
    );
  } else {
    addResult('Social Graph Filter', 'PASS', `${graph.size} people in graph, no speech errors`);
  }
}

async function validateSessionLifecycle(userId: string) {
  console.log('\n🔄 Validating Session Lifecycle...\n');

  // Check for Redis presence/outreach suppression (if available)
  // This would require Redis connection which may not be available in script context
  addResult(
    'Session Lifecycle',
    'WARN',
    'Session lifecycle validation requires live session - skipped'
  );
}

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.log('Usage: npx tsx scripts/validate-memory-e2e.ts <userId>');
    console.log('\nTo find your userId, check the browser console or Firestore.');
    process.exit(1);
  }

  console.log('=' .repeat(60));
  console.log('🧠 FERNI MEMORY E2E VALIDATION');
  console.log('=' .repeat(60));
  console.log(`\nValidating userId: ${userId}\n`);

  try {
    await validateUserProfile(userId);
    await validateConversationTurns(userId);
    await validateSocialGraph(userId);
    await validateSessionLifecycle(userId);
  } catch (error) {
    console.error('\n❌ Validation error:', error);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('=' .repeat(60));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warnings = results.filter((r) => r.status === 'WARN').length;

  console.log(`\n  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⚠️  Warnings: ${warnings}`);

  if (failed > 0) {
    console.log('\n🔴 MEMORY SYSTEM HAS ISSUES - See failures above');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n🟡 Memory system working with some warnings');
    process.exit(0);
  } else {
    console.log('\n🟢 MEMORY SYSTEM FULLY OPERATIONAL');
    process.exit(0);
  }
}

main().catch(console.error);
