import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as dotenv from 'dotenv';
import { initializeLogger } from '@livekit/agents';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Never look for a Google metadata server. Modules that load the real
// firebase-admin (anything not mocked below) otherwise probe for one when
// they find no credentials. On GitHub's runners that probe stalled the
// integration job until its 30-minute timeout (2026-10-01); locally it fails
// fast, so the suite looked fine here.
process.env.METADATA_SERVER_DETECTION = 'none';

// ============================================================================
// GLOBAL FIRESTORE MOCKS
// ============================================================================
// Many services import getFirestoreDb from various paths. The superhuman services
// use a re-export from src/services/superhuman/firestore-utils.ts which re-exports
// from src/utils/firestore-utils.js. We mock the canonical location globally.

// Create mock Firestore collection/doc structure
const createMockFirestore = () => {
  const mockDoc = {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn(() => mockCollection),
  };

  const mockCollection: {
    doc: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  } = {
    doc: vi.fn(() => mockDoc),
    add: vi.fn().mockResolvedValue({ id: 'mock-doc-id' }),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    where: vi.fn(() => mockCollection),
    orderBy: vi.fn(() => mockCollection),
    limit: vi.fn(() => mockCollection),
  };

  return {
    collection: vi.fn(() => mockCollection),
    doc: vi.fn(() => mockDoc),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    runTransaction: vi.fn(async (fn) =>
      fn({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      })
    ),
  };
};

const mockFirestoreDb = createMockFirestore();

// True for a Firestore FieldValue sentinel (serverTimestamp(), increment(),
// arrayUnion(), arrayRemove(), delete()). Mirrors the guard in
// utils/firestore-utils.ts - this mock must preserve sentinels by identity
// too, or any test writing one through the mocked cleanForFirestore would
// see it silently turned into a plain `{}` (see PR #175 critic review).
//
// Deliberately duck-typed only (no `instanceof FieldValue`, no top-level
// import of the real @google-cloud/firestore package here): this file is a
// global setupFile loaded before every test file, and several test files
// locally `vi.mock('@google-cloud/firestore', ...)` with their own fake
// Firestore class. An eager real import here raced with those per-file
// mocks and won often enough to make `persistence/index.ts`'s own
// `new Firestore(...)` resolve to the (non-functional, in this test env)
// real client instead of the local mock - silently no-op'ing every flush
// in any OTHER file that ran in the same vitest invocation. Confirmed by
// removing the import: the flakiness disappeared.
const isFirestoreFieldValueImpl = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  const looksLikeTransform =
    typeof ctorName === 'string' && (ctorName === 'FieldValue' || ctorName.endsWith('Transform'));
  const hasIsEqual = typeof (value as { isEqual?: unknown }).isEqual === 'function';
  return looksLikeTransform && hasIsEqual;
};

// Helper function to clean undefined values (matches real implementation)
const cleanForFirestoreImpl = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString() as T;
  if (isFirestoreFieldValueImpl(obj)) return obj;
  if (Array.isArray(obj)) return obj.map((item) => cleanForFirestoreImpl(item)) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = cleanForFirestoreImpl(value);
      }
    }
    return result as T;
  }
  return obj;
};

// Same as utils/firestore-utils.ts: walks plain objects and arrays only.
const deepRemoveUndefinedImpl = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepRemoveUndefinedImpl(item)) as T;
  const proto = typeof obj === 'object' ? (Object.getPrototypeOf(obj) as unknown) : undefined;
  if (proto === Object.prototype || proto === null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) result[key] = deepRemoveUndefinedImpl(value);
    }
    return result as T;
  }
  return obj;
};

const removeUndefinedImpl = <T extends object>(obj: T): T => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
};

