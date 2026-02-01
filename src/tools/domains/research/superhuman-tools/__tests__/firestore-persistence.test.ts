/**
 * Firestore Persistence Layer Tests
 *
 * Tests for context extraction functions.
 * Note: Full persistence tests are covered via the tool tests.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/firestore-persistence.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('../../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn().mockReturnValue(null), // Force in-memory fallback
  cleanForFirestore: vi.fn((data) => data),
}));

vi.mock('../../../../../utils/firestore-utils.js', () => ({
  cleanForFirestore: vi.fn((data) => data),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { getUserIdFromContext, getSessionIdFromContext } from '../firestore-persistence.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockLiveKitContext(userId: string): unknown {
  return {
    session: {
      userData: {
        userId,
      },
    },
    room: {
      name: `room-${userId}`,
    },
  };
}

function createMockSimpleContext(userId: string): unknown {
  return { userId };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Firestore Persistence Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Context Extraction
  // --------------------------------------------------------------------------

  describe('getUserIdFromContext', () => {
    it('should extract userId from LiveKit context (session.userData.userId)', () => {
      const ctx = createMockLiveKitContext('test-user-123');
      const result = getUserIdFromContext(ctx);
      expect(result).toBe('test-user-123');
    });

    it('should extract userId from simple context (ctx.userId)', () => {
      const ctx = createMockSimpleContext('test-user-456');
      const result = getUserIdFromContext(ctx);
      expect(result).toBe('test-user-456');
    });

    it('should extract userId from room.name as fallback', () => {
      const ctx = { room: { name: 'room-fallback-user' } };
      const result = getUserIdFromContext(ctx);
      expect(result).toBe('room-fallback-user');
    });

    it('should return null for null context', () => {
      const result = getUserIdFromContext(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined context', () => {
      const result = getUserIdFromContext(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty object', () => {
      const result = getUserIdFromContext({});
      expect(result).toBeNull();
    });
  });

  describe('getSessionIdFromContext', () => {
    it('should return null for context without sessionId', () => {
      const ctx = { session: {} };
      const result = getSessionIdFromContext(ctx);
      expect(result).toBeNull();
    });

    it('should return null for null context', () => {
      const result = getSessionIdFromContext(null);
      expect(result).toBeNull();
    });
  });
});
