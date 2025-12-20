/**
 * Trust Outreach Bridge Tests
 *
 * Tests for the trust-based outreach system that connects
 * "better than human" intelligence to proactive outreach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SETUP - Define mock functions first
// ============================================================================

const mockIsOutreachTriggerCreationEnabled = vi.fn(() => true);
const mockPublishOutreachTrigger = vi.fn().mockResolvedValue({ success: true, triggerId: 'test-trigger-1' });
const mockGetDueMoments = vi.fn(() => []);
const mockGenerateThinkingOfYouMoments = vi.fn(() => []);
const mockGenerateRandomWarmth = vi.fn(() => null);
const mockMarkMomentSent = vi.fn();
const mockGetUncelebratedWins = vi.fn(() => []);
const mockGenerateCelebration = vi.fn(() => null);
const mockGetOverdueIntentions = vi.fn(() => []);
const mockGenerateIntentionFollowUp = vi.fn(() => ({
  question: 'How did it go?',
  tone: 'curious',
  ssml: '<speak>How did it go?</speak>',
}));
const mockGetUnreflectedGrowth = vi.fn(() => []);
const mockGenerateGrowthReflection = vi.fn(() => null);
const mockDetectUnsaidSignals = vi.fn(() => []);
const mockGetAvoidedTopics = vi.fn(() => []);
const mockCheckBoundary = vi.fn(() => ({ crossesBoundary: false }));
const mockGetActiveBoundaries = vi.fn(() => []);
const mockGetProactiveRememberWhen = vi.fn(() => null);
const mockEvaluateLifeRhythmOutreach = vi.fn(() => ({ triggered: false }));
const mockTriggerLifeRhythmOutreach = vi.fn().mockResolvedValue(false);
const mockCheckForMemoryBasedOutreach = vi.fn().mockResolvedValue([]);
const mockSyncMemoriesToOutreachContext = vi.fn().mockResolvedValue(undefined);

// Apply mocks
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

vi.mock('../outreach/trigger-publisher.js', () => ({
  publishOutreachTrigger: mockPublishOutreachTrigger,
}));

vi.mock('../trust-systems/thinking-of-you.js', () => ({
  getDueMoments: mockGetDueMoments,
  generateThinkingOfYouMoments: mockGenerateThinkingOfYouMoments,
  generateRandomWarmth: mockGenerateRandomWarmth,
  markMomentSent: mockMarkMomentSent,
}));

vi.mock('../trust-systems/small-wins.js', () => ({
  getUncelebratedWins: mockGetUncelebratedWins,
  generateCelebration: mockGenerateCelebration,
  getOverdueIntentions: mockGetOverdueIntentions,
  getPendingIntentions: vi.fn(() => []),
  generateIntentionFollowUp: mockGenerateIntentionFollowUp,
}));

vi.mock('../trust-systems/growth-reflection.js', () => ({
  getUnreflectedGrowth: mockGetUnreflectedGrowth,
  generateGrowthReflection: mockGenerateGrowthReflection,
}));

vi.mock('../trust-systems/reading-between-lines.js', () => ({
  detectUnsaidSignals: mockDetectUnsaidSignals,
  getAvoidedTopics: mockGetAvoidedTopics,
}));

vi.mock('../trust-systems/boundary-memory.js', () => ({
  checkBoundary: mockCheckBoundary,
  getActiveBoundaries: mockGetActiveBoundaries,
}));

vi.mock('../trust-systems/our-songs.js', () => ({
  getProactiveRememberWhen: mockGetProactiveRememberWhen,
}));

vi.mock('../outreach/life-rhythm-outreach.js', () => ({
  evaluateLifeRhythmOutreach: mockEvaluateLifeRhythmOutreach,
  triggerLifeRhythmOutreach: mockTriggerLifeRhythmOutreach,
}));

vi.mock('../outreach/superhuman-outreach-integration.js', () => ({
  checkForMemoryBasedOutreach: mockCheckForMemoryBasedOutreach,
  syncMemoriesToOutreachContext: mockSyncMemoriesToOutreachContext,
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
    expect(mockPublishOutreachTrigger).not.toHaveBeenCalled();
  });

  it('should proceed when feature flag is enabled', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(result).toBeDefined();
  });

  it('should skip test users', async () => {
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);

    const testUserIds = [
      'e2e-test-user',
      'test-user-123',
      'some-test-user',
    ];

    for (const userId of testUserIds) {
      const result = await evaluateTrustBasedOutreach(userId);
      expect(result.triggersCreated).toBe(0);
    }
  });
});

// ============================================================================
// THINKING OF YOU TESTS
// ============================================================================

describe('Trust Outreach Bridge - Thinking of You', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
    mockGetDueMoments.mockReturnValue([]);
    mockGenerateRandomWarmth.mockReturnValue(null);
    mockGetActiveBoundaries.mockReturnValue([]);
  });

  it('should publish trigger for due moments', async () => {
    const mockMoment = {
      id: 'moment-1',
      type: 'check_in',
      message: 'Hey! How are things going?',
      ssml: '<speak>Hey! How are things going?</speak>',
      priority: 'medium' as const,
      suggestedTiming: new Date(),
      trigger: {
        type: 'pattern' as const,
        context: 'work stress',
      },
    };

    mockGetDueMoments.mockReturnValue([mockMoment]);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'thinking_of_you',
        priority: 'medium',
      })
    );
    expect(result.triggersCreated).toBeGreaterThanOrEqual(1);
    expect(result.triggerTypes).toContain('thinking_of_you');
  });

  it('should skip moments that violate boundaries', async () => {
    const mockMoment = {
      id: 'moment-1',
      type: 'check_in',
      message: 'How is your relationship going?',
      ssml: '<speak>How is your relationship going?</speak>',
      priority: 'medium' as const,
      suggestedTiming: new Date(),
      trigger: {
        type: 'pattern' as const,
        context: 'relationship',
      },
    };

    mockGetDueMoments.mockReturnValue([mockMoment]);
    mockGetActiveBoundaries.mockReturnValue([
      { topic: 'relationship', level: 'hard' as const, set: new Date(), reason: 'User requested' },
    ]);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.skipped[0].reason).toContain('boundary');
  });

  it('should publish random warmth when appropriate', async () => {
    const mockWarmth = {
      id: 'warmth-1',
      type: 'random_warmth',
      message: 'Just thinking of you!',
      ssml: '<speak>Just thinking of you!</speak>',
      priority: 'low' as const,
      suggestedTiming: new Date(),
      trigger: {
        type: 'random' as const,
        context: '',
      },
    };

    mockGenerateRandomWarmth.mockReturnValue(mockWarmth);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(mockPublishOutreachTrigger).toHaveBeenCalled();
    expect(result.triggerTypes).toContain('random_warmth');
  });
});

// ============================================================================
// CELEBRATION TESTS
// ============================================================================

describe('Trust Outreach Bridge - Celebrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
    mockGetUncelebratedWins.mockReturnValue([]);
  });

  it('should publish celebration for uncelebrated wins', async () => {
    const mockWin = {
      id: 'win-1',
      type: 'habit_streak',
      description: '7-day meditation streak',
      timestamp: new Date(),
      celebrated: false,
      significance: 'notable' as const,
    };

    const mockCelebration = {
      win: mockWin,
      celebration: 'Amazing! 7 days of meditation!',
      ssml: '<speak>Amazing! 7 days of meditation!</speak>',
      intensity: 'big' as const,
    };

    mockGetUncelebratedWins.mockReturnValue([mockWin]);
    mockGenerateCelebration.mockReturnValue(mockCelebration);

    const result = await evaluateTrustBasedOutreach('user-123');

    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'celebration',
        priority: 'high', // 'big' intensity = high priority
      })
    );
    expect(result.triggerTypes).toContain('celebration');
  });
});

// ============================================================================
// CONCERN DETECTION TESTS
// ============================================================================

describe('Trust Outreach Bridge - Concern Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectUnsaidSignals.mockReturnValue([]);
  });

  it('should schedule outreach for moderate concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'moderate',
      concernType: 'anxiety',
      lastMessage: 'I guess things are fine...',
      detectedEmotion: 'anxious',
    });

    expect(result).toBe(true);
    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'emotional_support',
        priority: 'medium',
      })
    );
  });

  it('should schedule high priority for elevated concern', async () => {
    await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'elevated',
      concernType: 'depression',
      lastMessage: "I'm okay, really",
      detectedEmotion: 'sad',
    });

    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'high',
      })
    );
  });

  it('should schedule urgent priority for crisis', async () => {
    await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'crisis',
      concernType: 'severe distress',
      lastMessage: "I don't know anymore...",
      detectedEmotion: 'overwhelmed',
    });

    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'urgent',
      })
    );
  });

  it('should not trigger for mild concern', async () => {
    const result = await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'mild',
      concernType: 'slight worry',
      lastMessage: 'Things are mostly fine',
    });

    expect(result).toBe(false);
    expect(mockPublishOutreachTrigger).not.toHaveBeenCalled();
  });

  it('should include unsaid signal context when detected', async () => {
    mockDetectUnsaidSignals.mockReturnValue([
      {
        type: 'minimizing_pain',
        observation: 'User said "I guess" before positive statement',
        underlying: 'possible discomfort',
        confidence: 0.8,
        approach: 'gentle_exploration',
        phrase: "It sounds like there might be more to that...",
      },
    ]);

    await handleConcernDetection({
      userId: 'user-123',
      concernLevel: 'moderate',
      concernType: 'masking',
      lastMessage: 'I guess everything is great',
    });

    expect(mockPublishOutreachTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          metadata: expect.objectContaining({
            unsaidSignal: expect.objectContaining({
              type: 'minimizing_pain',
            }),
          }),
        }),
      })
    );
  });
});

// ============================================================================
// TOPIC AVOIDANCE TESTS
// ============================================================================

describe('Trust Outreach Bridge - Topic Avoidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckBoundary.mockReturnValue({ crossesBoundary: false });
    mockGetAvoidedTopics.mockReturnValue([]);
  });

  it('should avoid topics with explicit boundaries', () => {
    mockCheckBoundary.mockReturnValue({
      crossesBoundary: true,
      recommendation: 'avoid_completely',
    });

    const result = shouldAvoidOutreachTopic('user-123', 'divorce');

    expect(result.avoid).toBe(true);
    expect(result.reason).toContain('boundary');
  });

  it('should avoid consistently avoided topics', () => {
    mockCheckBoundary.mockReturnValue({ crossesBoundary: false });
    mockGetAvoidedTopics.mockReturnValue(['family', 'money']);

    const result = shouldAvoidOutreachTopic('user-123', 'family issues');

    expect(result.avoid).toBe(true);
    expect(result.reason).toContain('avoided');
  });

  it('should allow safe topics', () => {
    mockCheckBoundary.mockReturnValue({ crossesBoundary: false });
    mockGetAvoidedTopics.mockReturnValue([]);

    const result = shouldAvoidOutreachTopic('user-123', 'meditation progress');

    expect(result.avoid).toBe(false);
  });
});

// ============================================================================
// BATCH PROCESSING TESTS
// ============================================================================

describe('Trust Outreach Bridge - Batch Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOutreachTriggerCreationEnabled.mockReturnValue(true);
    mockGetDueMoments.mockReturnValue([]);
    mockGenerateRandomWarmth.mockReturnValue(null);
    mockGetActiveBoundaries.mockReturnValue([]);
    mockGetUncelebratedWins.mockReturnValue([]);
    mockGetUnreflectedGrowth.mockReturnValue([]);
    mockGetOverdueIntentions.mockReturnValue([]);
    mockGetProactiveRememberWhen.mockReturnValue(null);
    mockEvaluateLifeRhythmOutreach.mockReturnValue({ triggered: false });
  });

  it('should process multiple users', async () => {
    const userIds = ['user-1', 'user-2', 'user-3'];

    const result = await runTrustBasedOutreachBatch(userIds);

    expect(result.processed).toBe(3);
  });

  it('should aggregate trigger counts', async () => {
    const mockWarmth = {
      id: 'warmth-1',
      type: 'random_warmth',
      message: 'Hey!',
      ssml: '<speak>Hey!</speak>',
      priority: 'low' as const,
      suggestedTiming: new Date(),
      trigger: { type: 'random' as const, context: '' },
    };

    mockGenerateRandomWarmth.mockReturnValue(mockWarmth);

    const result = await runTrustBasedOutreachBatch(['user-1', 'user-2']);

    expect(result.totalTriggers).toBeGreaterThanOrEqual(2);
  });

  it('should continue on individual user errors', async () => {
    let callCount = 0;
    mockGetDueMoments.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Test error');
      }
      return [];
    });

    const result = await runTrustBasedOutreachBatch(['user-fail', 'user-ok']);

    // Should still process at least 1 user even if 1 failed
    expect(result.processed).toBeGreaterThanOrEqual(1);
  });
});