// Mirrors utils/firestore-utils.ts's sanitizeFirestoreDocId.
const sanitizeFirestoreDocIdImpl = (input: string): string => {
  const MAX_BYTES = 1400;
  let safe = (input ?? '').replace(/\//g, '-').trim();
  if (safe === '.' || safe === '..') safe = safe.replace(/\./g, '_dot_');
  if (safe.length === 0) safe = '_';
  if (Buffer.byteLength(safe, 'utf8') > MAX_BYTES) {
    safe = Buffer.from(safe, 'utf8').subarray(0, MAX_BYTES).toString('utf8');
  }
  return safe;
};

// Helper: Safely convert any timestamp-like value to Date
const toSafeDateImpl = (value: unknown, fallback: Date = new Date()): Date => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const obj = value as { seconds: number; nanoseconds?: number };
    return new Date(obj.seconds * 1000 + (obj.nanoseconds ?? 0) / 1000000);
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const obj = value as { _seconds: number; _nanoseconds?: number };
    return new Date(obj._seconds * 1000 + (obj._nanoseconds ?? 0) / 1000000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
};

const toSafeDateOptionalImpl = (value: unknown): Date | undefined => {
  if (value === null || value === undefined) return undefined;
  return toSafeDateImpl(value);
};

// Mock the canonical utils/firestore-utils.js
vi.mock('../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => mockFirestoreDb),
  cleanForFirestore: vi.fn((obj: unknown) => cleanForFirestoreImpl(obj)),
  removeUndefined: vi.fn((obj: unknown) => removeUndefinedImpl(obj as object)),
  // Not cleanForFirestore: that turns Dates into strings, which the real
  // deepRemoveUndefined doesn't do.
  deepRemoveUndefined: vi.fn((obj: unknown) => deepRemoveUndefinedImpl(obj)),
  sanitizeFirestoreDocId: vi.fn((input: string) => sanitizeFirestoreDocIdImpl(input)),
  toSafeDate: vi.fn((value: unknown, fallback?: Date) => toSafeDateImpl(value, fallback)),
  toSafeDateOptional: vi.fn((value: unknown) => toSafeDateOptionalImpl(value)),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock the safe-logger to avoid module import issues
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => mockLogger),
};

// Mock safe-logger globally - must export ALL functions used across codebase
vi.mock('../utils/safe-logger.js', () => {
  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  });

  return {
    getLogger: vi.fn(() => createMockLogger()),
    safeLog: vi.fn(() => createMockLogger()),
    createLogger: vi.fn(() => createMockLogger()),
    serializeError: vi.fn((error: unknown) => {
      if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
      }
      return error;
    }),
    isFullLoggingEnabled: vi.fn(() => false),
    truncateForLog: vi.fn((value: unknown, maxLength?: number) =>
      typeof value === 'string' && maxLength ? value.slice(0, maxLength) : value
    ),
  };
});

// Mock Firebase Admin SDK
vi.mock('firebase-admin/firestore', () => {
  const mockTimestamp = {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  };

  return {
    getFirestore: vi.fn(() => mockFirestoreDb),
    Timestamp: {
      now: vi.fn(() => mockTimestamp),
      fromDate: vi.fn((date: Date) => ({
        ...mockTimestamp,
        toDate: () => date,
        toMillis: () => date.getTime(),
        seconds: Math.floor(date.getTime() / 1000),
      })),
    },
    FieldValue: {
      serverTimestamp: vi.fn(() => mockTimestamp),
      increment: vi.fn((n: number) => n),
      arrayUnion: vi.fn((...elements: unknown[]) => elements),
      arrayRemove: vi.fn((...elements: unknown[]) => elements),
      delete: vi.fn(() => ({})),
    },
  };
});

// About 100 modules (the persistence layer among them) import @google-cloud/firestore
// directly, which the firebase-admin mock above doesn't cover, so tests built a real
// client. In CI, with no credentials, every call retried to its deadline (13-21 s per
// test), pushing Integration Tests past its 30-minute limit; locally, a developer's
// gcloud credentials sent test reads and writes to the real project. Tests run against
// the emulator keep the real client, and a test's own vi.mock still takes precedence.
vi.mock('@google-cloud/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google-cloud/firestore')>();
  if (process.env.FIRESTORE_EMULATOR_HOST) return actual;

  class Firestore {
    constructor() {
      const db = createMockFirestore();
      return Object.assign(db, {
        settings: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
        listCollections: vi.fn().mockResolvedValue([]),
        collectionGroup: vi.fn(() => db.collection('')),
      });
    }
  }
  return { ...actual, Firestore, default: { ...actual, Firestore } };
});

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApp: vi.fn(() => ({
    name: '[DEFAULT]',
  })),
  getApps: vi.fn(() => [
    {
      name: '[DEFAULT]',
    },
  ]),
  cert: vi.fn(),
  applicationDefault: vi.fn(),
}));

// Mock the superhuman re-export location
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => mockFirestoreDb),
  cleanForFirestore: vi.fn((obj: unknown) => cleanForFirestoreImpl(obj)),
  removeUndefined: vi.fn((obj: unknown) => removeUndefinedImpl(obj as object)),
  deepRemoveUndefined: vi.fn((obj: unknown) => cleanForFirestoreImpl(obj)),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  getSuperhmanHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
  SUPERHUMAN_SERVICES: [],
}));

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.MEMORY_STORE_TYPE = 'memory'; // Use in-memory store for tests

  // CRITICAL: Initialize LiveKit logger before any tests run
  // This prevents "logger not initialized" errors throughout the test suite
  initializeLogger({ pretty: false });
});

// Cleanup after all tests
afterAll(() => {
  // Cleanup any global resources
});

// Reset state before each test
beforeEach(() => {
  // Clear any test state
});

// Cleanup after each test
afterEach(() => {
  // Reset mocks, clear timers, etc.
});
