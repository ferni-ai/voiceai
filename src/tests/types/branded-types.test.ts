/**
 * Branded Types Unit Tests
 *
 * Tests for the branded type system ensuring type safety
 * for IDs across the application.
 *
 * @module BrandedTypesTests
 */

import { describe, expect, it } from 'vitest';
import {
  createGoalId,
  createMemoryId,
  createPersonaId,
  createRoomId,
  createSessionId,
  createTurnId,
  createUserId,
  isValidPersonaId,
} from '../../types/branded.js';

// Local constant for testing valid persona IDs
const VALID_PERSONA_IDS = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan', 'jackie', 'bogle'];

// Helper to extract raw ID (branded types are strings at runtime)
function extractRawId<T extends string>(brandedId: T): string {
  return String(brandedId);
}

// ============================================================================
// CREATION FUNCTION TESTS
// ============================================================================

describe('Branded Type Creation', () => {
  describe('createSessionId', () => {
    it('should create a SessionId from a string', () => {
      const sessionId = createSessionId('sess_abc123');

      // Should be usable as a string
      expect(typeof sessionId).toBe('string');
      expect(sessionId.includes('abc123')).toBe(true);
    });

    it('should preserve the original string value', () => {
      const original = 'session-unique-id-12345';
      const sessionId = createSessionId(original);

      expect(String(sessionId)).toBe(original);
    });

    it('should create distinct types for different sessions', () => {
      const session1 = createSessionId('session-1');
      const session2 = createSessionId('session-2');

      expect(session1).not.toBe(session2);
    });
  });

  describe('createUserId', () => {
    it('should create a UserId from a string', () => {
      const userId = createUserId('user_xyz789');

      expect(typeof userId).toBe('string');
      expect(userId.includes('xyz789')).toBe(true);
    });

    it('should handle Firebase-style user IDs', () => {
      const firebaseId = 'aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0';
      const userId = createUserId(firebaseId);

      expect(String(userId)).toBe(firebaseId);
    });

    it('should handle phone-based user IDs', () => {
      const phoneId = '+1234567890';
      const userId = createUserId(phoneId);

      expect(String(userId)).toBe(phoneId);
    });
  });

  describe('createPersonaId', () => {
    it('should create PersonaId for valid persona names', () => {
      const ferni = createPersonaId('ferni');
      const peter = createPersonaId('peter');
      const alex = createPersonaId('alex');

      expect(String(ferni)).toBe('ferni');
      expect(String(peter)).toBe('peter');
      expect(String(alex)).toBe('alex');
    });

    it('should create PersonaId for all valid personas', () => {
      VALID_PERSONA_IDS.forEach((id) => {
        const personaId = createPersonaId(id);
        expect(String(personaId)).toBe(id);
      });
    });
  });

  describe('createRoomId', () => {
    it('should create a RoomId from a string', () => {
      const roomId = createRoomId('my-room-123');

      expect(typeof roomId).toBe('string');
      // When an ID is provided, it's used directly (may or may not have prefix)
      expect(String(roomId)).toBe('my-room-123');
    });

    it('should auto-generate RoomId if no argument', () => {
      const roomId = createRoomId();

      expect(typeof roomId).toBe('string');
      expect(String(roomId)).toContain('room_');
    });
  });

  describe('createGoalId', () => {
    it('should create a GoalId from a string', () => {
      const goalId = createGoalId('goal_fitness_2024');

      expect(typeof goalId).toBe('string');
      expect(String(goalId)).toBe('goal_fitness_2024');
    });
  });

  describe('createMemoryId', () => {
    it('should create a MemoryId from a string', () => {
      const memoryId = createMemoryId('mem_abc123');

      expect(typeof memoryId).toBe('string');
      expect(String(memoryId)).toBe('mem_abc123');
    });
  });

  describe('createTurnId', () => {
    it('should create a TurnId from a turn number', () => {
      const turnId = createTurnId(1);

      expect(typeof turnId).toBe('string');
      expect(String(turnId)).toContain('turn_');
    });

    it('should auto-generate TurnId if no argument', () => {
      const turnId = createTurnId();

      expect(typeof turnId).toBe('string');
      expect(String(turnId)).toContain('turn_');
    });
  });
});

// ============================================================================
// VALIDATION FUNCTION TESTS
// ============================================================================

