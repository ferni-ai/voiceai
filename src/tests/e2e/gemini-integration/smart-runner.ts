#!/usr/bin/env node
/**
 * Smart Gemini E2E Test Runner
 *
 * Features:
 * - Rate limiting to avoid API quota issues
 * - Comprehensive reporting with insights
 * - Tool inventory analysis
 * - LiveKit tool structure tracing
 *
 * Usage:
 *   npx tsx src/tests/e2e/gemini-integration/smart-runner.ts
 *   npx tsx src/tests/e2e/gemini-integration/smart-runner.ts --category tool_calling
 *   npx tsx src/tests/e2e/gemini-integration/smart-runner.ts --verbose --slow
 *
 * @module tests/e2e/gemini-integration/smart-runner
 */

// Load environment variables FIRST
import 'dotenv/config';

import { GeminiTestHarness, TEST_TOOL_DEFINITIONS } from './harness.js';
import {
  RateLimiter,
  ReportGenerator,
  analyzeToolInventory,
  formatToolInventory,
  type TestRunResult,
} from './report-generator.js';
import {
  TOOL_CALLING_SCENARIOS,
  SYSTEM_PROMPT_SCENARIOS,
  MEMORY_SCENARIOS,
} from './scenarios/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface RunnerConfig {
  categories?: string[];
  verbose: boolean;
  slow: boolean; // Extra slow for rate limiting
  maxTests?: number;
  traceTools: boolean;
  generateReport: boolean;
}

function parseArgs(): RunnerConfig {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    slow: args.includes('--slow'),
    traceTools: args.includes('--trace-tools'),
    generateReport: !args.includes('--no-report'),
  };

  const categoryIndex = args.indexOf('--category');
  if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    config.categories = [args[categoryIndex + 1]];
  }

  const maxIndex = args.indexOf('--max');
  if (maxIndex !== -1 && args[maxIndex + 1]) {
    config.maxTests = parseInt(args[maxIndex + 1], 10);
  }

  return config;
}

// ============================================================================
// TOOL STRUCTURE TRACER
// ============================================================================

async function traceToolStructure(): Promise<void> {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    TOOL STRUCTURE ANALYSIS                     ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  // Analyze test harness tools
  console.log('📋 TEST HARNESS TOOLS (what we test with):');
  console.log('─'.repeat(50));

  const categories: Record<string, typeof TEST_TOOL_DEFINITIONS> = {
    Memory: TEST_TOOL_DEFINITIONS.filter(
      (t) => t.name.includes('memory') || t.name.includes('recall') || t.name.includes('remember')
    ),
    Entertainment: TEST_TOOL_DEFINITIONS.filter((t) => t.name.toLowerCase().includes('music')),
    Information: TEST_TOOL_DEFINITIONS.filter(
      (t) => t.name.includes('Weather') || t.name.includes('News') || t.name.includes('search')
    ),
    Handoff: TEST_TOOL_DEFINITIONS.filter((t) => t.name.startsWith('handoff')),
    Session: TEST_TOOL_DEFINITIONS.filter((t) => t.name.includes('Exit')),
  };

  for (const [cat, tools] of Object.entries(categories)) {
    console.log(`\n  ${cat} (${tools.length} tools):`);
    for (const tool of tools) {
      console.log(`    • ${tool.name}`);
      console.log(`      ${tool.description.slice(0, 80)}...`);
    }
  }

  console.log(`\n  Total Test Tools: ${TEST_TOOL_DEFINITIONS.length}`);

  // Compare with production agent inventories
  console.log('\n\n📦 PRODUCTION AGENT TOOL INVENTORIES:');
  console.log('─'.repeat(50));

  const personas = [
    'ferni',
    'maya-santos',
    'alex-chen',
    'peter-john',
    'jordan-taylor',
    'nayan-patel',
  ];

  for (const personaId of personas) {
    try {
      const inventory = await analyzeToolInventory(personaId);
      console.log(formatToolInventory(inventory));
    } catch (error) {
      console.log(`  ⚠️ Could not analyze ${personaId}: ${error}`);
    }
  }

  // Highlight potential issues
  console.log('\n⚠️ POTENTIAL ISSUES TO WATCH:');
  console.log('─'.repeat(50));
  console.log('  1. Tool descriptions in test harness must match production exactly');
  console.log('  2. System prompt size affects context window for tool calling');
  console.log('  3. Too many tools can confuse the model about which to call');
  console.log('  4. Handoff tools need explicit trigger keywords');
  console.log('\n');
}

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestScenario {
  id: string;
  category: string;
  description: string;
  userMessage: string; // The probe/input to send
  expectedTool?: string;
  shouldNotCallTool?: boolean;
  isCritical?: boolean;
  shouldAvoid?: string[];
}

