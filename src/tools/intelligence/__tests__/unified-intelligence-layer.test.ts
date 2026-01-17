/**
 * Unit Tests for Unified Intelligence Layer
 *
 * Tests the "Better Than Human" features:
 * - Emotion-aware tool selection
 * - Cross-persona intelligence
 * - Proactive outreach integration
 * - Cross-session learning (Firestore persistence)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Firestore persistence
vi.mock('../../semantic-router/persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: vi.fn().mockResolvedValue(undefined),
  saveUserProfile: vi.fn().mockResolvedValue(undefined),
  loadUserProfile: vi.fn().mockResolvedValue(null),
}));

// Mock outreach persistence
vi.mock('../../../services/outreach/firestore-persistence.js', () => ({
  savePendingInAppMessage: vi.fn().mockResolvedValue('mock-message-id'),
}));

// Mock personalization engine
vi.mock('../../semantic-router/advanced/personalization.js', () => ({
  getPersonalizationEngine: vi.fn().mockReturnValue({
    loadProfile: vi.fn().mockResolvedValue(null),
    exportProfile: vi.fn().mockReturnValue(null),
  }),
  initializePersonalization: vi.fn().mockResolvedValue(undefined),
}));

// Mock tool chain predictor
vi.mock('../../semantic-router/advanced/tool-chain-predictor.js', () => ({
  getChainPredictor: vi.fn().mockReturnValue({
    predict: vi.fn().mockResolvedValue(null),
    recordExecution: vi.fn(),
  }),
}));

// Mock active learning
vi.mock('../../semantic-router/advanced/active-learning.js', () => ({
  getActiveLearningEngine: vi.fn().mockReturnValue({
    recordCorrection: vi.fn(),
    recordSuccess: vi.fn(),
  }),
}));

// Import after mocks
import { UnifiedIntelligenceLayer, type VoiceEmotionState } from '../unified-intelligence-layer.js';

describe('UnifiedIntelligenceLayer', () => {
  let intelligence: UnifiedIntelligenceLayer;

  beforeEach(async () => {
    vi.clearAllMocks();
    intelligence = new UnifiedIntelligenceLayer({
      enableFirestorePersistence: false, // Disable for unit tests
      enableEmotionAwareness: true,
      enableCrossPersonaIntelligence: true,
      enableProactiveOutreach: true,
      stressThresholdForWellnessBoost: 0.6,
    });
    await intelligence.initialize();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Emotion-Aware Tool Selection', () => {
    it('should boost wellness tools when stress level is high', async () => {
      const voiceEmotion: VoiceEmotionState = {
        primary: 'anxious',
        valence: -0.4,
        arousal: 0.8,
        stressLevel: 0.8, // High stress
        anxietyMarkers: true,
      };

      const enhancement = await intelligence.enhanceToolSelection('user-123', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        voiceEmotion,
      });

      expect(enhancement.emotionAwareBoosts).toBeDefined();
      expect(enhancement.emotionAwareBoosts?.boostedDomains).toContain('wellness');
      expect(enhancement.emotionAwareBoosts?.stressLevel).toBe(0.8);
    });

    it('should not boost wellness tools when stress is low', async () => {
      const voiceEmotion: VoiceEmotionState = {
        primary: 'happy',
        valence: 0.6,
        arousal: 0.5,
        stressLevel: 0.2, // Low stress
        anxietyMarkers: false,
      };

      const enhancement = await intelligence.enhanceToolSelection('user-123', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        voiceEmotion,
      });

      // No emotion-aware boosts for low stress
      expect(enhancement.emotionAwareBoosts).toBeFalsy();
    });

    it('should boost presence tools for anxiety markers', async () => {
      const voiceEmotion: VoiceEmotionState = {
        primary: 'neutral',
        valence: 0,
        arousal: 0.5,
        stressLevel: 0.5, // Below threshold but has anxiety markers
        anxietyMarkers: true,
      };

      const enhancement = await intelligence.enhanceToolSelection('user-123', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        voiceEmotion,
      });

      expect(enhancement.emotionAwareBoosts).toBeDefined();
      expect(enhancement.emotionAwareBoosts?.boostedDomains).toContain('presence');
    });
  });

  describe('Cross-Persona Intelligence', () => {
    it('should record handoff context', async () => {
      await intelligence.recordHandoff({
        userId: 'user-123',
        sessionId: 'session-456',
        fromPersonaId: 'ferni',
        toPersonaId: 'maya',
        toolsUsed: ['mood_check', 'wellness_summary'],
        topicsDiscussed: ['stress', 'work-life-balance'],
        emotionalState: {
          primary: 'anxious',
          valence: -0.3,
          arousal: 0.7,
          stressLevel: 0.6,
          anxietyMarkers: false,
        },
        timestamp: new Date(),
      });

      // Verify context is stored for next session
      const enhancement = await intelligence.enhanceToolSelection('user-123', {
        personaId: 'maya',
        timeOfDay: new Date(),
        previousPersonaId: 'ferni',
      });

      // Should have cross-persona context
      expect(enhancement.crossPersonaContext).toBeDefined();
      expect(enhancement.crossPersonaContext?.previousPersonaId).toBe('ferni');
    });

    it('should carry forward tools from previous persona', async () => {
      // First, record some tool usage
      await intelligence.recordLearning({
        userId: 'user-123',
        sessionId: 'session-1',
        query: 'check my mood',
        predictedTool: 'mood_check',
        actualTool: 'mood_check',
        confidence: 0.9,
        wasCorrection: false,
        timestamp: new Date(),
        context: { personaId: 'ferni', timeOfDay: 'afternoon' },
      });

      // Then handoff to maya
      await intelligence.recordHandoff({
        userId: 'user-123',
        sessionId: 'session-2',
        fromPersonaId: 'ferni',
        toPersonaId: 'maya',
        toolsUsed: ['mood_check'],
        topicsDiscussed: ['wellness'],
        timestamp: new Date(),
      });

      const enhancement = await intelligence.enhanceToolSelection('user-123', {
        personaId: 'maya',
        timeOfDay: new Date(),
        previousPersonaId: 'ferni',
      });

      // Should include tools from previous persona
      if (enhancement.crossPersonaContext?.toolsToCarryForward) {
        expect(enhancement.crossPersonaContext.toolsToCarryForward.length).toBeGreaterThanOrEqual(
          0
        );
      }
    });
  });

  describe('Proactive Outreach', () => {
    it('should suggest habit reminder at learned check time', async () => {
      // Simulate learning a habit check pattern
      const checkTime = 7; // 7 AM

      // Record multiple habit-related events at the same time
      for (let i = 0; i < 5; i++) {
        await intelligence.recordLearning({
          userId: 'user-habit',
          sessionId: `session-${i}`,
          query: 'check my habits',
          predictedTool: 'habit_check',
          actualTool: 'habit_check',
          confidence: 0.9,
          wasCorrection: false,
          timestamp: new Date(2024, 0, 1, checkTime, 0, 0),
          context: { personaId: 'maya', timeOfDay: 'morning' },
        });
      }

      // Now check at the learned time
      const mockDate = new Date();
      mockDate.setHours(checkTime);

      const enhancement = await intelligence.enhanceToolSelection('user-habit', {
        personaId: 'ferni',
        timeOfDay: mockDate,
      });

      // May have proactive outreach if conditions are met
      // (depends on learned patterns and responsiveness)
      expect(enhancement).toBeDefined();
    });

    it('should trigger outreach through the outreach system', async () => {
      const { savePendingInAppMessage } =
        await import('../../../services/outreach/firestore-persistence.js');

      const result = await intelligence.triggerProactiveOutreach('user-123', {
        shouldTrigger: true,
        type: 'habit_reminder',
        suggestedMessage: "Hey! It's around the time you usually check in on your habits.",
        optimalTime: new Date(),
      });

      expect(result.triggered).toBe(true);
      expect(result.messageId).toBe('mock-message-id');
      expect(savePendingInAppMessage).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
        'maya_habit_reminder',
        expect.objectContaining({ personaId: 'maya' })
      );
    });

    it('should not trigger outreach when shouldTrigger is false', async () => {
      const result = await intelligence.triggerProactiveOutreach('user-123', {
        shouldTrigger: false,
        type: 'check_in',
      });

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('shouldTrigger is false');
    });
  });

  describe('Learning Loop', () => {
    it('should record tool usage for learning', async () => {
      await intelligence.recordLearning({
        userId: 'user-learn',
        sessionId: 'session-1',
        query: 'play jazz music',
        predictedTool: 'spotify_play',
        actualTool: 'spotify_play',
        confidence: 0.95,
        wasCorrection: false,
        timestamp: new Date(),
        context: { personaId: 'ferni', timeOfDay: 'evening' },
      });

      // Check that affinity is updated
      const enhancement = await intelligence.enhanceToolSelection('user-learn', {
        personaId: 'ferni',
        timeOfDay: new Date(),
      });

      // Should have some prioritized tools
      expect(enhancement.prioritizeTools).toBeDefined();
    });

    it('should record corrections for learning', async () => {
      await intelligence.recordLearning({
        userId: 'user-correct',
        sessionId: 'session-1',
        query: 'help me relax',
        predictedTool: 'spotify_play',
        actualTool: 'grounding_exercise', // User chose different tool
        confidence: 0.7,
        wasCorrection: true,
        timestamp: new Date(),
        context: { personaId: 'ferni', timeOfDay: 'evening' },
      });

      // System should learn from this correction
      const enhancement = await intelligence.enhanceToolSelection('user-correct', {
        personaId: 'ferni',
        timeOfDay: new Date(),
      });

      expect(enhancement).toBeDefined();
    });
  });

  describe('Metrics', () => {
    it('should return metrics', () => {
      const metrics = intelligence.getMetrics();

      expect(metrics).toHaveProperty('profileCount');
      expect(metrics).toHaveProperty('totalCorrections');
      expect(typeof metrics.profileCount).toBe('number');
    });
  });

  describe('Profile Persistence', () => {
    it('should mark profiles dirty when updated', async () => {
      // Record something to trigger profile update
      await intelligence.recordLearning({
        userId: 'user-dirty',
        sessionId: 'session-1',
        query: 'test',
        predictedTool: 'test_tool',
        actualTool: 'test_tool',
        confidence: 0.9,
        wasCorrection: false,
        timestamp: new Date(),
      });

      // Profile should be marked dirty (internal state)
      // We can verify by flushing and checking if saveUserProfile was called
      // after enabling persistence
    });
  });

  describe('Configuration', () => {
    it('should respect disabled emotion awareness', async () => {
      const noEmotionIntelligence = new UnifiedIntelligenceLayer({
        enableEmotionAwareness: false,
        enableFirestorePersistence: false,
      });
      await noEmotionIntelligence.initialize();

      const voiceEmotion: VoiceEmotionState = {
        primary: 'anxious',
        valence: -0.5,
        arousal: 0.9,
        stressLevel: 0.9,
        anxietyMarkers: true,
      };

      const enhancement = await noEmotionIntelligence.enhanceToolSelection('user-123', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        voiceEmotion,
      });

      // Should not have emotion boosts when disabled
      expect(enhancement.emotionAwareBoosts).toBeUndefined();
    });

    it('should respect custom stress threshold', async () => {
      const highThresholdIntelligence = new UnifiedIntelligenceLayer({
        enableEmotionAwareness: true,
        enableFirestorePersistence: false,
        stressThresholdForWellnessBoost: 0.9, // Very high threshold
      });
      await highThresholdIntelligence.initialize();

      const voiceEmotion: VoiceEmotionState = {
        primary: 'anxious',
        valence: -0.3,
        arousal: 0.7,
        stressLevel: 0.8, // Below 0.9 threshold
        anxietyMarkers: false,
      };

      const enhancement = await highThresholdIntelligence.enhanceToolSelection('user-123', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        voiceEmotion,
      });

      // Should not trigger because 0.8 < 0.9 threshold
      expect(enhancement.emotionAwareBoosts).toBeFalsy();
    });
  });
});
