/**
 * Tests for session-manager utility modules
 *
 * Tests validation, constants, and utility functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

import { validateUserId, isValidUserId } from '../validation.js';
import {
  SESSION_MAX_AGE_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  SUMMARIZE_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
  AUTO_SAVE_INTERVAL_MS,
  MAX_HUMANIZING_UPDATES,
  MIN_USER_ID_LENGTH,
  MAX_USER_ID_LENGTH,
  USER_ID_PATTERN,
} from '../constants.js';
import {
  withTimeout,
  generateFallbackSummary,
  calculateSpeakingPace,
  blendWPM,
  paceToWPM,
} from '../utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

describe('Session Manager Constants', () => {
  describe('Lifecycle Constants', () => {
    it('has valid session max age', () => {
      expect(SESSION_MAX_AGE_MS).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(SESSION_MAX_AGE_MS).toBeGreaterThan(0);
    });

    it('has valid cleanup interval', () => {
      expect(SESSION_CLEANUP_INTERVAL_MS).toBe(15 * 60 * 1000); // 15 minutes
      expect(SESSION_CLEANUP_INTERVAL_MS).toBeLessThan(SESSION_MAX_AGE_MS);
    });

    it('has valid summarize timeout', () => {
      expect(SUMMARIZE_TIMEOUT_MS).toBe(10000); // 10 seconds
      expect(SUMMARIZE_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('has valid shutdown timeout', () => {
      expect(SHUTDOWN_TIMEOUT_MS).toBe(5000); // 5 seconds
      expect(SHUTDOWN_TIMEOUT_MS).toBeLessThan(SUMMARIZE_TIMEOUT_MS);
    });

    it('has valid auto-save interval', () => {
      expect(AUTO_SAVE_INTERVAL_MS).toBe(30000); // 30 seconds
      expect(AUTO_SAVE_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('has valid max humanizing updates', () => {
      expect(MAX_HUMANIZING_UPDATES).toBe(100);
      expect(MAX_HUMANIZING_UPDATES).toBeGreaterThan(0);
    });
  });

  describe('Validation Constants', () => {
    it('has valid user ID length bounds', () => {
      expect(MIN_USER_ID_LENGTH).toBe(4);
      expect(MAX_USER_ID_LENGTH).toBe(128);
      expect(MIN_USER_ID_LENGTH).toBeLessThan(MAX_USER_ID_LENGTH);
    });

    it('has valid user ID pattern', () => {
      expect(USER_ID_PATTERN).toBeInstanceOf(RegExp);
      // Test the pattern matches valid IDs
      expect(USER_ID_PATTERN.test('user123')).toBe(true);
      expect(USER_ID_PATTERN.test('user-123')).toBe(true);
      expect(USER_ID_PATTERN.test('user_123')).toBe(true);
      expect(USER_ID_PATTERN.test('user.123')).toBe(true);
      expect(USER_ID_PATTERN.test('user@example')).toBe(true);
      // Test the pattern rejects invalid IDs
      expect(USER_ID_PATTERN.test('user 123')).toBe(false);
      expect(USER_ID_PATTERN.test('user<script>')).toBe(false);
      expect(USER_ID_PATTERN.test('')).toBe(false);
    });
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('validateUserId', () => {
  it('returns valid user IDs unchanged', () => {
    expect(validateUserId('user123')).toBe('user123');
    expect(validateUserId('firebase-uid-12345678901234567890')).toBe(
      'firebase-uid-12345678901234567890'
    );
    expect(validateUserId('uuid-a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'uuid-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });

  it('returns undefined for empty/null values', () => {
    expect(validateUserId('')).toBeUndefined();
    expect(validateUserId(undefined)).toBeUndefined();
    expect(validateUserId('   ')).toBeUndefined();
  });

  it('returns undefined for non-string values', () => {
    expect(validateUserId(123 as unknown as string)).toBeUndefined();
    expect(validateUserId({} as unknown as string)).toBeUndefined();
  });

  it('returns undefined for IDs that are too short', () => {
    expect(validateUserId('abc')).toBeUndefined(); // 3 chars < 4
    expect(validateUserId('ab')).toBeUndefined();
    expect(validateUserId('a')).toBeUndefined();
  });

  it('returns undefined for IDs that are too long', () => {
    const longId = 'a'.repeat(MAX_USER_ID_LENGTH + 1);
    expect(validateUserId(longId)).toBeUndefined();
  });

  it('accepts IDs at boundary lengths', () => {
    const minLengthId = 'a'.repeat(MIN_USER_ID_LENGTH);
    const maxLengthId = 'a'.repeat(MAX_USER_ID_LENGTH);
    expect(validateUserId(minLengthId)).toBe(minLengthId);
    expect(validateUserId(maxLengthId)).toBe(maxLengthId);
  });

  it('returns undefined for IDs with invalid characters', () => {
    expect(validateUserId('user<script>')).toBeUndefined();
    expect(validateUserId('user with spaces')).toBeUndefined();
    expect(validateUserId('user$pecial')).toBeUndefined();
    expect(validateUserId('user!name')).toBeUndefined();
  });

  it('accepts IDs with allowed special characters', () => {
    expect(validateUserId('user-name')).toBe('user-name');
    expect(validateUserId('user_name')).toBe('user_name');
    expect(validateUserId('user.name')).toBe('user.name');
    expect(validateUserId('user@domain')).toBe('user@domain');
    expect(validateUserId('user:group')).toBe('user:group');
  });
});

describe('isValidUserId', () => {
  it('returns true for valid user IDs', () => {
    expect(isValidUserId('user123')).toBe(true);
    expect(isValidUserId('valid-user-id')).toBe(true);
    expect(isValidUserId('user@domain.com')).toBe(true);
  });

  it('returns false for invalid user IDs', () => {
    expect(isValidUserId('')).toBe(false);
    expect(isValidUserId(undefined)).toBe(false);
    expect(isValidUserId('ab')).toBe(false);
    expect(isValidUserId('invalid<id>')).toBe(false);
  });

  it('acts as a type guard', () => {
    const maybeId: string | undefined = 'valid-id';
    if (isValidUserId(maybeId)) {
      // TypeScript should narrow the type to string
      const id: string = maybeId;
      expect(id).toBe('valid-id');
    }
  });
});

// ============================================================================
// UTILS
// ============================================================================

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns promise result when it resolves before timeout', async () => {
    const promise = Promise.resolve('success');
    const resultPromise = withTimeout(promise, 1000, 'test-operation');
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('returns null when promise times out', async () => {
    const neverResolves = new Promise(() => {});
    const resultPromise = withTimeout(neverResolves, 100, 'test-operation', 'session-123');

    // Advance timers past the timeout
    vi.advanceTimersByTime(150);
    const result = await resultPromise;
    expect(result).toBeNull();
  });

  it('handles immediate resolution', async () => {
    const promise = Promise.resolve({ data: 'value' });
    const result = await withTimeout(promise, 1000, 'immediate');
    expect(result).toEqual({ data: 'value' });
  });
});

describe('generateFallbackSummary', () => {
  it('uses topics when available', () => {
    const turns: Array<{ role: string; content: string }> = [];
    const topics = ['career goals', 'work-life balance', 'stress management'];
    const result = generateFallbackSummary(turns, topics, 15);
    expect(result).toBe('Chatted about career goals, work-life balance, stress management');
  });

  it('limits topics to first 3', () => {
    const turns: Array<{ role: string; content: string }> = [];
    const topics = ['topic1', 'topic2', 'topic3', 'topic4', 'topic5'];
    const result = generateFallbackSummary(turns, topics, 10);
    expect(result).toBe('Chatted about topic1, topic2, topic3');
  });

  it('falls back to user turns when no topics', () => {
    const turns = [
      { role: 'user', content: 'How do I improve my productivity?' },
      { role: 'assistant', content: 'Let me share some tips.' },
      { role: 'user', content: 'What about time management?' },
    ];
    const result = generateFallbackSummary(turns, [], 10);
    expect(result).toContain('Discussed:');
    expect(result).toContain('productivity');
  });

  it('uses last 3 user turns for summary', () => {
    const turns = [
      { role: 'user', content: 'First message that should not appear.' },
      { role: 'user', content: 'Second message.' },
      { role: 'user', content: 'Third message.' },
      { role: 'user', content: 'Fourth message.' },
    ];
    const result = generateFallbackSummary(turns, [], 10);
    expect(result).not.toContain('First message');
  });

  it('generates duration-based fallback when only assistant turns', () => {
    const turns = [
      { role: 'assistant', content: 'Hello!' },
      { role: 'assistant', content: 'How are you?' },
    ];
    const result = generateFallbackSummary(turns, [], 15);
    expect(result).toBe('Had a 15-minute conversation');
  });

  it('generates date-based fallback when no turns', () => {
    const result = generateFallbackSummary([], [], 0);
    expect(result).toContain('Connected on');
    expect(result).toMatch(/Connected on \d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('uses 1 minute as minimum duration', () => {
    const turns = [{ role: 'assistant', content: 'Hello!' }];
    const result = generateFallbackSummary(turns, [], 0);
    expect(result).toBe('Had a 1-minute conversation');
  });

  it('truncates long user messages in summary', () => {
    const longMessage = 'a'.repeat(100);
    const turns = [{ role: 'user', content: longMessage }];
    const result = generateFallbackSummary(turns, [], 10);
    expect(result.length).toBeLessThan(100);
  });
});

describe('calculateSpeakingPace', () => {
  it('returns slow for WPM below 120', () => {
    expect(calculateSpeakingPace(100)).toBe('slow');
    expect(calculateSpeakingPace(119)).toBe('slow');
    expect(calculateSpeakingPace(80)).toBe('slow');
    expect(calculateSpeakingPace(0)).toBe('slow');
  });

  it('returns moderate for WPM between 120 and 180', () => {
    expect(calculateSpeakingPace(120)).toBe('moderate');
    expect(calculateSpeakingPace(150)).toBe('moderate');
    expect(calculateSpeakingPace(180)).toBe('moderate');
  });

  it('returns fast for WPM above 180', () => {
    expect(calculateSpeakingPace(181)).toBe('fast');
    expect(calculateSpeakingPace(200)).toBe('fast');
    expect(calculateSpeakingPace(250)).toBe('fast');
  });

  it('handles boundary values correctly', () => {
    expect(calculateSpeakingPace(119)).toBe('slow');
    expect(calculateSpeakingPace(120)).toBe('moderate');
    expect(calculateSpeakingPace(180)).toBe('moderate');
    expect(calculateSpeakingPace(181)).toBe('fast');
  });
});

describe('blendWPM', () => {
  it('returns session WPM when no profile WPM', () => {
    expect(blendWPM(150, undefined)).toBe(150);
    expect(blendWPM(120, undefined)).toBe(120);
  });

  it('blends session and profile WPM with 70/30 weighting', () => {
    // 150 * 0.7 + 100 * 0.3 = 105 + 30 = 135
    expect(blendWPM(150, 100)).toBe(135);

    // 100 * 0.7 + 200 * 0.3 = 70 + 60 = 130
    expect(blendWPM(100, 200)).toBe(130);
  });

  it('rounds to nearest integer', () => {
    // 123 * 0.7 + 147 * 0.3 = 86.1 + 44.1 = 130.2 → 130
    expect(blendWPM(123, 147)).toBe(130);
  });

  it('handles equal session and profile WPM', () => {
    // 150 * 0.7 + 150 * 0.3 = 105 + 45 = 150
    expect(blendWPM(150, 150)).toBe(150);
  });

  it('gives more weight to session WPM', () => {
    const sessionWPM = 200;
    const profileWPM = 100;
    const blended = blendWPM(sessionWPM, profileWPM);
    // Blended should be closer to session than profile
    expect(blended - profileWPM).toBeGreaterThan(sessionWPM - blended);
  });
});

describe('paceToWPM', () => {
  it('returns 110 for slow pace', () => {
    expect(paceToWPM('slow')).toBe(110);
  });

  it('returns 150 for moderate pace', () => {
    expect(paceToWPM('moderate')).toBe(150);
  });

  it('returns 180 for fast pace', () => {
    expect(paceToWPM('fast')).toBe(180);
  });

  it('handles all pace values', () => {
    const paces: Array<'slow' | 'moderate' | 'fast'> = ['slow', 'moderate', 'fast'];
    paces.forEach((pace) => {
      const wpm = paceToWPM(pace);
      expect(typeof wpm).toBe('number');
      expect(wpm).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Session Manager Utilities', () => {
  it('validates and processes user ID flow', () => {
    const input = 'user-12345';

    // Step 1: Validate
    const validatedId = validateUserId(input);
    expect(validatedId).toBe(input);

    // Step 2: Type guard check
    expect(isValidUserId(validatedId)).toBe(true);
  });

  it('combines pace utilities', () => {
    // Start with WPM
    const wpm = 140;
    const pace = calculateSpeakingPace(wpm);
    expect(pace).toBe('moderate');

    // Convert back to WPM estimate
    const estimatedWPM = paceToWPM(pace);
    expect(estimatedWPM).toBe(150);

    // Blend with session WPM
    const blended = blendWPM(wpm, estimatedWPM);
    expect(blended).toBe(Math.round(140 * 0.7 + 150 * 0.3)); // 143
  });

  it('generates appropriate summaries for different scenarios', () => {
    // Scenario 1: Topics available
    const withTopics = generateFallbackSummary([], ['finances', 'goals'], 10);
    expect(withTopics).toContain('finances');

    // Scenario 2: User messages only
    const withMessages = generateFallbackSummary(
      [{ role: 'user', content: 'Planning my budget' }],
      [],
      5
    );
    expect(withMessages).toContain('budget');

    // Scenario 3: Empty conversation
    const empty = generateFallbackSummary([], [], 0);
    expect(empty).toContain('Connected on');
  });
});
