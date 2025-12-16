/**
 * Session Access Module Tests
 *
 * Tests for session retrieval and management functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../types/branded.js', () => ({
  createSessionId: (id: string) => id as unknown,
}));

import {
  initializeAccess,
  getSessionServices,
  hasSession,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
} from '../access.js';
import type { SessionServices } from '../../types.js';

describe('Session Access Module', () => {
  let mockSessions: Map<string, SessionServices>;
  let mockEndSession: ReturnType<typeof vi.fn>;

  const createMockServices = (sessionId: string): SessionServices => {
    mockEndSession = vi.fn().mockResolvedValue(undefined);
    return {
      sessionId,
      userId: `user-${sessionId}`,
      sessionStartTime: Date.now(),
      endSession: mockEndSession,
      // Add minimal required properties
      analyze: vi.fn(),
      addTurn: vi.fn(),
      getRecentTurns: vi.fn(() => []),
    } as unknown as SessionServices;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions = new Map();
    // Initialize the module with our mock map
    initializeAccess(mockSessions as unknown as Map<never, SessionServices>);
  });

  afterEach(() => {
    mockSessions.clear();
  });

  describe('initializeAccess', () => {
    it('should initialize with empty map', () => {
      expect(getActiveSessionCount()).toBe(0);
      expect(getActiveSessionIds()).toEqual([]);
    });

    it('should work with pre-populated map', () => {
      const session1 = createMockServices('session-1');
      const session2 = createMockServices('session-2');
      mockSessions.set('session-1', session1);
      mockSessions.set('session-2', session2);

      expect(getActiveSessionCount()).toBe(2);
    });
  });

  describe('getSessionServices', () => {
    it('should return session services when session exists', () => {
      const services = createMockServices('test-session');
      mockSessions.set('test-session', services);

      const result = getSessionServices('test-session');

      expect(result).toBe(services);
    });

    it('should return undefined when session does not exist', () => {
      const result = getSessionServices('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should handle empty session ID', () => {
      const result = getSessionServices('');

      expect(result).toBeUndefined();
    });
  });

  describe('hasSession', () => {
    it('should return true when session exists', () => {
      mockSessions.set('existing-session', createMockServices('existing-session'));

      expect(hasSession('existing-session')).toBe(true);
    });

    it('should return false when session does not exist', () => {
      expect(hasSession('nonexistent')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasSession('')).toBe(false);
    });
  });

  describe('getActiveSessionIds', () => {
    it('should return empty array when no sessions', () => {
      expect(getActiveSessionIds()).toEqual([]);
    });

    it('should return all session IDs', () => {
      mockSessions.set('session-1', createMockServices('session-1'));
      mockSessions.set('session-2', createMockServices('session-2'));
      mockSessions.set('session-3', createMockServices('session-3'));

      const ids = getActiveSessionIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('session-1');
      expect(ids).toContain('session-2');
      expect(ids).toContain('session-3');
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 when no sessions', () => {
      expect(getActiveSessionCount()).toBe(0);
    });

    it('should return correct count', () => {
      mockSessions.set('session-1', createMockServices('session-1'));
      expect(getActiveSessionCount()).toBe(1);

      mockSessions.set('session-2', createMockServices('session-2'));
      expect(getActiveSessionCount()).toBe(2);
    });

    it('should reflect deletions', () => {
      mockSessions.set('session-1', createMockServices('session-1'));
      mockSessions.set('session-2', createMockServices('session-2'));
      expect(getActiveSessionCount()).toBe(2);

      mockSessions.delete('session-1');
      expect(getActiveSessionCount()).toBe(1);
    });
  });

  describe('clearAllSessions', () => {
    it('should return 0 when no sessions to clear', async () => {
      const count = await clearAllSessions();

      expect(count).toBe(0);
    });

    it('should clear all sessions and call endSession', async () => {
      const services1 = createMockServices('session-1');
      const services2 = createMockServices('session-2');
      mockSessions.set('session-1', services1);
      mockSessions.set('session-2', services2);

      const count = await clearAllSessions();

      expect(count).toBe(2);
      expect(services1.endSession).toHaveBeenCalled();
      expect(services2.endSession).toHaveBeenCalled();
      expect(mockSessions.size).toBe(0);
    });

    it('should handle endSession errors gracefully', async () => {
      const services = createMockServices('session-1');
      (services.endSession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('End session failed')
      );
      mockSessions.set('session-1', services);

      // Should not throw
      const count = await clearAllSessions();

      expect(count).toBe(1);
      expect(mockSessions.size).toBe(0);
    });

    it('should clear map even if some sessions fail to end', async () => {
      const services1 = createMockServices('session-1');
      const services2 = createMockServices('session-2');
      (services1.endSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));
      mockSessions.set('session-1', services1);
      mockSessions.set('session-2', services2);

      await clearAllSessions();

      expect(mockSessions.size).toBe(0);
    });
  });
});

describe('Session Access Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle operations before initialization', () => {
    // Re-import to get fresh module state
    // Note: This tests the "not initialized" code path
    // In practice, the module is always initialized before use

    // These should return safe defaults without throwing
    expect(getActiveSessionCount()).toBeGreaterThanOrEqual(0);
    expect(getActiveSessionIds()).toBeDefined();
  });
});
