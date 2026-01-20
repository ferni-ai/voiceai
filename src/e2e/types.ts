/**
 * E2E Test Types
 *
 * Shared types for the comprehensive E2E validation system.
 * Used across all test categories: tools, APIs, commands, settings, integrations.
 */

// ============================================================================
// Test Case Types
// ============================================================================

/**
 * Categories of user-facing actions that can be E2E tested
 */
export type E2ETestCategory = 'tool' | 'api' | 'command' | 'setting' | 'integration';

/**
 * Status of an E2E test execution
 */
export type E2ETestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

/**
 * A single E2E test case definition
 */
export interface E2ETestCase {
  /** Unique identifier for this test case */
  id: string;

  /** Category of the action being tested */
  category: E2ETestCategory;

  /** Human-readable name */
  name: string;

  /** Optional description of what this test validates */
  description?: string;

  /** Parameters to pass when executing the action */
  testParams: Record<string, unknown>;

  /** Expected storage writes (Firestore paths and data patterns) */
  expectedStorage?: StorageExpectation[];

  /** Expected insights to be created */
  expectedInsight?: InsightExpectation;

  /** Expected API response (for API category tests) */
  expectedApiResponse?: ApiExpectation;

  /** Custom cleanup function to run after test */
  cleanup?: () => Promise<void>;

  /** If true, this fixture is auto-generated and needs manual verification */
  incomplete?: boolean;

  /** Tags for filtering tests */
  tags?: string[];

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** If true, skip this test */
  skip?: boolean;

  /** Reason for skipping */
  skipReason?: string;
}

// ============================================================================
// Expectation Types
// ============================================================================

/**
 * Expected Firestore storage write
 */
export interface StorageExpectation {
  /** Firestore collection/document path pattern (supports {userId}, {id} placeholders) */
  path: string;

  /** Whether to check that document exists */
  exists: boolean;

  /** Optional: fields that must be present in the document */
  requiredFields?: string[];

  /** Optional: field value matchers */
  fieldMatchers?: Record<string, FieldMatcher>;
}

/**
 * Field matcher for storage validation
 */
export type FieldMatcher =
  | { type: 'equals'; value: unknown }
  | { type: 'contains'; value: string }
  | { type: 'matches'; pattern: string }
  | { type: 'exists' }
  | { type: 'isArray'; minLength?: number }
  | { type: 'isNumber'; min?: number; max?: number }
  | { type: 'isString'; minLength?: number }
  | { type: 'isTimestamp' };

/**
 * Expected insight to be created
 */
export interface InsightExpectation {
  /** Expected insight category (e.g., 'career-tracking', 'habit-milestone') */
  category?: string;

  /** Expected insight source persona */
  source?: string;

  /** Expected target persona */
  target?: string;

  /** Expected priority level */
  priority?: 'critical' | 'high' | 'normal' | 'low';

  /** If true, just check that ANY insight was created */
  anyInsight?: boolean;
}

/**
 * Expected API response
 */
export interface ApiExpectation {
  /** Expected HTTP status code */
  statusCode?: number;

  /** Expected response body pattern */
  bodyMatchers?: Record<string, FieldMatcher>;

  /** Expected headers */
  headers?: Record<string, string>;

  /** If true, response must be JSON */
  isJson?: boolean;
}

// ============================================================================
// Test Result Types
// ============================================================================

/**
 * Result of a single E2E test execution
 */
export interface E2EResult {
  /** Test case ID */
  testId: string;

  /** Test case name */
  testName: string;

  /** Test category */
  category: E2ETestCategory;

  /** Whether the test passed */
  passed: boolean;

  /** Final test status */
  status: E2ETestStatus;

  /** Whether the API/action was successfully called */
  apiCalled: boolean;

  /** Whether data was stored as expected */
  dataStored: boolean;

  /** Whether insight was created as expected */
  insightCreated: boolean;

  /** Error messages if test failed */
  errors: string[];

  /** Warnings (non-fatal issues) */
  warnings: string[];

  /** Test execution duration in milliseconds */
  duration: number;

  /** Timestamp when test started */
  startedAt: number;

  /** Timestamp when test completed */
  completedAt: number;

  /** Raw response from action execution */
  rawResponse?: unknown;

  /** Storage validation details */
  storageValidation?: StorageValidationResult[];

  /** Insight validation details */
  insightValidation?: InsightValidationResult;
}

/**
 * Result of storage validation
 */
export interface StorageValidationResult {
  /** Path that was checked */
  path: string;

  /** Whether document was found */
  found: boolean;

  /** Whether validation passed */
  passed: boolean;

  /** Actual document data (if found) */
  actualData?: Record<string, unknown>;

  /** Validation errors */
  errors: string[];
}

/**
 * Result of insight validation
 */
export interface InsightValidationResult {
  /** Whether any insight was found */
  found: boolean;

  /** Whether validation passed */
  passed: boolean;

  /** Insights that were found */
  insights: InsightSummary[];

  /** Validation errors */
  errors: string[];
}

/**
 * Summary of a found insight
 */
export interface InsightSummary {
  id: string;
  category: string;
  source: string;
  target: string;
  priority: string;
  content: string;
  createdAt: number;
}

// ============================================================================
// Test Run Types
// ============================================================================

/**
 * Configuration for a test run
 */
export interface E2ERunConfig {
  /** Test user ID to use (auto-generated if not provided) */
  testUserId?: string;

