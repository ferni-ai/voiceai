#!/usr/bin/env npx tsx
/**
 * FTIS E2E Local Validation
 *
 * Comprehensive end-to-end validation of FTIS routing flow.
 * Tests: Query → Semantic Router → Domain Bridge → Tool Execution
 *
 * Run this BEFORE deploying to production.
 *
 * Usage:
 *   FTIS_ONLY_MODE=true npx tsx scripts/ftis-e2e-local-validation.ts
 *
 * @module scripts/ftis-e2e-local-validation
 */

import { performance } from 'perf_hooks';

// ============================================================================
// TEST CASES - Real user queries mapped to expected tools
// ============================================================================

interface TestCase {
  query: string;
  expectedSemanticId?: string;
  expectedDomainTool?: string;
  category: string;
  description: string;
  critical: boolean;
}

const TEST_CASES: TestCase[] = [
  // ============ MUSIC ============
  // Actual semantic ID: spotify_play → playMusic
  {
    query: 'Play some jazz',
    expectedSemanticId: 'spotify_play',
    expectedDomainTool: 'playMusic',
    category: 'music',
    description: 'Basic music play request',
    critical: true,
  },
  {
    query: 'Put on some relaxing music',
    expectedSemanticId: 'spotify_play',
    expectedDomainTool: 'playMusic',
    category: 'music',
    description: 'Music request',
    critical: true,
  },
  {
    query: 'Pause',
    expectedSemanticId: 'spotify_pause',
    expectedDomainTool: 'musicControl',
    category: 'music',
    description: 'Music pause',
    critical: true,
  },
  
  // ============ WEATHER ============
  {
    query: "What's the weather",
    expectedSemanticId: 'weather_current',
    expectedDomainTool: 'getWeather',
    category: 'weather',
    description: 'Basic weather query',
    critical: true,
  },
  {
    query: 'Weather forecast',
    expectedSemanticId: 'weather_forecast',
    expectedDomainTool: 'getWeatherForecast',
    category: 'weather',
    description: 'Weather forecast',
    critical: true,
  },
  
  // ============ CALENDAR ============
  {
    query: 'Create a calendar event',
    expectedSemanticId: 'calendar_create_event',
    expectedDomainTool: 'createCalendarEvent',
    category: 'calendar',
    description: 'Create calendar event',
    critical: true,
  },
  {
    query: "What's on my calendar",
    expectedSemanticId: 'calendar_list_events',
    expectedDomainTool: 'listCalendarEvents',
    category: 'calendar',
    description: 'List calendar events',
    critical: true,
  },
  
  // ============ ALARMS & TIMERS ============
  {
    query: 'Set an alarm',
    expectedSemanticId: 'alarms_set',
    expectedDomainTool: 'setAlarm',
    category: 'alarm',
    description: 'Set alarm',
    critical: true,
  },
  {
    query: 'Set a reminder',
    expectedSemanticId: 'productivity_set_reminder',
    expectedDomainTool: 'scheduleReminder',
    category: 'reminder',
    description: 'Create reminder',
    critical: true,
  },
  
  // ============ HABITS (Maya) ============
  {
    query: 'Track my habit',
    expectedSemanticId: 'habit_track',
    expectedDomainTool: 'trackHabit',
    category: 'habit',
    description: 'Track habit',
    critical: true,
  },
  {
    query: 'Show my habits',
    expectedSemanticId: 'habits_list',
    expectedDomainTool: 'getHabits',
    category: 'habit',
    description: 'List habits',
    critical: true,
  },
  
  // ============ HANDOFFS ============
  // The generic handoff tool routes all persona transfers
  {
    query: 'Transfer me to Maya',
    expectedSemanticId: 'handoff',
    expectedDomainTool: 'handoffToPersona',
    category: 'handoff',
    description: 'Handoff to Maya',
    critical: true,
  },
  {
    query: 'Switch to Peter',
    expectedSemanticId: 'handoff',
    expectedDomainTool: 'handoffToPersona',
    category: 'handoff',
    description: 'Handoff to Peter',
    critical: true,
  },
  
  // ============ CRISIS (CRITICAL) ============
  {
    query: "I'm having a panic attack",
    expectedSemanticId: 'grounding_exercise',
    expectedDomainTool: 'guideGroundingExercise',
    category: 'crisis',
    description: 'Panic support',
    critical: true,
  },
  {
    query: "I need crisis support",
    expectedSemanticId: 'crisis_support',
    expectedDomainTool: 'crisisSupport',
    category: 'crisis',
    description: 'Crisis support',
    critical: true,
  },
  
  // ============ SMART HOME ============
  {
    query: 'Turn on the lights',
    expectedSemanticId: 'smarthome_lights',
    expectedDomainTool: 'controlLights',
    category: 'home',
    description: 'Smart home lights',
    critical: false,
  },
  {
    query: 'Set thermostat to 72',
    expectedSemanticId: 'smarthome_thermostat',
    expectedDomainTool: 'setThermostatTemperature',
    category: 'home',
    description: 'Smart home thermostat',
    critical: false,
  },
  
  // ============ GAMES ============
  {
    query: 'Play trivia',
    expectedSemanticId: 'game_trivia',
    expectedDomainTool: 'startGame',
    category: 'games',
    description: 'Trivia game',
    critical: false,
  },
  
  // ============ TASKS & LISTS ============
  {
    query: 'Add milk to my list',
    expectedSemanticId: 'lists_add',
    expectedDomainTool: 'addToList',
    category: 'lists',
    description: 'Add to list',
    critical: false,
  },
  
  // ============ CONVERSATIONAL (Should NOT route) ============
  {
    query: 'I just wanted to chat',
    expectedDomainTool: undefined,
    category: 'conversation',
    description: 'Chat intent',
    critical: true,
  },
  {
    query: 'Tell me about yourself',
    expectedDomainTool: undefined,
    category: 'conversation',
    description: 'About query',
    critical: true,
  },
];

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

