/**
 * Vibe Test Runner
 *
 * Executes vibe/home automation test scenarios and validates results.
 * Supports both unit test integration (via Vitest) and standalone execution.
 */

import type {
  VibeTestScenario,
  VibeTestResult,
  ExpectedOutcome,
} from '../scenarios/vibe-scenarios.js';
import {
  ALL_VIBE_SCENARIOS,
  getScenarioSummary,
  mapVoiceCommandToVibe,
} from '../scenarios/vibe-scenarios.js';
import {
  MockSmartHome,
  MOCK_VIBE_PRESETS,
  type VibeActivationResult,
  type VibePresetConfig,
} from '../mocks/mock-smart-home.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TestRunConfig {
  scenarios?: VibeTestScenario[];
  parallel?: boolean;
  timeout?: number;
  verbose?: boolean;
  onProgress?: (completed: number, total: number, current: string) => void;
  onComplete?: (results: TestRunSummary) => void;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: VibeTestResult[];
  byCategory: Record<string, { passed: number; failed: number }>;
  byOutcome: Record<string, { passed: number; failed: number }>;
}

// ============================================================================
// TEST RUNNER CLASS
// ============================================================================

export class VibeTestRunner {
  private config: Required<TestRunConfig>;
  private results: VibeTestResult[] = [];

  constructor(config: TestRunConfig = {}) {
    this.config = {
      scenarios: config.scenarios || ALL_VIBE_SCENARIOS,
      parallel: config.parallel ?? false,
      timeout: config.timeout ?? 30000,
      verbose: config.verbose ?? false,
      onProgress: config.onProgress || (() => {}),
      onComplete: config.onComplete || (() => {}),
    };
  }

  /**
   * Run all configured scenarios
   */
  async runAll(): Promise<TestRunSummary> {
    const startTime = Date.now();
    this.results = [];

    if (this.config.parallel) {
      await this.runParallel();
    } else {
      await this.runSequential();
    }

    const summary = this.generateSummary(Date.now() - startTime);
    this.config.onComplete(summary);
    return summary;
  }

  /**
   * Run a single scenario by ID
   */
  async runScenario(scenarioId: string): Promise<VibeTestResult | null> {
    const scenario = this.config.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      return null;
    }