  /** Categories to include (default: all) */
  categories?: E2ETestCategory[];

  /** Specific test IDs to run */
  testIds?: string[];

  /** Tags to filter by */
  tags?: string[];

  /** Maximum parallel tests */
  concurrency?: number;

  /** Global timeout per test in ms */
  timeout?: number;

  /** If true, stop on first failure */
  failFast?: boolean;

  /** If true, skip cleanup (for debugging) */
  skipCleanup?: boolean;

  /** Output format */
  reportFormat?: 'console' | 'json' | 'both';

  /** If true, verbose output */
  verbose?: boolean;

  /** Base URL for API calls */
  apiBaseUrl?: string;
}

/**
 * Summary of an E2E test run
 */
export interface E2ERunSummary {
  /** Total number of tests */
  total: number;

  /** Number of tests that passed */
  passed: number;

  /** Number of tests that failed */
  failed: number;

  /** Number of tests skipped */
  skipped: number;

  /** Coverage percentage (passed / (total - skipped) * 100) */
  coverage: number;

  /** Total duration in milliseconds */
  duration: number;

  /** Breakdown by category */
  byCategory: Record<E2ETestCategory, CategorySummary>;

  /** Test user ID used */
  testUserId: string;

  /** Timestamp when run started */
  startedAt: number;

  /** Timestamp when run completed */
  completedAt: number;

  /** Individual test results */
  results: E2EResult[];

  /** List of failed test IDs */
  failedTests: string[];

  /** Whether overall run passed (coverage >= threshold) */
  runPassed: boolean;

  /** Coverage threshold used */
  coverageThreshold: number;
}

/**
 * Summary for a specific category
 */
export interface CategorySummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: number;
}

// ============================================================================
// Test Context Types
// ============================================================================

/**
 * Context passed to test execution
 */
export interface E2ETestContext {
  /** Test user ID */
  userId: string;

  /** Firestore instance */
  firestore: FirebaseFirestore.Firestore;

  /** API base URL */
  apiBaseUrl: string;

  /** Auth token for API calls */
  authToken?: string;

  /** Logger instance */
  log: E2ELogger;

  /** Start timestamp for this test */
  startTime: number;
}

/**
 * Logger interface for E2E tests
 */
export interface E2ELogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

// ============================================================================
// Fixture Types
// ============================================================================

/**
 * A fixture file containing multiple test cases
 */
export interface E2EFixtureFile {
  /** Domain or route this fixture covers */
  domain: string;

  /** Category of tests in this fixture */
  category: E2ETestCategory;

  /** Description of what this fixture tests */
  description?: string;

  /** Test cases */
  tests: E2ETestCase[];
}

/**
 * Tool-specific fixture with additional metadata
 */
export interface ToolFixture extends E2ETestCase {
  category: 'tool';

  /** Tool ID (e.g., 'trackJobApplication') */
  toolId: string;

  /** Tool domain (e.g., 'career') */
  toolDomain: string;
}

/**
 * API-specific fixture with additional metadata
 */
export interface ApiFixture extends E2ETestCase {
  category: 'api';

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** API path (e.g., '/api/habits') */
  path: string;

  /** Request headers */
  headers?: Record<string, string>;

  /** Request body */
  body?: Record<string, unknown>;
}

/**
 * Command-specific fixture with additional metadata
 */
export interface CommandFixture extends E2ETestCase {
  category: 'command';

  /** Persona ID (e.g., 'ferni', 'maya') */
  personaId: string;

  /** Command ID (e.g., 'daily-checkin') */
  commandId: string;
}

/**
 * Setting-specific fixture
 */
export interface SettingFixture extends E2ETestCase {
  category: 'setting';

  /** Setting key */
  settingKey: string;

  /** Test value to set */
  testValue: unknown;

  /** Expected value after get */
  expectedValue: unknown;
}

/**
 * Integration-specific fixture
 */
export interface IntegrationFixture extends E2ETestCase {
  category: 'integration';

  /** Integration name (e.g., 'spotify', 'google-calendar') */
  integrationName: string;

  /** Whether this integration requires OAuth */
  requiresOAuth?: boolean;

  /** Mock data to use if OAuth not available */
  mockData?: Record<string, unknown>;
}

// ============================================================================
// Executor Types
// ============================================================================

/**
 * Function signature for test executors
 */
export type TestExecutor = (
  testCase: E2ETestCase,
  context: E2ETestContext
) => Promise<ExecutorResult>;

/**
 * Result from a test executor
 */
export interface ExecutorResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Response data from the action */
  response?: unknown;

  /** Error if execution failed */
  error?: Error | string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Registry of all test fixtures
 */
export interface E2ERegistry {
  /** All tool fixtures by domain */
  tools: Map<string, ToolFixture[]>;

  /** All API fixtures by route prefix */
  apis: Map<string, ApiFixture[]>;

  /** All command fixtures by persona */
  commands: Map<string, CommandFixture[]>;

  /** All setting fixtures */
  settings: SettingFixture[];

  /** All integration fixtures */
  integrations: IntegrationFixture[];

  /** Get all test cases */
  getAllTests: () => E2ETestCase[];

  /** Get tests by category */
  getByCategory: (category: E2ETestCategory) => E2ETestCase[];

  /** Get test by ID */
  getById: (id: string) => E2ETestCase | undefined;
}
