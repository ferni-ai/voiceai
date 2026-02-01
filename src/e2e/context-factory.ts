/**
 * E2E Test Context Factory
 *
 * Creates and manages test contexts for E2E validation.
 * Uses production Firestore with automatic cleanup.
 */

import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import type { E2ETestContext, E2ELogger, E2ERunConfig } from './types.js';

const log = createLogger({ module: 'e2e-context-factory' });

// ============================================================================
// Test User ID Generation
// ============================================================================

/**
 * Generate a unique test user ID.
 * Format: e2e-test-{timestamp}-{random}
 */
export function generateTestUserId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `e2e-test-${timestamp}-${random}`;
}

/**
 * Check if a user ID is a test user ID.
 */
export function isTestUserId(userId: string): boolean {
  return userId.startsWith('e2e-test-');
}

// ============================================================================
// Test Logger
// ============================================================================

/**
 * Create a logger for E2E tests with consistent formatting.
 */
export function createTestLogger(testId: string, verbose = false): E2ELogger {
  const prefix = `[E2E:${testId}]`;

  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      if (verbose) {
        log.debug({ testId, ...data }, `${prefix} ${message}`);
      }
    },
    info: (message: string, data?: Record<string, unknown>) => {
      log.info({ testId, ...data }, `${prefix} ${message}`);
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      log.warn({ testId, ...data }, `${prefix} ${message}`);
    },
    error: (message: string, data?: Record<string, unknown>) => {
      log.error({ testId, ...data }, `${prefix} ${message}`);
    },
  };
}

// ============================================================================
// Test Context Creation
// ============================================================================

/**
 * Default API base URL for local development.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3002';

/**
 * Create a test context for E2E validation.
 *
 * @param testId - Unique identifier for the test (used in logging)
 * @param config - Run configuration options
 * @returns E2E test context or null if Firestore unavailable
 */
export function createTestContext(
  testId: string,
  config: E2ERunConfig = {}
): E2ETestContext | null {
  const firestore = getFirestoreDb();

  if (!firestore) {
    log.error({ testId }, 'Firestore not available - cannot create test context');
    return null;
  }

  const userId = config.testUserId || generateTestUserId();
  const apiBaseUrl = config.apiBaseUrl || process.env.E2E_API_BASE_URL || DEFAULT_API_BASE_URL;
  const verbose = config.verbose ?? false;

  const context: E2ETestContext = {
    userId,
    firestore,
    apiBaseUrl,
    authToken: process.env.E2E_AUTH_TOKEN,
    log: createTestLogger(testId, verbose),
    startTime: Date.now(),
  };

  context.log.info('Test context created', {
    userId: `${userId.substring(0, 20)}...`,
    apiBaseUrl,
  });

  return context;
}

// ============================================================================
// Mock Context for Unit Tests
// ============================================================================

/**
 * Create a mock test context for unit testing (no real Firestore).
 * Uses an in-memory mock.
 */
export function createMockTestContext(
  testId: string,
  overrides: Partial<E2ETestContext> = {}
): E2ETestContext {
  const mockFirestore = createMockFirestore();

  return {
    userId: overrides.userId || generateTestUserId(),
    firestore: mockFirestore as unknown as FirebaseFirestore.Firestore,
    apiBaseUrl: overrides.apiBaseUrl || 'http://localhost:3002',
    authToken: overrides.authToken,
    log: createTestLogger(testId, false),
    startTime: Date.now(),
    ...overrides,
  };
}

/**
 * Create a minimal mock Firestore for testing.
 */
function createMockFirestore(): MockFirestore {
  const store = new Map<string, Map<string, Record<string, unknown>>>();

  return {
    collection: (path: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const collection = store.get(path);
          const data = collection?.get(id);
          return {
            exists: !!data,
            data: () => data,
            id,
          };
        },
        set: async (data: Record<string, unknown>) => {
          if (!store.has(path)) {
            store.set(path, new Map());
          }
          store.get(path)!.set(id, data);
        },
        delete: async () => {
          const collection = store.get(path);
          collection?.delete(id);
        },
      }),
      where: () => ({
        get: async () => ({
          docs: [],
          empty: true,
        }),
      }),
      get: async () => {
        const collection = store.get(path);
        const docs = collection
          ? Array.from(collection.entries()).map(([id, data]) => ({
              id,
              exists: true,
              data: () => data,
            }))
          : [];
        return { docs, empty: docs.length === 0 };
      },
    }),
    _store: store, // Expose for testing
    _clear: () => store.clear(),
  };
}

interface MockFirestore {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
        id: string;
      }>;
      set: (data: Record<string, unknown>) => Promise<void>;
      delete: () => Promise<void>;
    };
    where: () => {
      get: () => Promise<{ docs: unknown[]; empty: boolean }>;
    };
    get: () => Promise<{
      docs: Array<{ id: string; exists: boolean; data: () => Record<string, unknown> }>;
      empty: boolean;
    }>;
  };
  _store: Map<string, Map<string, Record<string, unknown>>>;
  _clear: () => void;
}

// ============================================================================
// Context Utilities
// ============================================================================

/**
 * Get the Firestore path for a test user's data.
 */
export function getUserPath(userId: string): string {
  return `bogle_users/${userId}`;
}

/**
 * Get the Firestore path for a test user's insights.
 */
export function getInsightsPath(userId: string): string {
  return `bogle_users/${userId}/team_insights/data`;
}

/**
 * Replace placeholders in a Firestore path.
 *
 * @param path - Path with placeholders like {userId}, {id}
 * @param userId - User ID to substitute
 * @param documentId - Optional document ID to substitute
 */
export function resolvePath(path: string, userId: string, documentId?: string): string {
  let resolved = path.replace('{userId}', userId);
  if (documentId) {
    resolved = resolved.replace('{id}', documentId);
  }
  return resolved;
}

// ============================================================================
// Exports
// ============================================================================

export type { MockFirestore };