// Helper to normalize different scenario formats
function normalizeScenario(
  scenario: Record<string, unknown>,
  category: string
): TestScenario | null {
  const id = scenario.id as string;
  const description = (scenario.description || scenario.name) as string;
  const userMessage = (scenario.probe || scenario.userMessage || scenario.input) as string;

  if (!userMessage) {
    console.warn(`Scenario ${id} has no probe/userMessage, skipping`);
    return null;
  }

  const expected = scenario.expected as Record<string, unknown> | undefined;

  return {
    id,
    category,
    description,
    userMessage,
    expectedTool: expected?.shouldCallTool as string | undefined,
    shouldNotCallTool: expected?.shouldNotCallTool as boolean | undefined,
    isCritical: (scenario.critical || scenario.severity === 'critical') as boolean | undefined,
    shouldAvoid: expected?.shouldAvoid as string[] | undefined,
  };
}

function getAllScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Tool calling scenarios
  if (TOOL_CALLING_SCENARIOS) {
    for (const scenario of TOOL_CALLING_SCENARIOS) {
      const normalized = normalizeScenario(
        scenario as unknown as Record<string, unknown>,
        'tool_calling'
      );
      if (normalized) scenarios.push(normalized);
    }
  }

  // System prompt scenarios
  if (SYSTEM_PROMPT_SCENARIOS) {
    for (const scenario of SYSTEM_PROMPT_SCENARIOS) {
      const normalized = normalizeScenario(
        scenario as unknown as Record<string, unknown>,
        'system_prompt'
      );
      if (normalized) scenarios.push(normalized);
    }
  }

  // Memory scenarios
  if (MEMORY_SCENARIOS) {
    for (const scenario of MEMORY_SCENARIOS) {
      const normalized = normalizeScenario(
        scenario as unknown as Record<string, unknown>,
        'memory'
      );
      if (normalized) scenarios.push(normalized);
    }
  }

  return scenarios;
}

