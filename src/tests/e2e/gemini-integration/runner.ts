/**
 * Gemini E2E Test Runner
 *
 * A comprehensive test runner that executes all Gemini integration tests
 * and generates detailed reports.
 *
 * Features:
 * - Runs all scenario categories (tools, prompts, memory)
 * - Configurable persona testing
 * - Parallel execution support
 * - Detailed result reporting
 * - CI-friendly output
 *
 * Usage:
 *   npx ts-node src/tests/e2e/gemini-integration/runner.ts
 *   npx ts-node src/tests/e2e/gemini-integration/runner.ts --persona=ferni
 *   npx ts-node src/tests/e2e/gemini-integration/runner.ts --category=tool_calling
 *   npx ts-node src/tests/e2e/gemini-integration/runner.ts --critical-only
 */

import { GeminiTestHarness, type TestScenarioResult } from './harness.js';
import {
  ALL_TOOL_CALLING_SCENARIOS,
  getCriticalScenarios as getToolCritical,
  getScenariosForPersona as getToolForPersona,
  type ToolCallingScenario,
} from './scenarios/tool-calling.scenarios.js';
import {
  ALL_SYSTEM_PROMPT_SCENARIOS,
  getCriticalScenarios as getPromptCritical,
  getScenariosForPersona as getPromptForPersona,
  type SystemPromptScenario,
} from './scenarios/system-prompt.scenarios.js';
import {
  ALL_MEMORY_SCENARIOS,
  getCriticalScenarios as getMemoryCritical,
  getScenariosForPersona as getMemoryForPersona,
  type MemoryScenario,
} from './scenarios/memory.scenarios.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiTestRunner' });

// ============================================================================
// TYPES
// ============================================================================

type AnyScenario = ToolCallingScenario | SystemPromptScenario | MemoryScenario;

export interface RunnerConfig {
  /** Specific personas to test (empty = all) */
  personas?: string[];
  /** Categories to test */
  categories?: Array<'tool_calling' | 'system_prompt' | 'memory'>;
  /** Only run critical severity tests */
  criticalOnly?: boolean;
  /** Stop on first failure */
  failFast?: boolean;
  /** Parallel execution (limited by API rate limits) */
  parallel?: boolean;
  /** Output format */
  outputFormat?: 'console' | 'json' | 'junit';
  /** Verbose logging */
  verbose?: boolean;
  /** Custom temperature for testing */
  temperature?: number;
}

export interface RunnerResult {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    criticalFailures: number;
    duration: number;
  };
  byCategory: Record<
    string,
    {
      total: number;
      passed: number;
      failed: number;
    }
  >;
  byPersona: Record<
    string,
    {
      total: number;
      passed: number;
      failed: number;
    }
  >;
  failures: Array<{
    scenarioId: string;
    personaId: string;
    category: string;
    probe: string;
    expectedTool?: string;
    actualResponse: string;
    toolsCalled: string[];
    antiPatternViolations: string[];
    severity: string;
  }>;
  warnings: string[];
}

// ============================================================================
// SCENARIO FILTERING
// ============================================================================

function getToolCallingScenarios(config: RunnerConfig): ToolCallingScenario[] {
  let scenarios = ALL_TOOL_CALLING_SCENARIOS;

  if (config.criticalOnly) {
    scenarios = getToolCritical();
  }

  if (config.personas && config.personas.length > 0) {
    scenarios = scenarios.filter(
      (s) =>
        s.applicablePersonas.length === 0 ||
        s.applicablePersonas.some((p) => config.personas!.includes(p))
    );
  }

  return scenarios;
}

function getSystemPromptScenarios(config: RunnerConfig): SystemPromptScenario[] {
  let scenarios = ALL_SYSTEM_PROMPT_SCENARIOS;

  if (config.criticalOnly) {
    scenarios = getPromptCritical();
  }

  if (config.personas && config.personas.length > 0) {
    scenarios = scenarios.filter((s) => config.personas!.includes(s.personaId));
  }

  return scenarios;
}

