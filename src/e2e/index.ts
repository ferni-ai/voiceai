/**
 * E2E Test Infrastructure
 *
 * Comprehensive end-to-end validation for all user-facing actions.
 * Validates: API Called → Data Stored → Insight Created
 *
 * @example
 * ```typescript
 * import { runTests, createTestContext } from './e2e/index.js';
 *
 * const results = await runTests(fixtures, { verbose: true });
 * console.log(formatSummaryForConsole(results));
 * ```
 */

// Types
export type {
  E2ETestCase,
  E2EResult,
  E2ERunConfig,
  E2ERunSummary,
  E2ETestContext,
  E2ETestCategory,
  E2ETestStatus,
  E2EFixtureFile,
  ToolFixture,
  ApiFixture,
  CommandFixture,
  SettingFixture,
  IntegrationFixture,
  StorageExpectation,
  InsightExpectation,
  ApiExpectation,
  FieldMatcher,
  StorageValidationResult,
  InsightValidationResult,
  E2ELogger,
  E2ERegistry,
  TestExecutor,
  ExecutorResult,
  CategorySummary,
  InsightSummary,
} from './types.js';

// Test Harness
export { runTest, runTests, formatSummaryForConsole, formatSummaryAsJson } from './test-harness.js';

// Context Factory
export {
  createTestContext,
  createMockTestContext,
  generateTestUserId,
  isTestUserId,
  createTestLogger,
  getUserPath,
  getInsightsPath,
  resolvePath,
} from './context-factory.js';

// Validators
export {
  validateApiResponse,
  callApi,
  apiCallSucceeds,
  validateFieldMatchers,
} from './validators/api-validator.js';

export {
  validateStorage,
  queryCollection,
  getDocument,
  assertDocumentExists,
  assertDocumentNotExists,
  assertCollectionHasDocuments,
  getStoragePathForDomain,
  STORAGE_PATHS,
} from './validators/storage-validator.js';

export {
  validateInsight,
  assertInsightCreated,
  assertInsightWithCategory,
  assertNoInsights,
  getInsights,
  getInsightsByCategory,
  getInsightsBySource,
  countInsights,
} from './validators/insight-validator.js';

// Cleanup
export {
  cleanupTestUser,
  cleanupStaleTestUsers,
  deleteTestData,
  deleteDocument,
  withCleanup,
} from './cleanup.js';
