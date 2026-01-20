/**
 * E2E Test Harness
 *
 * Core test runner that orchestrates E2E validation:
 * 1. Creates test context
 * 2. Executes test cases
 * 3. Validates API response, storage, and insights
 * 4. Cleans up test data
 * 5. Generates report
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  createTestContext,
  generateTestUserId,
} from './context-factory.js';
import { validateApiResponse } from './validators/api-validator.js';
import { validateStorage } from './validators/storage-validator.js';
import { validateInsight } from './validators/insight-validator.js';
import { cleanupTestUser, withCleanup } from './cleanup.js';
import type {
  E2ETestCase,
  E2EResult,
  E2ERunConfig,
  E2ERunSummary,
  E2ETestContext,
  E2ETestCategory,
  CategorySummary,
  ApiFixture,
  ToolFixture,
} from './types.js';

const log = createLogger({ module: 'e2e-test-harness' });

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<E2ERunConfig> = {
  testUserId: '',
  categories: ['tool', 'api', 'command', 'setting', 'integration'],
  testIds: [],
  tags: [],
  concurrency: 5,
  timeout: 30000,
  failFast: false,
  skipCleanup: false,
  reportFormat: 'console',
  verbose: false,
  apiBaseUrl: 'http://localhost:3002',
};

const COVERAGE_THRESHOLD = 80;

// ============================================================================
// Test Runner
// ============================================================================

/**
 * Run a single E2E test case.
 */
