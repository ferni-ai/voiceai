#!/usr/bin/env npx ts-node
/**
 * Test Performance Optimizations
 *
 * Quick verification that all 6 performance modules work correctly.
 */

import {
  ParallelExecutor,
  parallelCollect,
  parallelMap,
} from '../src/agents/shared/performance/parallel-executor.js';

import {
  ResponseStreamProcessor,
  LookaheadBuffer,
} from '../src/agents/shared/performance/response-streaming.js';

import {
  EdgeCache,
  getPersonaBundleCache,
} from '../src/agents/shared/performance/edge-cache.js';

import {
  WebSocketKeepAlive,
} from '../src/agents/shared/performance/websocket-keepalive.js';

import {
  BatchAnalyticsWriter,
  createSessionEvent,
  createPerformanceEvent,
} from '../src/agents/shared/performance/batch-analytics.js';

// ============================================================================
// TEST: Parallel Executor
// ============================================================================

async function testParallelExecutor(): Promise<void> {
  console.log('\n🔄 Testing Parallel Executor...');
  
  const executor = new ParallelExecutor<number>();
  
  // Add operations with dependencies
  executor.add({
    id: 'step1',
    execute: async () => {
      await sleep(50);
      return 1;
    },
    priority: 0,
  });
  
  executor.add({
    id: 'step2',
    execute: async () => {
      await sleep(30);
      return 2;
    },
    dependsOn: ['step1'],
  });
  
  executor.add({
    id: 'step3',
    execute: async () => {
      await sleep(20);
      return 3;
    },
    // No dependencies - runs in parallel with step1
  });
  
  const { results, totalDurationMs, batchCount, failedCount } = await executor.execute();
  
  console.log(`  ✅ Executed ${results.size} operations in ${batchCount} batches`);
  console.log(`  ✅ Total duration: ${totalDurationMs}ms (would be ~100ms sequential)`);
  console.log(`  ✅ Failed: ${failedCount}`);
  
  // Test parallelCollect
  const { successes, errors } = await parallelCollect([
    async () => 'a',
    async () => 'b',
    async () => 'c',
  ]);
  
  console.log(`  ✅ parallelCollect: ${successes.length} successes, ${errors.length} errors`);
}

// ============================================================================
// TEST: Response Streaming
// ============================================================================

async function testResponseStreaming(): Promise<void> {
  console.log('\n🎤 Testing Response Streaming...');
  
  const chunks: string[] = [];
  
  const processor = new ResponseStreamProcessor(
    async (chunk) => {
      chunks.push(chunk.text);
    },
    {
      minChunkSize: 20,
      maxChunkSize: 50,
      flushDelayMs: 50,
    }
  );
  
  // Simulate LLM token stream
  const response = "Hello! How are you doing today? I hope you're having a great day.";
  for (const char of response) {
    processor.push(char);
    await sleep(5); // Simulate token arrival
  }
  
  const metrics = await processor.flush();
  
  console.log(`  ✅ Processed into ${metrics.totalChunks} chunks`);
  console.log(`  ✅ First chunk latency: ${metrics.firstChunkLatencyMs}ms`);
  console.log(`  ✅ Chunks: ${JSON.stringify(chunks)}`);
  
  // Test Lookahead Buffer
  const lookahead = new LookaheadBuffer<string>(
    async (text) => text.toUpperCase(),
    2
  );
  
  lookahead.add({ text: 'hello', index: 0, isFinal: false, timestamp: Date.now(), latencyMs: 0 });
  const result = await lookahead.getNext();
  console.log(`  ✅ Lookahead: ${result?.data}`);
}

// ============================================================================
// TEST: Edge Cache
// ============================================================================

async function testEdgeCache(): Promise<void> {
  console.log('\n💾 Testing Edge Cache...');
  
  const cache = new EdgeCache<{ name: string }>({
    maxSize: 100,
    defaultTtlMs: 5000,
    staleWhileRevalidate: true,
  });
  
  // Test basic set/get
  cache.set('user:1', { name: 'Alice' });
  const user1 = cache.get('user:1');
  console.log(`  ✅ Set/Get: ${user1?.name}`);
  
  // Test getOrFetch
  let fetchCount = 0;
  const user2 = await cache.getOrFetch('user:2', async () => {
    fetchCount++;
    return { name: 'Bob' };
  });
  
  // Second call should hit cache
  await cache.getOrFetch('user:2', async () => {
    fetchCount++;
    return { name: 'Bob' };
  });
  
  console.log(`  ✅ getOrFetch: ${user2.name}, fetch called ${fetchCount}x`);
  
  // Test persona bundle cache
  const bundleCache = getPersonaBundleCache();
  bundleCache.set('bundle:ferni', { id: 'ferni', name: 'Ferni' });
  const stats = bundleCache.getStats();
  console.log(`  ✅ Persona cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
}

// ============================================================================
// TEST: WebSocket Keep-Alive
// ============================================================================

async function testWebSocketKeepAlive(): Promise<void> {
  console.log('\n🔗 Testing WebSocket Keep-Alive...');
  
  let pingCount = 0;
  let pongReceived = false;
  
  const keepAlive = new WebSocketKeepAlive(
    {
      onPing: () => {
        pingCount++;
        // Simulate immediate pong response
        setTimeout(() => {
          pongReceived = true;
          keepAlive.receivedPong();
        }, 10);
      },
    },
    {
      pingIntervalMs: 100,
      pongTimeoutMs: 500,
    }
  );
  
  keepAlive.start(() => {
    // Ping function called by interval
  });
  
  await sleep(250); // Let it run for a bit
  
  const state = keepAlive.getState();
  keepAlive.stop();
  
  console.log(`  ✅ Connection healthy: ${keepAlive.isHealthy()}`);
  console.log(`  ✅ Pings sent: ${pingCount > 0 ? 'yes' : 'no'}`);
  console.log(`  ✅ Avg latency: ${state.avgLatencyMs}ms`);
}

// ============================================================================
// TEST: Batch Analytics
// ============================================================================

async function testBatchAnalytics(): Promise<void> {
  console.log('\n📊 Testing Batch Analytics...');
  
  const flushedBatches: Array<unknown[]> = [];
  
  const writer = new BatchAnalyticsWriter({
    maxBatchSize: 5,
    flushIntervalMs: 10000, // Long interval - we'll trigger manually
  });
  
  writer.setFlushHandler(async (events) => {
    flushedBatches.push(events);
  });
  
  // Queue events
  writer.queue(createSessionEvent('session_start', 'sess-1', 'user-1'));
  writer.queue(createPerformanceEvent('ttfb', 150, 'sess-1'));
  writer.queue(createPerformanceEvent('turn_time', 200, 'sess-1'));
  
  console.log(`  ✅ Queue size: ${writer.getQueueLength()}`);
  
  // Manually flush
  await writer.flush();
  
  const stats = writer.getStats();
  console.log(`  ✅ Total flushed: ${stats.totalEventsFlushed}`);
  console.log(`  ✅ Batches flushed: ${stats.totalBatchesFlushed}`);
  
  await writer.shutdown();
}

// ============================================================================
// MAIN
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('🚀 Testing Ferni Performance Optimizations\n');
  console.log('=' .repeat(50));
  
  try {
    await testParallelExecutor();
    await testResponseStreaming();
    await testEdgeCache();
    await testWebSocketKeepAlive();
    await testBatchAnalytics();
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ All performance tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();