    return this.executeScenario(scenario);
  }

  /**
   * Run scenarios by category
   */
  async runByCategory(
    category: VibeTestScenario['category']
  ): Promise<TestRunSummary> {
    const scenarios = this.config.scenarios.filter((s) => s.category === category);
    const runner = new VibeTestRunner({ ...this.config, scenarios });
    return runner.runAll();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async runSequential(): Promise<void> {
    const { scenarios, onProgress } = this.config;

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      onProgress(i, scenarios.length, scenario.name);

      try {
        const result = await this.executeScenario(scenario);
        this.results.push(result);
      } catch (error) {
        this.results.push(this.createErrorResult(scenario, error));
      }
    }

    onProgress(scenarios.length, scenarios.length, 'Complete');
  }

  private async runParallel(): Promise<void> {
    const { scenarios, onProgress } = this.config;
    let completed = 0;

    const promises = scenarios.map(async (scenario) => {
      try {
        const result = await this.executeScenario(scenario);
        completed++;
        onProgress(completed, scenarios.length, scenario.name);
        return result;
      } catch (error) {
        completed++;
        onProgress(completed, scenarios.length, scenario.name);
        return this.createErrorResult(scenario, error);
      }
    });

    this.results = await Promise.all(promises);
  }

  private async executeScenario(scenario: VibeTestScenario): Promise<VibeTestResult> {
    const startTime = Date.now();

    // Create mock smart home
    const mockHome = new MockSmartHome(scenario.mockHome);

    // Determine vibe preset to use
    let vibePresetId: string | null = scenario.vibePreset || null;

    // If voice command, map to vibe
    if (scenario.voiceCommand) {
      vibePresetId = mapVoiceCommandToVibe(scenario.voiceCommand);
    }

    // Get the preset config
    const presetConfig = vibePresetId ? MOCK_VIBE_PRESETS[vibePresetId] : null;

    // Execute the vibe activation
    let activationResult: VibeActivationResult;

    if (presetConfig) {
      activationResult = await mockHome.activateVibe(presetConfig);
    } else if (vibePresetId) {
      // Unknown preset
      activationResult = {
        success: false,
        preset: vibePresetId,
        applied: { music: false, lights: false, temperature: false },
        deviceResults: [],
        errors: [`Unknown preset: ${vibePresetId}`],
        message: `I don't know a vibe called "${vibePresetId}".`,
      };
    } else {
      // No vibe identified
      activationResult = {
        success: false,
        preset: 'none',
        applied: { music: false, lights: false, temperature: false },
        deviceResults: [],
        errors: ['No vibe preset identified'],
        message: 'Could not determine which vibe to set.',
      };
    }

    // Determine actual outcome
    const actualOutcome = this.determineOutcome(activationResult, scenario);

    // Run assertions
    const assertionResults = this.runAssertions(scenario, {
      scenario,
      passed: actualOutcome === scenario.expectedOutcome,
      outcome: actualOutcome,
      duration: Date.now() - startTime,
      appliedState: {
        lightsSet: activationResult.applied.lights,
        temperatureSet: activationResult.applied.temperature,
        musicSet: activationResult.applied.music,
        lightBrightness: presetConfig?.lights?.brightness,
        targetTemperature: presetConfig?.temperature?.target,
      },
      deviceResults: activationResult.deviceResults,
      assertions: [],
      error: activationResult.success ? undefined : activationResult.errors[0],
    });

    // Build final result
    const result: VibeTestResult = {
      scenario,
      passed:
        actualOutcome === scenario.expectedOutcome &&
        assertionResults.every((a) => a.passed),
      outcome: actualOutcome,
      duration: Date.now() - startTime,
      appliedState: {
        lightsSet: activationResult.applied.lights,
        temperatureSet: activationResult.applied.temperature,
        musicSet: activationResult.applied.music,
        lightBrightness: presetConfig?.lights?.brightness,
        targetTemperature: presetConfig?.temperature?.target,
      },
      deviceResults: activationResult.deviceResults,
      assertions: assertionResults,
      error: activationResult.success ? undefined : activationResult.errors[0],
    };

    if (this.config.verbose) {
      this.logResult(result);
    }

    return result;
  }

  private determineOutcome(
    result: VibeActivationResult,
    scenario: VibeTestScenario
  ): ExpectedOutcome {
    const { applied, deviceResults, success } = result;

    // No devices configured
    if (deviceResults.length === 0 && !applied.lights && !applied.temperature) {
      if (applied.music) {
        return 'no_devices'; // Music works, but no smart home
      }
      return 'activation_failed';
    }

    // Full success
    if (success && applied.lights && applied.temperature && applied.music) {
      return 'vibe_activated';
    }

    // Lights only
    if (applied.lights && !applied.temperature) {
      return 'lights_only';
    }

    // Temperature only
    if (!applied.lights && applied.temperature) {
      return 'temperature_only';
    }

    // Partial success
    if (applied.lights || applied.temperature || applied.music) {
      // Check if any device failed
      const hasFailures = deviceResults.some((d) => !d.success);
      if (hasFailures) {
        return 'partial_activation';
      }
      return 'graceful_degradation';
    }

    // Full failure
    return 'activation_failed';
  }

  private runAssertions(
    scenario: VibeTestScenario,
    result: VibeTestResult
  ): Array<{ description: string; passed: boolean; details?: string }> {
    if (!scenario.assertions) {
      return [];
    }

    return scenario.assertions.map((assertion) => {
      try {
        const passed = assertion.check(result);
        return {
          description: assertion.description,
          passed,
          details: passed ? undefined : 'Assertion returned false',
        };
      } catch (error) {
        return {
          description: assertion.description,
          passed: false,
          details: error instanceof Error ? error.message : 'Assertion threw error',
        };
      }
    });
  }

  private createErrorResult(scenario: VibeTestScenario, error: unknown): VibeTestResult {
    return {
      scenario,
      passed: false,
      outcome: 'activation_failed',
      duration: 0,
      appliedState: {
        lightsSet: false,
        temperatureSet: false,
        musicSet: false,
      },
      deviceResults: [],
      assertions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  private generateSummary(duration: number): TestRunSummary {
    const summary: TestRunSummary = {
      total: this.results.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration,
      results: this.results,
      byCategory: {},
      byOutcome: {},
    };

    for (const result of this.results) {
      // Count pass/fail
      if (result.passed) {
        summary.passed++;
      } else {
        summary.failed++;
      }

      // By category
      const category = result.scenario.category;
      if (!summary.byCategory[category]) {
        summary.byCategory[category] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        summary.byCategory[category].passed++;
      } else {
        summary.byCategory[category].failed++;
      }

      // By outcome
      const outcome = result.outcome;
      if (!summary.byOutcome[outcome]) {
        summary.byOutcome[outcome] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        summary.byOutcome[outcome].passed++;
      } else {
        summary.byOutcome[outcome].failed++;
      }
    }

    return summary;
  }

  private logResult(result: VibeTestResult): void {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.scenario.name} (${result.duration}ms)`);

    if (!result.passed) {
      console.log(`   Expected: ${result.scenario.expectedOutcome}`);
      console.log(`   Actual: ${result.outcome}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.assertions.some((a) => !a.passed)) {
        console.log('   Failed assertions:');
        result.assertions
          .filter((a) => !a.passed)
          .forEach((a) => {
            console.log(`     - ${a.description}: ${a.details}`);
          });
      }
    }
  }
}