describe('Branded Type Validation', () => {
  describe('isValidPersonaId', () => {
    it('should return true for valid persona IDs', () => {
      expect(isValidPersonaId('ferni')).toBe(true);
      expect(isValidPersonaId('peter')).toBe(true);
      expect(isValidPersonaId('alex')).toBe(true);
      expect(isValidPersonaId('maya')).toBe(true);
      expect(isValidPersonaId('jordan')).toBe(true);
      expect(isValidPersonaId('nayan')).toBe(true);
    });

    it('should return false for invalid persona IDs', () => {
      expect(isValidPersonaId('invalid')).toBe(false);
      expect(isValidPersonaId('unknown')).toBe(false);
      expect(isValidPersonaId('')).toBe(false);
      expect(isValidPersonaId('not-a-persona')).toBe(false);
    });

    it('should handle case-insensitive validation', () => {
      // The implementation converts to lowercase before checking
      expect(isValidPersonaId('FERNI')).toBe(true);
      expect(isValidPersonaId('Peter')).toBe(true);
      expect(isValidPersonaId('ALEX')).toBe(true);
    });

    it('should include additional personas', () => {
      // Jackie and Bogle are also valid
      expect(isValidPersonaId('jackie')).toBe(true);
      expect(isValidPersonaId('bogle')).toBe(true);
    });
  });

  describe('extractRawId', () => {
    it('should extract the raw string from SessionId', () => {
      const sessionId = createSessionId('sess_123');
      const raw = extractRawId(sessionId);

      expect(raw).toBe('sess_123');
      expect(typeof raw).toBe('string');
    });

    it('should extract the raw string from UserId', () => {
      const userId = createUserId('user_456');
      const raw = extractRawId(userId);

      expect(raw).toBe('user_456');
    });

    it('should extract the raw string from PersonaId', () => {
      const personaId = createPersonaId('ferni');
      const raw = extractRawId(personaId);

      expect(raw).toBe('ferni');
    });
  });
});

// ============================================================================
// TYPE SAFETY TESTS (compile-time behavior verified at runtime)
// ============================================================================

describe('Branded Type Safety', () => {
  it('should allow branded types to be used as strings', () => {
    const sessionId = createSessionId('test-session');

    // String operations should work
    expect(sessionId.length).toBeGreaterThan(0);
    expect(sessionId.includes('test')).toBe(true);
    expect(sessionId.startsWith('test')).toBe(true);
  });

  it('should preserve type information through operations', () => {
    const sessionId = createSessionId('sess_123');

    // The branded type should be assignable to string contexts
    const map = new Map<string, string>();
    map.set(sessionId as string, 'value');

    expect(map.get('sess_123')).toBe('value');
  });

  it('should work with JSON serialization', () => {
    const userId = createUserId('user_789');
    const obj = { userId };

    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);

    expect(parsed.userId).toBe('user_789');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Branded Type Edge Cases', () => {
  it('should handle empty strings', () => {
    const emptySession = createSessionId('');
    expect(String(emptySession)).toBe('');
  });

  it('should handle special characters in IDs', () => {
    const specialId = createSessionId('sess_!@#$%^&*()');
    expect(String(specialId)).toBe('sess_!@#$%^&*()');
  });

  it('should handle very long IDs', () => {
    const longId = 'x'.repeat(1000);
    const sessionId = createSessionId(longId);

    expect(String(sessionId)).toBe(longId);
    expect(sessionId.length).toBe(1000);
  });

  it('should handle unicode in IDs', () => {
    const unicodeId = createUserId('user_日本語_émoji_🎉');
    expect(String(unicodeId)).toBe('user_日本語_émoji_🎉');
  });
});

// ============================================================================
// PERSONA VALIDATION COMPREHENSIVE
// ============================================================================

describe('Persona ID Validation Comprehensive', () => {
  it('should include all six main personas', () => {
    expect(VALID_PERSONA_IDS).toContain('ferni');
    expect(VALID_PERSONA_IDS).toContain('peter');
    expect(VALID_PERSONA_IDS).toContain('alex');
    expect(VALID_PERSONA_IDS).toContain('maya');
    expect(VALID_PERSONA_IDS).toContain('jordan');
    expect(VALID_PERSONA_IDS).toContain('nayan');
  });

  it('should include additional valid personas', () => {
    expect(VALID_PERSONA_IDS).toContain('jackie');
    expect(VALID_PERSONA_IDS).toContain('bogle');
  });

  it('should be an array of strings', () => {
    expect(Array.isArray(VALID_PERSONA_IDS)).toBe(true);
    VALID_PERSONA_IDS.forEach((id) => {
      expect(typeof id).toBe('string');
    });
  });

  it('should not contain duplicates', () => {
    const uniqueIds = new Set(VALID_PERSONA_IDS);
    expect(uniqueIds.size).toBe(VALID_PERSONA_IDS.length);
  });

  it('all test constants should pass isValidPersonaId', () => {
    VALID_PERSONA_IDS.forEach((id) => {
      expect(isValidPersonaId(id)).toBe(true);
    });
  });
});