export async function runTest(
  testCase: E2ETestCase,
  ctx: E2ETestContext
): Promise<E2EResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let apiCalled = false;
  let dataStored = false;
  let insightCreated = false;
  let rawResponse: unknown;

  ctx.log.info(`Running test: ${testCase.name}`);

  try {
    // Skip if marked
    if (testCase.skip) {
      return {
        testId: testCase.id,
        testName: testCase.name,
        category: testCase.category,
        passed: true,
        status: 'skipped',
        apiCalled: false,
        dataStored: false,
        insightCreated: false,
        errors: [],
        warnings: testCase.skipReason ? [testCase.skipReason] : [],
        duration: 0,
        startedAt: startTime,
        completedAt: Date.now(),
      };
    }

    // Execute based on category
    switch (testCase.category) {
      case 'api': {
        const apiTest = testCase as ApiFixture;
        const apiResult = await validateApiResponse(
          ctx,
          {
            method: apiTest.method,
            path: apiTest.path,
            body: apiTest.body,
            headers: apiTest.headers,
            timeout: testCase.timeout,
          },
          testCase.expectedApiResponse
        );
        apiCalled = apiResult.statusCode > 0;
        rawResponse = apiResult.body;
        errors.push(...apiResult.errors);
        break;
      }

      case 'tool': {
        const toolTest = testCase as ToolFixture;
        // Tools are executed via API endpoint
        const toolResult = await validateApiResponse(
          ctx,
          {
            method: 'POST',
            path: '/api/e2e/execute-tool',
            body: {
              toolId: toolTest.toolId,
              params: testCase.testParams,
              userId: ctx.userId,
            },
            timeout: testCase.timeout,
          },
          { statusCode: 200, isJson: true }
        );
        apiCalled = toolResult.statusCode > 0;
        rawResponse = toolResult.body;
        if (!toolResult.passed) {
          errors.push(...toolResult.errors);
        }
        break;
      }

      case 'command': {
        // Commands are executed via API endpoint
        const cmdResult = await validateApiResponse(
          ctx,
          {
            method: 'POST',
            path: '/api/e2e/execute-command',
            body: {
              ...testCase.testParams,
              userId: ctx.userId,
            },
            timeout: testCase.timeout,
          },
          { statusCode: 200, isJson: true }
        );
        apiCalled = cmdResult.statusCode > 0;
        rawResponse = cmdResult.body;
        if (!cmdResult.passed) {
          errors.push(...cmdResult.errors);
        }
        break;
      }

      case 'setting': {
        // Settings are get/set via API
        const setResult = await validateApiResponse(
          ctx,
          {
            method: 'PUT',
            path: '/api/user/settings',
            body: testCase.testParams,
            timeout: testCase.timeout,
          },
          { statusCode: 200, isJson: true }
        );
        apiCalled = setResult.statusCode > 0;
        rawResponse = setResult.body;
        if (!setResult.passed) {
          errors.push(...setResult.errors);
        }
        break;
      }

      case 'integration': {
        // Integrations test their status endpoint
        const intResult = await validateApiResponse(
          ctx,
          {
            method: 'GET',
            path: `/api/integrations/${(testCase.testParams as { integrationName?: string }).integrationName || 'unknown'}/status`,
            timeout: testCase.timeout,
          },
          { statusCode: 200, isJson: true }
        );
        apiCalled = intResult.statusCode > 0;
        rawResponse = intResult.body;
        if (!intResult.passed) {
          errors.push(...intResult.errors);
        }
        break;
      }
    }

    // Validate storage if expected
    if (testCase.expectedStorage && testCase.expectedStorage.length > 0) {
      const storageResults = await validateStorage(ctx, testCase.expectedStorage);
      dataStored = storageResults.every((r) => r.passed);

      for (const result of storageResults) {
        if (!result.passed) {
          errors.push(...result.errors);
        }
      }
    } else {
      // No storage expectation - mark as passed
      dataStored = true;
    }

    // Validate insights if expected
    if (testCase.expectedInsight) {
      const insightResult = await validateInsight(ctx, testCase.expectedInsight);
      insightCreated = insightResult.passed;

      if (!insightResult.passed) {
        errors.push(...insightResult.errors);
      }
    } else {
      // No insight expectation - mark as passed
      insightCreated = true;
    }

    // Run custom cleanup if provided
    if (testCase.cleanup) {
      try {
        await testCase.cleanup();
      } catch (cleanupError) {
        const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        warnings.push(`Custom cleanup failed: ${msg}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Test execution error: ${errorMessage}`);
    ctx.log.error('Test execution failed', { testId: testCase.id, error: errorMessage });
  }

  const passed = errors.length === 0;
  const duration = Date.now() - startTime;

  ctx.log.info(`Test ${passed ? 'PASSED' : 'FAILED'}: ${testCase.name}`, {
    duration,
    errors: errors.length,
  });

  return {
    testId: testCase.id,
    testName: testCase.name,
    category: testCase.category,
    passed,
    status: passed ? 'passed' : 'failed',
    apiCalled,
    dataStored,
    insightCreated,
    errors,
    warnings,
    duration,
    startedAt: startTime,
    completedAt: Date.now(),
    rawResponse,
  };
}

// ============================================================================
// Batch Runner
// ============================================================================

/**
 * Run multiple tests with concurrency control.
 */
export async function runTests(
  tests: E2ETestCase[],
  config: E2ERunConfig = {}
): Promise<E2ERunSummary> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const testUserId = mergedConfig.testUserId || generateTestUserId();

  log.info('Starting E2E test run', {
    totalTests: tests.length,
    concurrency: mergedConfig.concurrency,
    testUserId: testUserId.substring(0, 20) + '...',
  });

  // Create shared context
  const ctx = createTestContext('e2e-run', {
    ...mergedConfig,
    testUserId,
  });

  if (!ctx) {
    throw new Error('Failed to create test context - Firestore unavailable');
  }

  const results: E2EResult[] = [];

  // Filter tests
  let filteredTests = tests;

  if (mergedConfig.categories.length > 0) {
    filteredTests = filteredTests.filter((t) =>
      mergedConfig.categories.includes(t.category)
    );
  }

  if (mergedConfig.testIds.length > 0) {
    filteredTests = filteredTests.filter((t) =>
      mergedConfig.testIds.includes(t.id)
    );
  }

  if (mergedConfig.tags.length > 0) {
    filteredTests = filteredTests.filter((t) =>
      t.tags?.some((tag) => mergedConfig.tags.includes(tag))
    );
  }

  // Filter out incomplete fixtures unless verbose
  if (!mergedConfig.verbose) {
    filteredTests = filteredTests.filter((t) => !t.incomplete);
  }

  // Run tests with concurrency
  const batches = chunk(filteredTests, mergedConfig.concurrency);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((test) =>
        withCleanup(
          ctx,
          async () => runTest(test, ctx),
          true // Don't cleanup between tests, cleanup at end
        )
      )
    );

    results.push(...batchResults);

    // Check for fail fast
    if (mergedConfig.failFast && batchResults.some((r) => !r.passed)) {
      log.warn('Fail fast triggered - stopping test run');
      break;
    }
  }

  // Cleanup test user
  if (!mergedConfig.skipCleanup) {
    try {
      await cleanupTestUser(ctx);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn({ error: errorMessage }, 'Cleanup failed');
    }
  }

  // Calculate summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const coverage = ((passed / (results.length - skipped)) * 100) || 0;

  // Calculate by category
  const byCategory: Record<E2ETestCategory, CategorySummary> = {
    tool: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0 },
    api: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0 },
    command: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0 },
    setting: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0 },
    integration: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0 },
  };

  for (const result of results) {
    const cat = byCategory[result.category];
    cat.total++;
    if (result.status === 'passed') cat.passed++;
    else if (result.status === 'failed') cat.failed++;
    else if (result.status === 'skipped') cat.skipped++;
  }

  // Calculate coverage per category
  for (const cat of Object.values(byCategory)) {
    const effective = cat.total - cat.skipped;
    cat.coverage = effective > 0 ? (cat.passed / effective) * 100 : 0;
  }

  const summary: E2ERunSummary = {
    total: results.length,
    passed,
    failed,
    skipped,
    coverage,
    duration: Date.now() - startTime,
    byCategory,
    testUserId,
    startedAt: startTime,
    completedAt: Date.now(),
    results,
    failedTests: results.filter((r) => !r.passed).map((r) => r.testId),
    runPassed: coverage >= COVERAGE_THRESHOLD,
    coverageThreshold: COVERAGE_THRESHOLD,
  };

  // Log summary
  log.info('E2E test run complete', {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    coverage: summary.coverage.toFixed(1) + '%',
    duration: summary.duration + 'ms',
  });

  return summary;
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Format summary for console output.
 */
