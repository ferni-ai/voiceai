/**
 * Voice Agent Handlers Tests
 *
 * Tests for the extracted handler modules:
 * - Handoff handler
 * - Silence handler
 * - User identification handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldRespondToSilence,
  createSilenceContext,
  resetSilenceState,
  recordSilenceResponse,
  type SilenceState,
} from '../agents/handlers/silence-handler.js';
import {
  isRealName,
  isReturningUser,
  type UserIdentificationResult,
} from '../agents/handlers/user-identification.js';

// ============================================================================
// SILENCE HANDLER TESTS
// ============================================================================

describe('Silence Handler', () => {
  describe('shouldRespondToSilence', () => {
    it('should not respond before 10 seconds', () => {
      const state = resetSilenceState();
      const result = shouldRespondToSilence(5, state);
      expect(result.shouldRespond).toBe(false);
    });

    it('should respond at 10 seconds for first response', () => {
      const state: SilenceState = {
        userLastSpokeAt: Date.now() - 15000, // 15 seconds ago
        responseCount: 0,
        lastResponseAt: 0,
      };
      const result = shouldRespondToSilence(12, state);
      expect(result.shouldRespond).toBe(true);
      expect(result.intervalIndex).toBe(0);
    });

    it('should respond at 22 seconds for second response', () => {
      const state: SilenceState = {
        userLastSpokeAt: Date.now() - 25000,
        responseCount: 1,
        lastResponseAt: Date.now() - 15000, // Response was 15 seconds ago
      };
      const result = shouldRespondToSilence(25, state);
      expect(result.shouldRespond).toBe(true);
      expect(result.intervalIndex).toBe(1);
    });

    it('should not respond if last response was recent', () => {
      const state: SilenceState = {
        userLastSpokeAt: Date.now() - 15000,
        responseCount: 0,
        lastResponseAt: Date.now() - 5000, // Response was only 5 seconds ago
      };
      const result = shouldRespondToSilence(15, state);
      expect(result.shouldRespond).toBe(false);
    });

    it('should stop responding after 3 intervals', () => {
      const state: SilenceState = {
        userLastSpokeAt: Date.now() - 60000,
        responseCount: 3, // Already responded 3 times
        lastResponseAt: Date.now() - 15000,
      };
      const result = shouldRespondToSilence(60, state);
      expect(result.shouldRespond).toBe(false);
      expect(result.intervalIndex).toBe(-1);
    });
  });

  describe('createSilenceContext', () => {
    it('should create context with defaults', () => {
      const context = createSilenceContext();

      expect(context.silenceDurationSeconds).toBe(0);
      expect(context.turnCount).toBe(0);
      expect(context.topicsDiscussed).toEqual([]);
      expect(context.recentEmotionalTone).toBe('neutral');
    });

    it('should create context with provided values', () => {
      const context = createSilenceContext('John', 5);

      expect(context.userName).toBe('John');
      expect(context.turnCount).toBe(5);
    });
  });

  describe('resetSilenceState', () => {
    it('should create fresh state', () => {
      const state = resetSilenceState();

      expect(state.responseCount).toBe(0);
      expect(state.lastResponseAt).toBe(0);
      expect(state.userLastSpokeAt).toBeGreaterThan(0);
    });
  });

  describe('recordSilenceResponse', () => {
    it('should increment response count', () => {
      const state = resetSilenceState();
      const updated = recordSilenceResponse(state);

      expect(updated.responseCount).toBe(1);
      expect(updated.lastResponseAt).toBeGreaterThan(0);
    });

    it('should preserve userLastSpokeAt', () => {
      const state: SilenceState = {
        userLastSpokeAt: 12345,
        responseCount: 0,
        lastResponseAt: 0,
      };
      const updated = recordSilenceResponse(state);

      expect(updated.userLastSpokeAt).toBe(12345);
    });
  });
});

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
  it('should coordinate silence handling workflow', () => {
    // 1. Create initial state
    let state = resetSilenceState();
    const context = createSilenceContext('John', 10);

    // 2. Check before interval - should not respond
    let result = shouldRespondToSilence(5, state);
    expect(result.shouldRespond).toBe(false);

    // 3. Simulate time passing - check at first interval
    state = { ...state, lastResponseAt: 0 };
    result = shouldRespondToSilence(12, state);
    expect(result.shouldRespond).toBe(true);

    // 4. Record response
    state = recordSilenceResponse(state);
    expect(state.responseCount).toBe(1);

    // 5. Should not respond again immediately
    result = shouldRespondToSilence(15, state);
    expect(result.shouldRespond).toBe(false);
  });

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
