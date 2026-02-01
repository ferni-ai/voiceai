#!/usr/bin/env npx tsx
/**
 * Test Tool Orchestrator Integration
 *
 * This script validates the tool orchestrator end-to-end with real tools.
 *
 * Usage:
 *   npx tsx scripts/test-tool-orchestrator.ts
 */

import { toolOrchestrator } from '../src/tools/orchestrator/tool-orchestrator.js';
import { initializeToolRegistry } from '../src/tools/registry/loader.js';
import { detectToolIntent } from '../src/tools/dynamic-tool-router.js';
import { toolRegistry } from '../src/tools/registry/index.js';

async function test() {
  console.log('🚀 Testing Tool Orchestrator Integration\n');
  console.log('='.repeat(60));

  // Step 1: Initialize the tool registry with actual domains
  console.log('\n📦 STEP 1: Initializing tool registry...\n');
  const registryResult = await initializeToolRegistry({ lazyLoading: false });
  console.log('✅ Registry initialized:', {
    totalLoaded: registryResult.loaded,
    domainCount: Object.keys(registryResult.byDomain).length,
    domains: Object.entries(registryResult.byDomain)
      .map(([d, count]) => `${d}: ${count}`)
      .join(', '),
  });

  // Step 2: Initialize the orchestrator
  console.log('\n🎯 STEP 2: Initializing tool orchestrator...\n');
  await toolOrchestrator.initialize();
  const stats = toolOrchestrator.getStats();
  console.log('✅ Orchestrator initialized:', {
    totalTools: stats.totalTools,
    cacheSize: stats.cacheSize,
    maxTools: stats.config.maxTools,
  });

  // Step 3: Test music query
  console.log('\n🎵 STEP 3: Testing music query...\n');
  const musicResult = await toolOrchestrator.getToolsForIntent({
    transcript: 'play some relaxing jazz',
    userId: 'test-user',
    agentId: 'ferni',
  });

  console.log('Music query results:', {
    selected: musicResult.meta.selected,
    selectionTimeMs: musicResult.meta.selectionTimeMs,
    sources: musicResult.meta.sources,
  });

  const toolNames = Object.keys(musicResult.tools);
  console.log('\nSelected tools:', toolNames.slice(0, 15).join(', '));

  const hasMusicTools = toolNames.some(
    (n) => n.toLowerCase().includes('music') || n === 'playMusic'
  );
  console.log('✅ Has music tools:', hasMusicTools);

  // Step 4: Test grief query (contextual)
  console.log('\n😢 STEP 4: Testing grief query...\n');
  const griefResult = await toolOrchestrator.getToolsForIntent({
    transcript: 'my father passed away last week',
    userId: 'test-user',
    agentId: 'ferni',
    context: {
      emotion: 'sad',
    },
  });

  console.log('Grief query results:', {
    selected: griefResult.meta.selected,
    detectedIntent: griefResult.meta.detectedIntent?.categories,
    contextualTools: griefResult.meta.sources.contextual,
  });

  // Step 5: Test intent detection directly
  console.log('\n🔍 STEP 5: Testing intent detection...\n');
  const testPhrases = [
    'play some music',
    'my mom died last year',
    'should I take this job offer',
    'I feel really anxious',
    'help me with my relationship',
  ];

  for (const phrase of testPhrases) {
    const intent = detectToolIntent(phrase);
    console.log(`"${phrase.slice(0, 30)}..." → ${intent.categories.join(', ') || '(none)'}`);
  }

  // Step 6: Test caching
  console.log('\n⚡ STEP 6: Testing caching...\n');
  const cacheQuery = {
    transcript: 'what is the weather like',
    userId: 'test-user',
    agentId: 'ferni',
  };

  const t1 = Date.now();
  await toolOrchestrator.getToolsForIntent(cacheQuery);
  const firstCall = Date.now() - t1;

  const t2 = Date.now();
  await toolOrchestrator.getToolsForIntent(cacheQuery);
  const secondCall = Date.now() - t2;

  console.log(`First call: ${firstCall}ms`);
  console.log(`Second call (cached): ${secondCall}ms`);
  console.log(`✅ Caching working:`, secondCall <= firstCall);

  // Step 7: Show explanation
  console.log('\n📝 STEP 7: Selection explanation example...\n');
  console.log(toolOrchestrator.explainSelection(musicResult));

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('='.repeat(60));

  // Show specific tool check
  const playMusicTool = toolRegistry.get('playMusic');
  console.log('\n🎹 playMusic tool check:', {
    exists: !!playMusicTool,
    domain: playMusicTool?.domain,
    description: playMusicTool?.description?.slice(0, 50) + '...',
  });
}

test().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