async function runTests(config: RunnerConfig): Promise<void> {
  const rateLimiter = new RateLimiter({
    maxRequestsPerMinute: config.slow ? 5 : 8,
    minimumDelayMs: config.slow ? 12000 : 8000,
  });

  const reportGenerator = new ReportGenerator();
  reportGenerator.startRun();

  // Initialize harness
  console.log('\n🔧 Initializing Gemini Test Harness...\n');
  const harness = new GeminiTestHarness({
    personaId: 'ferni',
    enableTools: true,
    temperature: 0.8, // 🐛 FIX BUG-006: Match production temperature
    forceFunctionCalling: true,
  });

  await harness.initialize();
  console.log('✅ Harness initialized\n');

  // Get scenarios
  let scenarios = getAllScenarios();

  // Filter by category if specified
  if (config.categories && config.categories.length > 0) {
    scenarios = scenarios.filter((s) => config.categories!.includes(s.category));
  }

  // Limit if specified
  if (config.maxTests) {
    scenarios = scenarios.slice(0, config.maxTests);
  }

  console.log(`\n📝 Running ${scenarios.length} test scenarios...\n`);
  console.log('─'.repeat(60));

  let completed = 0;
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    // Rate limit
    const status = rateLimiter.getStatus();
    if (config.verbose) {
      console.log(
        `  [Rate Limiter] ${status.requestsInWindow}/${status.maxRequests} requests in window`
      );
    }
    await rateLimiter.waitForSlot();

    // Run test
    const startTime = Date.now();
    console.log(`\n🧪 [${completed + 1}/${scenarios.length}] ${scenario.id}`);
    console.log(`   Category: ${scenario.category}`);
    console.log(`   Message: "${scenario.userMessage.slice(0, 50)}..."`);

    try {
      const response = await harness.sendMessage(scenario.userMessage);
      const latencyMs = Date.now() - startTime;

      // Analyze result
      let testPassed = true;
      const antiPatternViolations: string[] = [];

      // Check tool call
      if (scenario.expectedTool) {
        const calledTool = response.toolCalls[0]?.name;
        if (calledTool !== scenario.expectedTool) {
          testPassed = false;
          antiPatternViolations.push(
            `Expected ${scenario.expectedTool}, got ${calledTool || 'none'}`
          );
        }
      }

      // Check should NOT call tool
      if (scenario.shouldNotCallTool && response.toolCalls.length > 0) {
        testPassed = false;
        antiPatternViolations.push(
          `Should not have called any tool, but called ${response.toolCalls[0]?.name}`
        );
      }

      // Check spoke instead of calling
      if (response.spokeInsteadOfCalling && scenario.expectedTool) {
        testPassed = false;
        antiPatternViolations.push('Spoke about action instead of calling tool');
      }

      // Check anti-patterns
      if (scenario.shouldAvoid) {
        const lowerText = response.text.toLowerCase();
        for (const pattern of scenario.shouldAvoid) {
          if (lowerText.includes(pattern.toLowerCase())) {
            testPassed = false;
            antiPatternViolations.push(`Contains forbidden pattern: "${pattern}"`);
          }
        }
      }

      // Log result
      if (testPassed) {
        passed++;
        console.log(`   ✅ PASSED (${latencyMs}ms)`);
        if (response.toolCalls.length > 0) {
          console.log(`   Tool called: ${response.toolCalls.map((t) => t.name).join(', ')}`);
        }
      } else {
        failed++;
        console.log(`   ❌ FAILED (${latencyMs}ms)`);
        for (const violation of antiPatternViolations) {
          console.log(`   └─ ${violation}`);
        }
      }

      if (config.verbose && response.text) {
        console.log(`   Response: "${response.text.slice(0, 100)}..."`);
      }

      // Record result
      reportGenerator.addResult({
        scenarioId: scenario.id,
        category: scenario.category,
        passed: testPassed,
        toolCalled: response.toolCalls[0]?.name,
        expectedTool: scenario.expectedTool,
        spokeInsteadOfCalling: response.spokeInsteadOfCalling,
        responseLength: response.text.length,
        latencyMs,
        antiPatternViolations,
      });
    } catch (error) {
      failed++;
      console.log(`   ❌ ERROR: ${error}`);

      reportGenerator.addResult({
        scenarioId: scenario.id,
        category: scenario.category,
        passed: false,
        spokeInsteadOfCalling: false,
        responseLength: 0,
        latencyMs: Date.now() - startTime,
        error: String(error),
        antiPatternViolations: [],
      });
    }

    completed++;
  }

  // Generate report
  if (config.generateReport) {
    const report = reportGenerator.generateReport();
    console.log(reportGenerator.formatReport(report));

    // Save report to file
    const fs = await import('fs/promises');
    const reportPath = `test-reports/gemini-e2e-${Date.now()}.json`;
    await fs.mkdir('test-reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}\n`);
  }

  // Exit code
  const exitCode = failed > 0 ? 1 : 0;
  console.log(`\nFinal: ${passed} passed, ${failed} failed`);
  process.exit(exitCode);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('              GEMINI E2E SMART TEST RUNNER                      ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
  console.log(`  Verbose: ${config.verbose}`);
  console.log(`  Slow Mode: ${config.slow}`);
  console.log(`  Categories: ${config.categories?.join(', ') || 'all'}`);
  console.log(`  Max Tests: ${config.maxTests || 'unlimited'}`);
  console.log('\n');

  // Trace tools if requested
  if (config.traceTools) {
    await traceToolStructure();
  }

  // Run tests
  await runTests(config);
}

main().catch(console.error);