export function formatSummaryForConsole(summary: E2ERunSummary): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('                    E2E TEST RESULTS                        ');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  // Overall stats
  lines.push(`  Total:    ${summary.total}`);
  lines.push(`  Passed:   ${summary.passed} ✓`);
  lines.push(`  Failed:   ${summary.failed} ✗`);
  lines.push(`  Skipped:  ${summary.skipped} ⊘`);
  lines.push(`  Coverage: ${summary.coverage.toFixed(1)}%`);
  lines.push(`  Duration: ${(summary.duration / 1000).toFixed(1)}s`);
  lines.push('');

  // By category
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('  By Category:');
  for (const [category, stats] of Object.entries(summary.byCategory)) {
    if (stats.total > 0) {
      lines.push(
        `    ${category.padEnd(12)} ${stats.passed}/${stats.total} (${stats.coverage.toFixed(0)}%)`
      );
    }
  }
  lines.push('');

  // Failed tests
  if (summary.failedTests.length > 0) {
    lines.push('─────────────────────────────────────────────────────────────');
    lines.push('  Failed Tests:');
    for (const testId of summary.failedTests.slice(0, 10)) {
      const result = summary.results.find((r) => r.testId === testId);
      lines.push(`    ✗ ${testId}`);
      if (result?.errors.length) {
        lines.push(`      ${result.errors[0]}`);
      }
    }
    if (summary.failedTests.length > 10) {
      lines.push(`    ... and ${summary.failedTests.length - 10} more`);
    }
    lines.push('');
  }

  // Final verdict
  lines.push('═══════════════════════════════════════════════════════════');
  if (summary.runPassed) {
    lines.push(`  RESULT: PASSED ✓ (coverage ${summary.coverage.toFixed(1)}% >= ${summary.coverageThreshold}%)`);
  } else {
    lines.push(`  RESULT: FAILED ✗ (coverage ${summary.coverage.toFixed(1)}% < ${summary.coverageThreshold}%)`);
  }
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format summary as JSON.
 */
export function formatSummaryAsJson(summary: E2ERunSummary): string {
  return JSON.stringify(summary, null, 2);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Split array into chunks.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Exports
// ============================================================================

export {
  createTestContext,
  generateTestUserId,
  cleanupTestUser,
  validateApiResponse,
  validateStorage,
  validateInsight,
};
