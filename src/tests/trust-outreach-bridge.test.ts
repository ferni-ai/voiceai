/**
 * Trust Outreach Bridge Tests
 *
 * Tests for the trust-based outreach system that connects
 * "better than human" intelligence to proactive outreach.
 *
 * Note: These are integration tests that verify the public API
 * works correctly. More detailed unit tests would require
 * mocking at the module level which is complex in this architecture.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockIsOutreachTriggerCreationEnabled = vi.fn(() => true);

vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../config/feature-flags.js', () => ({
  isOutreachTriggerCreationEnabled: mockIsOutreachTriggerCreationEnabled,
}));

// Import after mocks
import {
  evaluateTrustBasedOutreach,
  handleConcernDetection,
  shouldAvoidOutreachTopic,
  runTrustBasedOutreachBatch,
} from '../services/outreach/trust-outreach-bridge.js';

// ============================================================================
// FEATURE FLAG TESTS
// ============================================================================

describe('Trust Outreach Bridge - Feature Flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
  });

  it('should skip evaluation when feature flag is disabled', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(false);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(result.triggersCreated).toBe(0);
    expect(result.triggerTypes).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('should proceed when feature flag is enabled', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const result = await evaluateTrustBasedOutreach('user-123');

    // Should return a valid result object
    expect(result).toHaveProperty('triggersCreated');
    expect(result).toHaveProperty('triggerTypes');
    expect(result).toHaveProperty('skipped');
  });

  it('should skip e2e-test users', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const result = await evaluateTrustBasedOutreach('e2e-test-user');

    expect(result.triggersCreated).toBe(0);
  });

  it('should skip test- prefixed users', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const result = await evaluateTrustBasedOutreach('test-user-123');

    expect(result.triggersCreated).toBe(0);
  });

  it('should skip users with -test- in their ID', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const result = await evaluateTrustBasedOutreach('some-test-user');

    expect(result.triggersCreated).toBe(0);
  });
});

// ============================================================================
// CONCERN DETECTION TESTS
// ============================================================================

describe('Trust Outreach Bridge - Concern Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not trigger for mild concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'mild',
      concernType: 'slight worry',
      lastMessage: 'Things are mostly fine',
    });

    expect(result).toBe(false);
  });

  it('should not trigger for no concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'none',
      concernType: 'none',
      lastMessage: 'Everything is great!',
    });

    expect(result).toBe(false);
  });

  it('should handle moderate concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'moderate',
      concernType: 'anxiety',
      lastMessage: 'I guess things are okay...',
      detectedEmotion: 'anxious',
    });

    // Should return boolean (true if trigger published, false if not)
    expect(typeof result).toBe('boolean');
  });

  it('should handle elevated concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'elevated',
      concernType: 'depression',
      lastMessage: "I'm okay, really",
      detectedEmotion: 'sad',
    });

    expect(typeof result).toBe('boolean');
  });

  it('should handle crisis level concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'crisis',
      concernType: 'severe distress',
      lastMessage: "I don't know anymore...",
      detectedEmotion: 'overwhelmed',
    });

    expect(typeof result).toBe('boolean');
  });
});

// ============================================================================
// TOPIC AVOIDANCE TESTS
// ============================================================================

describe('Trust Outreach Bridge - Topic Avoidance', () => {
  it('should return avoidance decision for any topic', () => {
    const result = shouldAvoidOutreachTopic('user-123', 'any topic');

    expect(result).toHaveProperty('avoid');
    expect(typeof result.avoid).toBe('boolean');
  });

  it('should include reason when topic is avoided', () => {
    // Without mocks, this tests the actual behavior
    const result = shouldAvoidOutreachTopic('user-123', 'test topic');

    if (result.avoid) {
      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
    }
  });
});

// ============================================================================
// BATCH PROCESSING TESTS
// ============================================================================

describe('Trust Outreach Bridge - Batch Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
  });

  it('should process multiple users', async () => {
    const userIds = ['user-1', 'user-2', 'user-3'];

    const result = await runTrustBasedOutreachBatch(userIds);

    expect(result.processed).toBe(3);
  });

  it('should return proper result structure', async () => {
    const result = await runTrustBasedOutreachBatch(['user-1', 'user-2']);

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('totalTriggers');
    expect(result).toHaveProperty('byType');
    expect(typeof result.processed).toBe('number');
    expect(typeof result.totalTriggers).toBe('number');
    expect(typeof result.byType).toBe('object');
  });

  it('should skip test users in batch', async () => {
    const result = await runTrustBasedOutreachBatch(['test-user-1', 'e2e-test-2']);

    // Test users should be processed but create no triggers
    expect(result.processed).toBe(2);
    expect(result.totalTriggers).toBe(0);
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Trust Outreach Bridge - Result Structures', () => {
  beforeEach(() => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
  });

  it('evaluateTrustBasedOutreach returns proper structure', async () => {
    const result = await evaluateTrustBasedOutreach('user-123');

    expect(result).toEqual({
      triggersCreated: expect.any(Number),
      triggerTypes: expect.any(Array),
      skipped: expect.any(Array),
    });
  });

  it('runTrustBasedOutreachBatch returns proper structure', async () => {
    const result = await runTrustBasedOutreachBatch(['user-1']);

    expect(result).toEqual({
      processed: expect.any(Number),
      totalTriggers: expect.any(Number),
      byType: expect.any(Object),
    });
  });
});
