#!/usr/bin/env npx tsx
/**
 * Test Hybrid Router (ML + Keywords)
 *
 * Compares accuracy between:
 * - Pure ML (Candle GPU)
 * - Hybrid (ML + keyword fallbacks)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Test Cases (same as synthetic tests)
// ============================================================================

const TOOL_EQUIVALENCE: Record<string, string[]> = {
  music: ['playMusic', 'music_play', 'spotify_play'],
  pause_music: ['pauseMusic'],
  skip: ['skipTrack'],
  weather: ['getWeather', 'weatherForecast'],
  create_event: ['createCalendarEvent', 'scheduleEvent'],
  get_events: ['getCalendarEvents', 'checkAvailability'],
  reminder: ['createReminder', 'setReminder'],
  alarm: ['createAlarm', 'setAlarm'],
  timer: ['setTimer', 'createTimer'],
  call: ['callContact', 'makeCall'],
  message: ['sendMessage', 'sendSMS', 'textContact'],
  log_habit: ['logHabit', 'trackHabit', 'markHabitComplete'],
  habit_progress: ['getHabitProgress', 'habitStats', 'viewStreak'],
  news: ['getNews', 'headlines'],
  save_memory: ['rememberThis', 'saveMemory', 'storeInfo'],
  get_memory: ['getMemory', 'recallMemory', 'whatDoYouKnow'],
  search: ['search', 'webSearch', 'lookup'],
};

const TOOL_TO_GROUP: Record<string, string> = {};
for (const [group, tools] of Object.entries(TOOL_EQUIVALENCE)) {
  for (const tool of tools) {
    TOOL_TO_GROUP[tool] = group;
  }
}

interface TestCase {
  query: string;
  expectedGroup: string;
  minConfidence: number;
  category: 'core' | 'edge' | 'negative';
}

const TEST_CASES: TestCase[] = [
  // Core - should work with ML
  { query: 'play some jazz music', expectedGroup: 'music', minConfidence: 0.5, category: 'core' },
  { query: 'put on some classical', expectedGroup: 'music', minConfidence: 0.5, category: 'core' },
  { query: "what's the weather like today", expectedGroup: 'weather', minConfidence: 0.05, category: 'core' },
  { query: 'will it rain tomorrow', expectedGroup: 'weather', minConfidence: 0.5, category: 'core' },
  { query: 'schedule a meeting for tomorrow at 3pm', expectedGroup: 'create_event', minConfidence: 0.3, category: 'core' },
  { query: 'call my mom', expectedGroup: 'call', minConfidence: 0.5, category: 'core' },
  { query: 'send a text to John', expectedGroup: 'message', minConfidence: 0.3, category: 'core' },
  { query: 'set a timer for 10 minutes', expectedGroup: 'timer', minConfidence: 0.5, category: 'core' },
  { query: 'give me the headlines', expectedGroup: 'news', minConfidence: 0.5, category: 'core' },

  // Edge cases - need keyword help
  { query: 'temperature in New York', expectedGroup: 'weather', minConfidence: 0.1, category: 'edge' },
  { query: 'phone Sarah', expectedGroup: 'call', minConfidence: 0.1, category: 'edge' },
  { query: 'text mom I will be late', expectedGroup: 'message', minConfidence: 0.1, category: 'edge' },
  { query: 'play', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },
  { query: 'call', expectedGroup: 'call', minConfidence: 0.05, category: 'edge' },
  { query: 'jazz', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },
  { query: 'weather', expectedGroup: 'weather', minConfidence: 0.05, category: 'edge' },
  { query: 'timer', expectedGroup: 'timer', minConfidence: 0.05, category: 'edge' },
  { query: 'reminder', expectedGroup: 'reminder', minConfidence: 0.05, category: 'edge' },
  { query: 'hey play some nice relaxing jazz music for me while I work', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },

  // Negative - should be open intent
  { query: 'how are you doing today', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'I had a great day', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'thanks for your help', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'that sounds interesting', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
];

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  console.log('🧪 Hybrid Router Test (ML + Keywords)\n');
  console.log('=' .repeat(80));

  // Import routers
  const { routeWithFtis, initializeFtisRouter } = await import(
    '../../../src/tools/semantic-router/integration/ftis-unified-router.js'
  );
  const { routeHybrid } = await import(
    '../../../src/tools/semantic-router/integration/ftis-hybrid-router.js'
  );

  // Initialize
  console.log('⏳ Initializing routers...');
  await initializeFtisRouter();
  console.log('✅ Routers initialized\n');

  // Run tests
  const results = {
    pureML: { passed: 0, failed: 0, details: [] as any[] },
    hybrid: { passed: 0, failed: 0, details: [] as any[] },
  };

  console.log('Query'.padEnd(45) + 'Pure ML'.padEnd(20) + 'Hybrid'.padEnd(20) + 'Expected');
  console.log('-'.repeat(100));

  for (const test of TEST_CASES) {
    // Pure ML
    const mlResult = await routeWithFtis(test.query, { threshold: 0.05 });
    const mlTool = mlResult.isOpenIntent ? 'OPEN_INTENT' : mlResult.toolId;
    const mlGroup = mlResult.isOpenIntent ? 'OPEN' : (TOOL_TO_GROUP[mlTool!] || 'UNKNOWN');
    const mlConf = mlResult.confidence;

    // Hybrid
    const hybridResult = await routeHybrid(test.query, { threshold: 0.05 });
    const hybridTool = hybridResult.isOpenIntent ? 'OPEN_INTENT' : hybridResult.toolId;
    const hybridGroup = hybridResult.isOpenIntent ? 'OPEN' : (TOOL_TO_GROUP[hybridTool!] || 'UNKNOWN');
    const hybridConf = hybridResult.hybridScore;

    // Check results
    const mlPass = test.expectedGroup === 'OPEN'
      ? mlResult.isOpenIntent
      : mlGroup === test.expectedGroup && mlConf >= test.minConfidence;

    const hybridPass = test.expectedGroup === 'OPEN'
      ? hybridResult.isOpenIntent
      : hybridGroup === test.expectedGroup && hybridConf >= test.minConfidence;

    if (mlPass) results.pureML.passed++;
    else results.pureML.failed++;

    if (hybridPass) results.hybrid.passed++;
    else results.hybrid.failed++;

    // Log differences
    const mlStatus = mlPass ? '✅' : '❌';
    const hybridStatus = hybridPass ? '✅' : '❌';
    const mlStr = `${mlStatus} ${mlGroup.slice(0, 8)} (${(mlConf * 100).toFixed(0)}%)`;
    const hybridStr = `${hybridStatus} ${hybridGroup.slice(0, 8)} (${(hybridConf * 100).toFixed(0)}%)`;

    // Only show if there's a difference or failure
    if (!mlPass || !hybridPass || mlGroup !== hybridGroup) {
      console.log(
        test.query.slice(0, 43).padEnd(45) +
        mlStr.padEnd(20) +
        hybridStr.padEnd(20) +
        test.expectedGroup
      );
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('=' .repeat(80));

  const mlTotal = results.pureML.passed + results.pureML.failed;
  const hybridTotal = results.hybrid.passed + results.hybrid.failed;
  const mlPct = ((results.pureML.passed / mlTotal) * 100).toFixed(1);
  const hybridPct = ((results.hybrid.passed / hybridTotal) * 100).toFixed(1);

  console.log(`\n   Pure ML (Candle GPU):  ${results.pureML.passed}/${mlTotal} (${mlPct}%)`);
  console.log(`   Hybrid (ML + Keywords): ${results.hybrid.passed}/${hybridTotal} (${hybridPct}%)`);

  const improvement = parseFloat(hybridPct) - parseFloat(mlPct);
  if (improvement > 0) {
    console.log(`\n   📈 Improvement: +${improvement.toFixed(1)}%`);
  }

  console.log('\n' + '=' .repeat(80));
}

main().catch(console.error);
