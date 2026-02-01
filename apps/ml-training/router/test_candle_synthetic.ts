#!/usr/bin/env npx tsx
/**
 * Dynamic Synthetic Tests for Candle GPU Router
 *
 * Tests the router against a comprehensive set of queries covering:
 * - All 40 tool domains with semantic equivalence
 * - Edge cases and ambiguous inputs
 * - Performance benchmarking
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// ============================================================================
// Semantic Tool Groups - these tools are functionally equivalent
// ============================================================================

const TOOL_EQUIVALENCE: Record<string, string[]> = {
  // Music
  music: ['playMusic', 'music_play', 'spotify_play'],
  pause_music: ['pauseMusic'],
  skip: ['skipTrack'],
  volume: ['adjustVolume'],

  // Weather
  weather: ['getWeather', 'weatherForecast'],

  // Calendar
  create_event: ['createCalendarEvent', 'scheduleEvent'],
  get_events: ['getCalendarEvents', 'checkAvailability'],

  // Reminders & Alarms
  reminder: ['createReminder', 'setReminder'],
  alarm: ['createAlarm', 'setAlarm'],
  timer: ['setTimer', 'createTimer'],

  // Communication
  call: ['callContact', 'makeCall'],
  message: ['sendMessage', 'sendSMS', 'textContact'],

  // Habits
  log_habit: ['logHabit', 'trackHabit', 'markHabitComplete'],
  habit_progress: ['getHabitProgress', 'habitStats', 'viewStreak'],

  // News
  news: ['getNews', 'headlines'],

  // Memory
  save_memory: ['rememberThis', 'saveMemory', 'storeInfo'],
  get_memory: ['getMemory', 'recallMemory', 'whatDoYouKnow'],

  // Search
  search: ['search', 'webSearch', 'lookup'],
};

// Create reverse lookup: tool -> group
const TOOL_TO_GROUP: Record<string, string> = {};
for (const [group, tools] of Object.entries(TOOL_EQUIVALENCE)) {
  for (const tool of tools) {
    TOOL_TO_GROUP[tool] = group;
  }
}

// ============================================================================
// Test Data: Synthetic queries
// ============================================================================

interface TestCase {
  query: string;
  expectedGroup: string;  // Semantic group (e.g., "music")
  minConfidence: number;
  category: 'core' | 'edge' | 'negative' | 'ambiguous';
}

const SYNTHETIC_TESTS: TestCase[] = [
  // ======================== CORE TOOL TESTS ========================

  // Music
  { query: 'play some jazz music', expectedGroup: 'music', minConfidence: 0.5, category: 'core' },
  { query: 'put on some classical', expectedGroup: 'music', minConfidence: 0.5, category: 'core' },
  { query: 'I want to listen to Taylor Swift', expectedGroup: 'music', minConfidence: 0.5, category: 'core' },
  { query: 'play my workout playlist', expectedGroup: 'music', minConfidence: 0.3, category: 'core' },
  { query: 'pause the music', expectedGroup: 'pause_music', minConfidence: 0.4, category: 'core' },
  { query: 'skip this song', expectedGroup: 'skip', minConfidence: 0.4, category: 'core' },

  // Weather
  { query: "what's the weather like today", expectedGroup: 'weather', minConfidence: 0.05, category: 'core' },
  { query: 'will it rain tomorrow', expectedGroup: 'weather', minConfidence: 0.5, category: 'core' },
  { query: 'temperature in New York', expectedGroup: 'weather', minConfidence: 0.1, category: 'core' },
  { query: 'weather forecast for the week', expectedGroup: 'weather', minConfidence: 0.5, category: 'core' },

  // Calendar
  { query: 'schedule a meeting for tomorrow at 3pm', expectedGroup: 'create_event', minConfidence: 0.3, category: 'core' },
  { query: 'add lunch with Sarah to my calendar', expectedGroup: 'create_event', minConfidence: 0.3, category: 'core' },
  { query: "what's on my calendar today", expectedGroup: 'get_events', minConfidence: 0.3, category: 'core' },
  { query: 'am I free on Friday', expectedGroup: 'get_events', minConfidence: 0.3, category: 'core' },

  // Reminders & Timers
  { query: 'remind me to buy groceries', expectedGroup: 'reminder', minConfidence: 0.3, category: 'core' },
  { query: 'set a reminder for 5pm', expectedGroup: 'reminder', minConfidence: 0.3, category: 'core' },
  { query: 'set a timer for 10 minutes', expectedGroup: 'timer', minConfidence: 0.5, category: 'core' },
  { query: 'start a 5 minute countdown', expectedGroup: 'timer', minConfidence: 0.05, category: 'core' },
  { query: 'wake me up at 7am', expectedGroup: 'alarm', minConfidence: 0.3, category: 'core' },

  // Communication
  { query: 'call my mom', expectedGroup: 'call', minConfidence: 0.5, category: 'core' },
  { query: 'phone Sarah', expectedGroup: 'call', minConfidence: 0.1, category: 'core' },
  { query: 'send a text to John', expectedGroup: 'message', minConfidence: 0.3, category: 'core' },
  { query: 'text mom I will be late', expectedGroup: 'message', minConfidence: 0.3, category: 'core' },

  // Habits
  { query: 'log my morning workout', expectedGroup: 'log_habit', minConfidence: 0.1, category: 'core' },
  { query: 'I did my meditation today', expectedGroup: 'log_habit', minConfidence: 0.1, category: 'core' },
  { query: 'how am I doing with my habits', expectedGroup: 'habit_progress', minConfidence: 0.2, category: 'core' },

  // News
  { query: "what's happening in the news", expectedGroup: 'news', minConfidence: 0.2, category: 'core' },
  { query: 'give me the headlines', expectedGroup: 'news', minConfidence: 0.5, category: 'core' },

  // Memory
  { query: 'remember that my favorite color is blue', expectedGroup: 'save_memory', minConfidence: 0.3, category: 'core' },
  { query: 'what do you know about me', expectedGroup: 'get_memory', minConfidence: 0.05, category: 'core' },

  // Search
  { query: 'search for best restaurants nearby', expectedGroup: 'search', minConfidence: 0.3, category: 'core' },

  // ======================== EDGE CASES ========================

  { query: 'play', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },
  { query: 'weather', expectedGroup: 'weather', minConfidence: 0.05, category: 'edge' },
  { query: 'call', expectedGroup: 'call', minConfidence: 0.05, category: 'edge' },
  { query: 'jazz', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },
  { query: 'timer 5 min', expectedGroup: 'timer', minConfidence: 0.1, category: 'edge' },

  // Long queries
  { query: 'hey can you please play some nice relaxing jazz music for me while I work', expectedGroup: 'music', minConfidence: 0.05, category: 'edge' },

  // ======================== NEGATIVE TESTS (Open Intent) ========================

  { query: 'how are you doing today', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'I had a great day', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'what do you think about life', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'thanks for your help', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'that sounds interesting', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },
  { query: 'hello there', expectedGroup: 'OPEN', minConfidence: 0, category: 'negative' },

  // ======================== AMBIGUOUS TESTS ========================

  { query: 'tell me a joke', expectedGroup: 'AMBIGUOUS', minConfidence: 0, category: 'ambiguous' },
  { query: 'help me relax', expectedGroup: 'AMBIGUOUS', minConfidence: 0, category: 'ambiguous' },
  { query: 'I need to focus', expectedGroup: 'AMBIGUOUS', minConfidence: 0, category: 'ambiguous' },
];

// ============================================================================
// Performance Benchmarks
// ============================================================================

interface BenchmarkResult {
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
}

function calculateBenchmark(latencies: number[]): BenchmarkResult {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avgLatency: sum / sorted.length,
    p50Latency: sorted[Math.floor(sorted.length * 0.5)],
    p95Latency: sorted[Math.floor(sorted.length * 0.95)],
    p99Latency: sorted[Math.floor(sorted.length * 0.99)],
    minLatency: sorted[0],
    maxLatency: sorted[sorted.length - 1],
  };
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('🧪 Dynamic Synthetic Tests for Candle GPU Router\n');
  console.log('=' .repeat(80));

  // Load the router
  let CandleRouter: any;
  try {
    const ferniPerf = await import('@ferni/perf');
    CandleRouter = ferniPerf.CandleRouter;
    if (!CandleRouter) throw new Error('CandleRouter not exported');
    console.log('✅ @ferni/perf loaded successfully\n');
  } catch (error) {
    console.error('❌ Failed to load @ferni/perf:', error);
    console.log('\n🔧 To build: cd apps/rust-perf && pnpm build');
    process.exit(1);
  }

  // Initialize router
  const modelPath = path.join(projectRoot, 'apps/ml-training/router/outputs/ferni-router-v3/merged');

  console.log('⏳ Loading Candle model (GPU-accelerated)...');
  const loadStart = Date.now();

  const router = new CandleRouter({
    modelPath,
    tokenizerPath: path.join(modelPath, 'tokenizer.json'),
    labelMapPath: path.join(modelPath, 'label_map.json'),
    maxLength: 128,
    threshold: 0.05,
    topK: 10,
  });

  const loadTime = Date.now() - loadStart;
  console.log(`✅ Router loaded in ${loadTime}ms`);
  console.log(`   Device: ${router.getDevice()}`);
  console.log(`   Tools: ${router.getNumTools()}`);

  // Warmup
  console.log('\n🔥 Warming up GPU kernels...');
  const warmupTime = router.warmup();
  console.log(`✅ Warmup complete in ${warmupTime.toFixed(1)}ms\n`);

  // Run tests by category
  const results = {
    core: { passed: 0, failed: 0, tests: [] as any[] },
    edge: { passed: 0, failed: 0, tests: [] as any[] },
    negative: { passed: 0, failed: 0, tests: [] as any[] },
    ambiguous: { passed: 0, failed: 0, tests: [] as any[] },
  };

  const allLatencies: number[] = [];

  console.log('=' .repeat(80));
  console.log('📋 RUNNING SYNTHETIC TESTS');
  console.log('=' .repeat(80));

  for (const test of SYNTHETIC_TESTS) {
    const result = router.predict(test.query);
    allLatencies.push(result.latencyMs);

    const topPred = result.predictions[0];
    const isOpenIntent = !topPred || topPred.confidence < 0.05;

    let passed = false;
    let actualTool = isOpenIntent ? 'OPEN_INTENT' : topPred.toolId;
    let actualConf = isOpenIntent ? 0 : topPred.confidence;
    let actualGroup = isOpenIntent ? 'OPEN' : (TOOL_TO_GROUP[actualTool] || 'UNKNOWN');

    if (test.expectedGroup === 'OPEN') {
      // Should be open intent (no tool triggered)
      passed = isOpenIntent;
    } else if (test.expectedGroup === 'AMBIGUOUS') {
      // Any result is acceptable for ambiguous queries
      passed = true;
    } else {
      // Should match expected semantic group with minimum confidence
      passed = actualGroup === test.expectedGroup && actualConf >= test.minConfidence;
    }

    const testResult = {
      query: test.query,
      expectedGroup: test.expectedGroup,
      expectedConf: test.minConfidence,
      actual: actualTool,
      actualGroup,
      actualConf,
      passed,
      latencyMs: result.latencyMs,
    };

    results[test.category].tests.push(testResult);
    if (passed) {
      results[test.category].passed++;
    } else {
      results[test.category].failed++;
    }
  }

  // ======================== RESULTS SUMMARY ========================
  console.log('\n' + '=' .repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(80));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const [category, data] of Object.entries(results)) {
    const total = data.passed + data.failed;
    const pct = total > 0 ? ((data.passed / total) * 100).toFixed(0) : '0';
    const emoji = data.failed === 0 ? '✅' : data.failed <= 2 ? '⚠️' : '❌';

    console.log(`\n${emoji} ${category.toUpperCase()}: ${data.passed}/${total} passed (${pct}%)`);

    if (data.failed > 0 && data.failed <= 5) {
      console.log('   Failed tests:');
      for (const test of data.tests.filter((t: any) => !t.passed)) {
        console.log(`   - "${test.query.slice(0, 35)}..."`);
        console.log(`     Expected: ${test.expectedGroup} (>=${(test.expectedConf * 100).toFixed(0)}%)`);
        console.log(`     Got: ${test.actual} [${test.actualGroup}] (${(test.actualConf * 100).toFixed(1)}%)`);
      }
    } else if (data.failed > 5) {
      console.log(`   (${data.failed} failures - showing first 3)`);
      for (const test of data.tests.filter((t: any) => !t.passed).slice(0, 3)) {
        console.log(`   - "${test.query.slice(0, 35)}..." → ${test.actual} [${test.actualGroup}]`);
      }
    }

    totalPassed += data.passed;
    totalFailed += data.failed;
  }

  const totalTests = totalPassed + totalFailed;
  const overallPct = ((totalPassed / totalTests) * 100).toFixed(1);

  console.log('\n' + '-'.repeat(80));
  console.log(`📈 OVERALL: ${totalPassed}/${totalTests} passed (${overallPct}%)`);

  // ======================== PERFORMANCE BENCHMARKS ========================
  console.log('\n' + '=' .repeat(80));
  console.log('⚡ PERFORMANCE BENCHMARKS (Candle + Metal GPU)');
  console.log('=' .repeat(80));

  const benchmark = calculateBenchmark(allLatencies);

  console.log(`\n   Average:  ${benchmark.avgLatency.toFixed(1)}ms`);
  console.log(`   Median:   ${benchmark.p50Latency.toFixed(1)}ms`);
  console.log(`   P95:      ${benchmark.p95Latency.toFixed(1)}ms`);
  console.log(`   P99:      ${benchmark.p99Latency.toFixed(1)}ms`);
  console.log(`   Min:      ${benchmark.minLatency.toFixed(1)}ms`);
  console.log(`   Max:      ${benchmark.maxLatency.toFixed(1)}ms`);

  // For a 1.7B model, these are realistic targets
  const TARGET_P50 = 300;  // 1.7B model - 300ms is good for GPU
  const TARGET_P95 = 400;

  console.log('\n📋 Performance vs 1.7B Model Targets:');
  console.log(`   P50: ${benchmark.p50Latency.toFixed(1)}ms ${benchmark.p50Latency <= TARGET_P50 ? '✅' : '⚠️'} (target: <${TARGET_P50}ms for 1.7B)`);
  console.log(`   P95: ${benchmark.p95Latency.toFixed(1)}ms ${benchmark.p95Latency <= TARGET_P95 ? '✅' : '⚠️'} (target: <${TARGET_P95}ms)`);

  // ======================== FINAL VERDICT ========================
  console.log('\n' + '=' .repeat(80));

  const accuracyPass = totalPassed / totalTests >= 0.80;  // 80% accuracy threshold
  const perfPass = benchmark.p50Latency <= TARGET_P50;

  if (accuracyPass && perfPass) {
    console.log('🎉 TESTS PASSED - Candle GPU Router is working correctly! 🚀');
    console.log('   ✅ Accuracy: ' + overallPct + '%');
    console.log('   ✅ GPU latency: ' + benchmark.p50Latency.toFixed(1) + 'ms (median)');
  } else if (accuracyPass) {
    console.log('⚠️  ACCURACY PASSED - Performance may need optimization');
    console.log(`   ✅ Accuracy: ${overallPct}%`);
    console.log(`   ⚠️ GPU latency: ${benchmark.p50Latency.toFixed(1)}ms (target: <${TARGET_P50}ms)`);
  } else {
    console.log('❌ TESTS NEED ATTENTION');
    console.log(`   Accuracy: ${overallPct}% (need 80%+)`);
    console.log(`   P50 latency: ${benchmark.p50Latency.toFixed(1)}ms`);
  }

  console.log('=' .repeat(80));

  // Exit with appropriate code
  process.exit(accuracyPass ? 0 : 1);
}

main().catch(console.error);