// ============================================================================
// STANDALONE RUNNER
// ============================================================================

export async function runVibeTests(
  options: { category?: string; verbose?: boolean; parallel?: boolean } = {}
): Promise<void> {
  console.log('\n🏠 Vibe & Home Automation Test Suite\n');
  console.log('=' .repeat(50) + '\n');

  const summary = getScenarioSummary();
  console.log(`Total Scenarios: ${summary.total}`);
  console.log('By Category:');
  Object.entries(summary.byCategory).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
  console.log('\n');

  // Filter by category if specified
  let scenarios = ALL_VIBE_SCENARIOS;
  if (options.category) {
    scenarios = scenarios.filter((s) => s.category === options.category);
    console.log(`Filtered to ${scenarios.length} scenarios in category: ${options.category}\n`);
  }

  // Run tests
  const runner = new VibeTestRunner({
    scenarios,
    verbose: options.verbose ?? true,
    parallel: options.parallel ?? false,
    onProgress: (completed, total, current) => {
      if (!options.verbose) {
        process.stdout.write(`\rRunning: ${completed}/${total} - ${current}`.padEnd(60));
      }
    },
  });

  const results = await runner.runAll();

  // Print summary
  console.log('\n' + '=' .repeat(50));
  console.log('\n📊 Test Results\n');
  console.log(`Total: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);
  console.log(`Duration: ${results.duration}ms`);
  console.log(`Pass Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  console.log('\nBy Category:');
  Object.entries(results.byCategory).forEach(([cat, stats]) => {
    const rate = ((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(1);
    console.log(`  ${cat}: ${stats.passed}/${stats.passed + stats.failed} (${rate}%)`);
  });

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.scenario.id}: ${r.scenario.name}`);
        console.log(`    Expected: ${r.scenario.expectedOutcome}, Got: ${r.outcome}`);
        if (r.error) {
          console.log(`    Error: ${r.error}`);
        }
      });
  }

  console.log('\n');
}

// ============================================================================
// VITEST INTEGRATION
// ============================================================================

/**
 * Create Vitest test cases from scenarios
 */
export function createVitestCases(scenarios: VibeTestScenario[] = ALL_VIBE_SCENARIOS) {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    category: scenario.category,
    timeout: scenario.timeout,
    run: async () => {
      const runner = new VibeTestRunner({ scenarios: [scenario], verbose: false });
      const result = await runner.runScenario(scenario.id);

      if (!result) {
        throw new Error(`Scenario not found: ${scenario.id}`);
      }

      if (!result.passed) {
        const msg = [
          `Expected outcome: ${scenario.expectedOutcome}`,
          `Actual outcome: ${result.outcome}`,
          result.error ? `Error: ${result.error}` : '',
          result.assertions
            .filter((a) => !a.passed)
            .map((a) => `Assertion failed: ${a.description}`)
            .join('\n'),
        ]
          .filter(Boolean)
          .join('\n');

        throw new Error(msg);
      }

      return result;
    },
  }));
}

// Export for CLI usage
export { ALL_VIBE_SCENARIOS, getScenarioSummary };