function getMemoryScenarios(config: RunnerConfig): MemoryScenario[] {
  let scenarios = ALL_MEMORY_SCENARIOS;

  if (config.criticalOnly) {
    scenarios = getMemoryCritical();
  }

  if (config.personas && config.personas.length > 0) {
    scenarios = scenarios.filter((s) => config.personas!.includes(s.personaId));
  }

  return scenarios;
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function runToolCallingScenario(
  scenario: ToolCallingScenario,
  config: RunnerConfig
): Promise<TestScenarioResult> {
  const personaId = scenario.applicablePersonas[0] || 'ferni';

  const harness = new GeminiTestHarness({
    personaId,
    enableTools: true,
    temperature: config.temperature ?? 0.2,
  });

  await harness.initialize();

  return await harness.runScenario(scenario.id, scenario.probe, scenario.expected);
}

async function runSystemPromptScenario(
  scenario: SystemPromptScenario,
  config: RunnerConfig
): Promise<TestScenarioResult> {
  const harness = new GeminiTestHarness({
    personaId: scenario.personaId,
    enableTools: false, // System prompt tests focus on response content
    temperature: config.temperature ?? 0.8, // 🐛 FIX BUG-006: Match production temperature
    conversationHistory: scenario.setup?.conversationHistory?.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
  });

  await harness.initialize();

  return await harness.runScenario(scenario.id, scenario.probe, scenario.expected);
}

async function runMemoryScenario(
  scenario: MemoryScenario,
  config: RunnerConfig
): Promise<TestScenarioResult> {
  const harness = new GeminiTestHarness({
    personaId: scenario.personaId,
    enableTools: true,
    temperature: config.temperature ?? 0.2,
    userProfile: scenario.userProfile,
    conversationHistory: scenario.conversationHistory,
  });

  await harness.initialize();

  return await harness.runScenario(scenario.id, scenario.probe, scenario.expected);
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

export async function runAllTests(config: RunnerConfig = {}): Promise<RunnerResult> {
  const startTime = Date.now();
  const categories = config.categories || ['tool_calling', 'system_prompt', 'memory'];

  const result: RunnerResult = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      criticalFailures: 0,
      duration: 0,
    },
    byCategory: {},
    byPersona: {},
    failures: [],
    warnings: [],
  };

  // Check for API key
  if (!process.env.GOOGLE_API_KEY) {
    result.warnings.push('GOOGLE_API_KEY not set - tests will be skipped');
    result.summary.skipped = 1;
    return result;
  }

  console.log('\n🧪 GEMINI E2E INTEGRATION TESTS\n');
  console.log(`Configuration:`);
  console.log(`  Personas: ${config.personas?.join(', ') || 'all'}`);
  console.log(`  Categories: ${categories.join(', ')}`);
  console.log(`  Critical only: ${config.criticalOnly || false}`);
  console.log(`  Temperature: ${config.temperature || 0.2}`);
  console.log('');

  // Run tool calling tests
  if (categories.includes('tool_calling')) {
    const scenarios = getToolCallingScenarios(config);
    console.log(`\n📦 TOOL CALLING TESTS (${scenarios.length} scenarios)\n`);

    result.byCategory['tool_calling'] = { total: scenarios.length, passed: 0, failed: 0 };

    for (const scenario of scenarios) {
      try {
        if (config.verbose) {
          console.log(`  Running: ${scenario.id}`);
        }

        const testResult = await runToolCallingScenario(scenario, config);
        result.summary.total++;

        const personaId = scenario.applicablePersonas[0] || 'ferni';
        if (!result.byPersona[personaId]) {
          result.byPersona[personaId] = { total: 0, passed: 0, failed: 0 };
        }
        result.byPersona[personaId].total++;

        if (testResult.passed) {
          result.summary.passed++;
          result.byCategory['tool_calling'].passed++;
          result.byPersona[personaId].passed++;
          console.log(`  ✅ ${scenario.id}`);
        } else {
          result.summary.failed++;
          result.byCategory['tool_calling'].failed++;
          result.byPersona[personaId].failed++;

          if (scenario.severity === 'critical') {
            result.summary.criticalFailures++;
          }

          result.failures.push({
            scenarioId: scenario.id,
            personaId,
            category: 'tool_calling',
            probe: scenario.probe,
            expectedTool: scenario.expected.shouldCallTool,
            actualResponse: testResult.response.text,
            toolsCalled: testResult.response.toolCalls.map((tc) => tc.name),
            antiPatternViolations: testResult.analysis.antiPatternViolations,
            severity: scenario.severity,
          });

          console.log(`  ❌ ${scenario.id}`);
          if (config.verbose) {
            console.log(`     Expected tool: ${scenario.expected.shouldCallTool}`);
            console.log(
              `     Called: ${testResult.response.toolCalls.map((tc) => tc.name).join(', ') || 'none'}`
            );
            console.log(`     Response: ${testResult.response.text.slice(0, 100)}...`);
          }

          if (config.failFast) {
            console.log('\n⚠️ Stopping on first failure (--fail-fast)\n');
            break;
          }
        }

        // Rate limit delay
        await new Promise<void>((resolve) => { setTimeout(resolve, 500); });
      } catch (error) {
        console.log(`  ⚠️ ${scenario.id} - Error: ${String(error)}`);
        result.warnings.push(`${scenario.id}: ${String(error)}`);
      }
    }
  }

  // Run system prompt tests
  if (categories.includes('system_prompt') && !config.failFast) {
    const scenarios = getSystemPromptScenarios(config);
    console.log(`\n📝 SYSTEM PROMPT TESTS (${scenarios.length} scenarios)\n`);

    result.byCategory['system_prompt'] = { total: scenarios.length, passed: 0, failed: 0 };

    for (const scenario of scenarios) {
      try {
        if (config.verbose) {
          console.log(`  Running: ${scenario.id}`);
        }

        const testResult = await runSystemPromptScenario(scenario, config);
        result.summary.total++;

        if (!result.byPersona[scenario.personaId]) {
          result.byPersona[scenario.personaId] = { total: 0, passed: 0, failed: 0 };
        }
        result.byPersona[scenario.personaId].total++;

        if (testResult.passed) {
          result.summary.passed++;
          result.byCategory['system_prompt'].passed++;
          result.byPersona[scenario.personaId].passed++;
          console.log(`  ✅ ${scenario.id}`);
        } else {
          result.summary.failed++;
          result.byCategory['system_prompt'].failed++;
          result.byPersona[scenario.personaId].failed++;

          if (scenario.severity === 'critical') {
            result.summary.criticalFailures++;
          }

          result.failures.push({
            scenarioId: scenario.id,
            personaId: scenario.personaId,
            category: 'system_prompt',
            probe: scenario.probe,
            actualResponse: testResult.response.text,
            toolsCalled: [],
            antiPatternViolations: testResult.analysis.antiPatternViolations,
            severity: scenario.severity,
          });

          console.log(`  ❌ ${scenario.id}`);
          if (config.verbose) {
            console.log(`     Violations: ${testResult.analysis.antiPatternViolations.join(', ')}`);
            console.log(`     Response: ${testResult.response.text.slice(0, 100)}...`);
          }

          if (config.failFast) {
            console.log('\n⚠️ Stopping on first failure (--fail-fast)\n');
            break;
          }
        }

        await new Promise<void>((resolve) => { setTimeout(resolve, 500); });
      } catch (error) {
        console.log(`  ⚠️ ${scenario.id} - Error: ${String(error)}`);
        result.warnings.push(`${scenario.id}: ${String(error)}`);
      }
    }
  }

  // Run memory tests
  if (categories.includes('memory') && !config.failFast) {
    const scenarios = getMemoryScenarios(config);
    console.log(`\n🧠 MEMORY TESTS (${scenarios.length} scenarios)\n`);

    result.byCategory['memory'] = { total: scenarios.length, passed: 0, failed: 0 };

    for (const scenario of scenarios) {
      try {
        if (config.verbose) {
          console.log(`  Running: ${scenario.id}`);
        }

        const testResult = await runMemoryScenario(scenario, config);
        result.summary.total++;

        if (!result.byPersona[scenario.personaId]) {
          result.byPersona[scenario.personaId] = { total: 0, passed: 0, failed: 0 };
        }
        result.byPersona[scenario.personaId].total++;

        if (testResult.passed) {
          result.summary.passed++;
          result.byCategory['memory'].passed++;
          result.byPersona[scenario.personaId].passed++;
          console.log(`  ✅ ${scenario.id}`);
        } else {
          result.summary.failed++;
          result.byCategory['memory'].failed++;
          result.byPersona[scenario.personaId].failed++;

          if (scenario.severity === 'critical') {
            result.summary.criticalFailures++;
          }

          result.failures.push({
            scenarioId: scenario.id,
            personaId: scenario.personaId,
            category: 'memory',
            probe: scenario.probe,
            expectedTool: scenario.expected.shouldCallTool,
            actualResponse: testResult.response.text,
            toolsCalled: testResult.response.toolCalls.map((tc) => tc.name),
            antiPatternViolations: testResult.analysis.antiPatternViolations,
            severity: scenario.severity,
          });

          console.log(`  ❌ ${scenario.id}`);
          if (config.verbose) {
            console.log(`     Response: ${testResult.response.text.slice(0, 100)}...`);
          }

          if (config.failFast) {
            console.log('\n⚠️ Stopping on first failure (--fail-fast)\n');
            break;
          }
        }

        await new Promise<void>((resolve) => { setTimeout(resolve, 500); });
      } catch (error) {
        console.log(`  ⚠️ ${scenario.id} - Error: ${String(error)}`);
        result.warnings.push(`${scenario.id}: ${String(error)}`);
      }
    }
  }

  // Calculate final stats
  result.summary.duration = Date.now() - startTime;
  result.summary.passRate =
    result.summary.total > 0 ? (result.summary.passed / result.summary.total) * 100 : 0;

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  console.log(`  Total:    ${result.summary.total}`);
  console.log(`  Passed:   ${result.summary.passed} ✅`);
  console.log(`  Failed:   ${result.summary.failed} ❌`);
  console.log(`  Skipped:  ${result.summary.skipped}`);
  console.log(`  Pass Rate: ${result.summary.passRate.toFixed(1)}%`);
  console.log(`  Duration: ${(result.summary.duration / 1000).toFixed(1)}s`);

  if (result.summary.criticalFailures > 0) {
    console.log(`\n  ⚠️ CRITICAL FAILURES: ${result.summary.criticalFailures}`);
  }

  // Print category breakdown
  console.log('\n📂 By Category:');
  for (const [category, stats] of Object.entries(result.byCategory)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0';
    console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // Print persona breakdown
  console.log('\n👤 By Persona:');
  for (const [persona, stats] of Object.entries(result.byPersona)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0';
    console.log(`  ${persona}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // Print critical failures
  if (result.failures.length > 0) {
    console.log('\n❌ FAILURES:');
    for (const failure of result.failures) {
      const severityBadge =
        failure.severity === 'critical' ? '🔴' : failure.severity === 'high' ? '🟠' : '🟡';
      console.log(`\n  ${severityBadge} ${failure.scenarioId} (${failure.category})`);
      console.log(`     Probe: "${failure.probe}"`);
      if (failure.expectedTool) {
        console.log(`     Expected tool: ${failure.expectedTool}`);
        console.log(
          `     Called: ${failure.toolsCalled.length > 0 ? failure.toolsCalled.join(', ') : 'none'}`
        );
      }
      if (failure.antiPatternViolations.length > 0) {
        console.log(`     Violations: ${failure.antiPatternViolations.join(', ')}`);
      }
      console.log(`     Response: "${failure.actualResponse.slice(0, 150)}..."`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  return result;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    criticalOnly: args.includes('--critical-only'),
    failFast: args.includes('--fail-fast'),
  };

  // Parse persona filter
  const personaArg = args.find((a) => a.startsWith('--persona='));
  if (personaArg) {
    config.personas = personaArg.split('=')[1].split(',');
  }

  // Parse category filter
  const categoryArg = args.find((a) => a.startsWith('--category='));
  if (categoryArg) {
    const cats = categoryArg.split('=')[1].split(',') as Array<
      'tool_calling' | 'system_prompt' | 'memory'
    >;
    config.categories = cats;
  }

  // Parse temperature
  const tempArg = args.find((a) => a.startsWith('--temperature='));
  if (tempArg) {
    config.temperature = parseFloat(tempArg.split('=')[1]);
  }

  // Parse output format
  if (args.includes('--json')) {
    config.outputFormat = 'json';
  }

  const result = await runAllTests(config);

  if (config.outputFormat === 'json') {
    console.log(JSON.stringify(result, null, 2));
  }

  // Exit with error code if critical failures
  if (result.summary.criticalFailures > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default runAllTests;