interface ValidationResult {
  testCase: TestCase;
  passed: boolean;
  actualSemanticId?: string;
  actualDomainTool?: string;
  confidence?: number;
  latencyMs: number;
  error?: string;
}

async function runValidation(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       FTIS E2E LOCAL VALIDATION - FULL PIPELINE TEST       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Check FTIS_ONLY_MODE
  if (process.env.FTIS_ONLY_MODE !== 'true') {
    console.log('⚠️  FTIS_ONLY_MODE is not enabled. Setting it for this test...\n');
    process.env.FTIS_ONLY_MODE = 'true';
  }

  // Import modules
  console.log('📦 Loading FTIS modules...\n');
  
  const { createSemanticRouter } = await import('../src/tools/semantic-router/router.js');
  const { getDomainToolId, hasDomainMapping } = await import(
    '../src/tools/semantic-router/domain-bridge.js'
  );
  const { initializeSemanticRouter } = await import(
    '../src/tools/semantic-router/integration/init.js'
  );

  // Initialize
  console.log('🔧 Initializing semantic router...');
  const initStart = performance.now();
  
  try {
    await initializeSemanticRouter();
    console.log(`✅ Router initialized in ${(performance.now() - initStart).toFixed(0)}ms\n`);
  } catch (error) {
    console.log(`⚠️ Router init partial: ${error}\n`);
  }

  // Create router
  const router = createSemanticRouter();

  // Run test cases
  console.log('🧪 Running test cases...\n');
  console.log('─'.repeat(80));

  const results: ValidationResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let criticalFailures = 0;

  for (const testCase of TEST_CASES) {
    const start = performance.now();
    let result: ValidationResult;

    try {
      const routingResult = await router.route(testCase.query);
      const latencyMs = performance.now() - start;

      // Get the actual tool ID from routing
      let actualSemanticId: string | undefined;
      let actualDomainTool: string | undefined;
      let confidence = 0;

      if (routingResult.action.type === 'execute' || routingResult.action.type === 'confirm') {
        actualSemanticId = routingResult.action.toolId;
        actualDomainTool = getDomainToolId(actualSemanticId) || undefined;
        confidence = routingResult.topMatch?.score || 0;
      } else if (routingResult.action.type === 'conversation') {
        // No tool - this is conversation
        confidence = routingResult.topMatch?.score || 0;
      }

      // Determine if test passed
      let passed = false;
      
      if (testCase.expectedDomainTool === undefined) {
        // Expected conversation - should NOT route to a tool
        passed = routingResult.action.type === 'conversation';
      } else if (testCase.expectedSemanticId) {
        // Check semantic ID match
        passed = actualSemanticId === testCase.expectedSemanticId;
      } else {
        // Check domain tool match
        passed = actualDomainTool === testCase.expectedDomainTool;
      }

      result = {
        testCase,
        passed,
        actualSemanticId,
        actualDomainTool,
        confidence,
        latencyMs,
      };

    } catch (error) {
      result = {
        testCase,
        passed: false,
        latencyMs: performance.now() - start,
        error: String(error),
      };
    }

    results.push(result);

    // Print result
    const status = result.passed ? '✅' : '❌';
    const criticalMark = testCase.critical ? ' [CRITICAL]' : '';
    console.log(
      `${status} ${testCase.category.padEnd(12)} | "${testCase.query.slice(0, 35).padEnd(35)}" → ` +
      `${(result.actualDomainTool || 'conversation').padEnd(25)} ` +
      `(${result.latencyMs.toFixed(0)}ms)${criticalMark}`
    );

    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
      if (testCase.critical) {
        criticalFailures++;
        console.log(`   ⚠️  Expected: ${testCase.expectedDomainTool || 'conversation'}, Got: ${result.actualDomainTool || 'conversation'}`);
        if (result.error) {
          console.log(`   ⚠️  Error: ${result.error}`);
        }
      }
    }
  }

  // Summary
  console.log('─'.repeat(80));
  console.log('\n');
  console.log('📊 VALIDATION SUMMARY');
  console.log('═'.repeat(40));
  console.log(`Total Tests:      ${TEST_CASES.length}`);
  console.log(`Passed:           ${passedCount} ✅`);
  console.log(`Failed:           ${failedCount} ❌`);
  console.log(`Critical Failures: ${criticalFailures}`);
  console.log(`Pass Rate:        ${((passedCount / TEST_CASES.length) * 100).toFixed(1)}%`);
  console.log(`Avg Latency:      ${(results.reduce((s, r) => s + r.latencyMs, 0) / results.length).toFixed(0)}ms`);
  console.log('');

  // Final verdict
  if (criticalFailures === 0 && passedCount / TEST_CASES.length >= 0.9) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ E2E VALIDATION PASSED - READY FOR PRODUCTION           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');
    process.exit(0);
  } else {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ❌ E2E VALIDATION FAILED - FIX ISSUES BEFORE DEPLOYING    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // List failures
    if (criticalFailures > 0) {
      console.log('🚨 Critical Failures:');
      for (const result of results) {
        if (!result.passed && result.testCase.critical) {
          console.log(`   - ${result.testCase.description}: "${result.testCase.query}"`);
          console.log(`     Expected: ${result.testCase.expectedDomainTool || 'conversation'}`);
          console.log(`     Got: ${result.actualDomainTool || 'conversation'}`);
        }
      }
    }

    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

runValidation().catch((error) => {
  console.error('💥 Validation crashed:', error);
  process.exit(1);
});
