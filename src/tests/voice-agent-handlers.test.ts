/**
 * Voice Agent Handlers Tests
 *
 * Tests for the extracted handler modules:
 * - Handoff handler
 * - User identification handler
 */

import { describe, it, expect } from 'vitest';
import {
  isRealName,
  isReturningUser,
  type UserIdentificationResult,
} from '../agents/handlers/user-identification.js';

// ============================================================================
// USER IDENTIFICATION TESTS
// ============================================================================

describe('User Identification Handler', () => {
  describe('isRealName', () => {
    it('should return false for null/undefined', () => {
      expect(isRealName(null)).toBe(false);
      expect(isRealName(undefined)).toBe(false);
    });

    it('should return false for common placeholders', () => {
      expect(isRealName('user')).toBe(false);
      expect(isRealName('guest')).toBe(false);
      expect(isRealName('anonymous')).toBe(false);
      expect(isRealName('unknown')).toBe(false);
      expect(isRealName('default')).toBe(false);
      expect(isRealName('test')).toBe(false);
    });

    it('should return false for placeholder patterns with numbers', () => {
      expect(isRealName('user123')).toBe(false);
      expect(isRealName('user_456')).toBe(false);
      expect(isRealName('guest-789')).toBe(false);
    });

    it('should return false for very short names', () => {
      expect(isRealName('A')).toBe(false);
      expect(isRealName('')).toBe(false);
    });

    it('should return true for real names', () => {
      expect(isRealName('John')).toBe(true);
      expect(isRealName('Jane Smith')).toBe(true);
      expect(isRealName('María García')).toBe(true);
      expect(isRealName('Bob')).toBe(true);
    });

    it('should be case-insensitive for placeholders', () => {
      expect(isRealName('USER')).toBe(false);
      expect(isRealName('Guest')).toBe(false);
      expect(isRealName('ANONYMOUS')).toBe(false);
    });
  });

  describe('isReturningUser', () => {
    it('should return false for null profile', () => {
      expect(isReturningUser(null)).toBe(false);
    });

    it('should return false for new users', () => {
      const profile: UserIdentificationResult['profile'] = {
        totalConversations: 0,
      };
      expect(isReturningUser(profile)).toBe(false);
    });

    it('should return true for returning users', () => {
      const profile: UserIdentificationResult['profile'] = {
        totalConversations: 5,
      };
      expect(isReturningUser(profile)).toBe(true);
    });

    it('should handle undefined totalConversations', () => {
      const profile: UserIdentificationResult['profile'] = {
        name: 'John',
      };
      expect(isReturningUser(profile)).toBe(false);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Handler Integration', () => {
  it('should filter placeholder names in user identification flow', () => {
    // Real names pass
    expect(isRealName('Sarah Connor')).toBe(true);

    // Placeholders are filtered
    expect(isRealName('user')).toBe(false);
    expect(isRealName('guest123')).toBe(false);

    // New vs returning user detection
    expect(isReturningUser({ totalConversations: 0 })).toBe(false);
    expect(isReturningUser({ totalConversations: 3 })).toBe(true);
  });
});
