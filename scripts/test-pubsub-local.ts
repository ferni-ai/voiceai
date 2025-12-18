#!/usr/bin/env npx tsx
/**
 * Test Pub/Sub integration locally
 * 
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/test-pubsub-local.ts
 */

import { getPubSubClient } from '../src/services/pubsub/pubsub-client.js';

async function testPubSub() {
  console.log('🧪 Testing Pub/Sub integration...\n');
  
  const client = await getPubSubClient();
  
  if (!client) {
    console.log('❌ Pub/Sub not enabled (set PUBSUB_ENABLED=true)');
    return;
  }
  
  // Test 1: Publish embedding request
  console.log('1️⃣ Publishing embedding generation request...');
  try {
    const embeddingId = await client.publish('embeddings', {
      type: 'embedding:generate',
      data: {
        userId: 'test-user',
        text: 'Hello, this is a test embedding request',
        timestamp: Date.now()
      }
    });
    console.log(`   ✅ Published with ID: ${embeddingId?.messageId || 'local'}\n`);
  } catch (err) {
    console.log(`   ⚠️ Error: ${err}\n`);
  }
  
  // Test 2: Publish summarization request
  console.log('2️⃣ Publishing summarization request...');
  try {
    const summaryId = await client.publish('summaries', {
      type: 'summarization:conversation',
      data: {
        userId: 'test-user',
        sessionId: 'test-session',
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there! How can I help you today?' }
        ],
        timestamp: Date.now()
      }
    });
    console.log(`   ✅ Published with ID: ${summaryId?.messageId || 'local'}\n`);
  } catch (err) {
    console.log(`   ⚠️ Error: ${err}\n`);
  }
  
  // Test 3: Publish trust update
  console.log('3️⃣ Publishing trust update...');
  try {
    const trustId = await client.publish('trust-updates', {
      type: 'trust:update',
      data: {
        userId: 'test-user',
        system: 'reading-between-lines',
        update: { detectedPattern: 'deflection', confidence: 0.85 },
        timestamp: Date.now()
      }
    });
    console.log(`   ✅ Published with ID: ${trustId?.messageId || 'local'}\n`);
  } catch (err) {
    console.log(`   ⚠️ Error: ${err}\n`);
  }
  
  // Test 4: Publish context warmup
  console.log('4️⃣ Publishing context warmup request...');
  try {
    const warmupId = await client.publish('context-warmup', {
      type: 'context:warmup',
      data: {
        userId: 'test-user',
        personaId: 'ferni',
        sessionId: 'test-session',
        timestamp: Date.now()
      }
    });
    console.log(`   ✅ Published with ID: ${warmupId?.messageId || 'local'}\n`);
  } catch (err) {
    console.log(`   ⚠️ Error: ${err}\n`);
  }
  
  // Get metrics
  console.log('📊 Pub/Sub Metrics:');
  const metrics = client.getMetrics();
  console.log(JSON.stringify(metrics, null, 2));
  
  console.log('\n✅ Pub/Sub test completed!');
  console.log('\n💡 Check the worker logs to see if messages were received.');
}

testPubSub().catch(console.error);

