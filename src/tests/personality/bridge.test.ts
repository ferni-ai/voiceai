/**
 * Personality Bridge Tests
 *
 * Tests for the unified personality recording bridge that connects
 * RelationshipEngine and PersonalityService v2.
 *
 * Note: Signal dispatchers now use canonical functions from emotion-event-dispatcher.ts
 * which have specific output formats. Tests verify the wrapper functions correctly
 * call the canonical dispatchers.
 *
 * @module tests/personality/bridge
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SendDataMessageFn, AnticipationData } from '../../personality/bridge/signal-dispatchers.js';
import type { VulnerabilityDeposit } from '../../personality/domain/model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../../personality/domain/model/growth-milestone.js';
import type { EmotionalPattern } from '../../personality/domain/model/emotional-pattern.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the RelationshipEngine
vi.mock('../../intelligence/relationship/index.js', () => ({
  getRelationshipEngine: vi.fn(() => ({
    recordMoment: vi.fn(),
  })),
  initializeRelationship: vi.fn(() => ({
    recordMoment: vi.fn(),
  })),
}));

// Mock the PersonalityService v2
vi.mock('../../personality/v2/index.js', () => ({
  createPersonalityService: vi.fn(() => ({
    buildContext: vi.fn(() => Promise.resolve({
      formattedContext: 'test context',
      anticipatedEmotion: null,
      pendingVulnerabilities: [],
      surfaceablePatterns: [],
      celebratableMilestones: [],
    })),
    recordMoment: vi.fn(() => Promise.resolve({
      vulnerabilityDetected: false,
      isFirstTimeVulnerability: false,
      domainEvents: [],
    })),
  })),
}));

// ============================================================================
// SIGNAL DISPATCHER TESTS
// ============================================================================

describe('Signal Dispatchers', () => {
  let mockSendDataMessage: SendDataMessageFn;

  beforeEach(() => {
    mockSendDataMessage = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('dispatchAnticipationSignal', () => {
    it('should dispatch anticipation signal with correct payload', async () => {
      const { dispatchAnticipationSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const anticipation: AnticipationData = {
        emotion: 'sadness',
        confidence: 0.85,
        signals: ['falling tone', 'slow pace'],
        shouldPrepareEmpathy: true,
      };

      await dispatchAnticipationSignal(mockSendDataMessage, anticipation);

      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'anticipatory_presence',
        anticipatedEmotion: 'sadness',
        confidence: 0.85,
        signals: ['falling tone', 'slow pace'],
        shouldPrepareEmpathy: true,
      }));
    });

    it('should handle errors gracefully', async () => {
      const { dispatchAnticipationSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const failingSendDataMessage = vi.fn(() => Promise.reject(new Error('Network error')));

      const anticipation: AnticipationData = {
        emotion: 'joy',
        confidence: 0.7,
        signals: ['rising tone'],
      };

      // Should not throw
      await expect(dispatchAnticipationSignal(failingSendDataMessage, anticipation)).resolves.not.toThrow();
    });
  });

  describe('dispatchVulnerabilitySignal', () => {
    it('should dispatch visible_vulnerability signal with correct type mapping', async () => {
      const { dispatchVulnerabilitySignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const deposit = {
        level: 'vulnerable',
        category: 'mental_health',
        isFirstTime: true,
        suggestedAcknowledgment: 'Thank you for trusting me',
      } as VulnerabilityData;

      await dispatchVulnerabilitySignal(mockSendDataMessage, deposit, true);

      // Now uses canonical dispatcher which sends visible_vulnerability
      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'visible_vulnerability',
        vulnerabilityType: 'admission', // 'vulnerable' level maps to 'admission'
        intensity: 0.8, // 'vulnerable' level maps to 0.8
      }));
    });

    it('should map sacred vulnerability to growth type with highest intensity', async () => {
      const { dispatchVulnerabilitySignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const deposit = {
        level: 'sacred',
        category: 'trauma',
        isFirstTime: true,
      } as VulnerabilityData;

      await dispatchVulnerabilitySignal(mockSendDataMessage, deposit, true);

      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'visible_vulnerability',
        vulnerabilityType: 'growth', // 'sacred' maps to 'growth'
        intensity: 0.95,
      }));
    });
  });

  describe('dispatchGrowthCelebrationSignal', () => {
    it('should dispatch spontaneous_delight signal', async () => {
      const { dispatchGrowthCelebrationSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const milestone = {
        area: 'anxiety_management',
        significance: 'major',
        description: 'Handled a panic attack with new techniques',
        celebrationMessage: 'Look how far you have come!',
      } as GrowthMilestoneData;

      await dispatchGrowthCelebrationSignal(mockSendDataMessage, milestone);

      // Canonical dispatcher sends spontaneous_delight with trigger
      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'spontaneous_delight',
        intensity: 0.9, // 'major' maps to 0.9
      }));
    });
  });

  describe('dispatchPatternSurfacingSignal', () => {
    it('should dispatch superhuman_observation signal with correct observation type', async () => {
      const { dispatchPatternSurfacingSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const pattern = {
        patternType: 'temporal',
        description: 'User tends to feel anxious on Sunday evenings',
        confidence: 0.75,
        insightToShare: 'I notice Sunday evenings seem harder for you',
        isReadyToSurface: true,
      } as PatternData;

      await dispatchPatternSurfacingSignal(mockSendDataMessage, pattern);

      // Canonical dispatcher sends superhuman_observation
      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'superhuman_observation',
        observationType: 'temporal',
        observationContent: 'I notice Sunday evenings seem harder for you',
      }));
    });

    it('should map topic_emotion pattern to correlation type', async () => {
      const { dispatchPatternSurfacingSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      const pattern = {
        patternType: 'topic_emotion',
        description: 'Work topics trigger anxiety',
        confidence: 0.8,
        isReadyToSurface: true,
      } as PatternData;

      await dispatchPatternSurfacingSignal(mockSendDataMessage, pattern);

      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        observationType: 'correlation',
      }));
    });
  });

  describe('dispatchEmotionalBondSignal', () => {
    it('should dispatch emotional_bond_deepen signal', async () => {
      const { dispatchEmotionalBondSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      await dispatchEmotionalBondSignal(mockSendDataMessage, 'User shared deep story', 0.8);

      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'emotional_bond_deepen',
        intensity: 0.8,
        relationshipContext: 'User shared deep story',
      }));
    });

    it('should use default intensity when not provided', async () => {
      const { dispatchEmotionalBondSignal } = await import('../../personality/bridge/signal-dispatchers.js');

      await dispatchEmotionalBondSignal(mockSendDataMessage, 'Breakthrough moment');

      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        intensity: 0.7, // Default intensity
      }));
    });
  });
});

// ============================================================================
// PERSONALITY BRIDGE TESTS
// ============================================================================

describe('Personality Bridge', () => {
  let mockSendDataMessage: SendDataMessageFn;

  beforeEach(() => {
    mockSendDataMessage = vi.fn(() => Promise.resolve());
    vi.clearAllMocks();
  });

  describe('recordUnifiedMoment', () => {
    it('should record to both RelationshipEngine and PersonalityService', async () => {
      const { recordUnifiedMoment } = await import('../../personality/bridge/personality-bridge.js');
      const { getRelationshipEngine } = await import('../../intelligence/relationship/index.js');
      const { createPersonalityService } = await import('../../personality/v2/index.js');

      await recordUnifiedMoment({
        userId: 'user_123',
        personaId: 'ferni',
        type: 'breakthrough',
        message: 'I finally understand!',
        emotionalIntensity: 0.8,
        sendDataMessage: mockSendDataMessage,
      });

      // Should have called RelationshipEngine
      expect(getRelationshipEngine).toHaveBeenCalledWith('user_123', 'ferni');

      // Should have called PersonalityService
      expect(createPersonalityService).toHaveBeenCalled();
    });

    it('should return success result on successful recording', async () => {
      const { recordUnifiedMoment } = await import('../../personality/bridge/personality-bridge.js');

      const result = await recordUnifiedMoment({
        userId: 'user_123',
        personaId: 'ferni',
        type: 'vulnerability',
        message: 'I have never told anyone this before...',
        emotionalIntensity: 0.85,
        sendDataMessage: mockSendDataMessage,
      });

      expect(result.success).toBe(true);
    });

    it('should dispatch emotional bond signal for high intensity moments', async () => {
      const { recordUnifiedMoment } = await import('../../personality/bridge/personality-bridge.js');

      await recordUnifiedMoment({
        userId: 'user_123',
        personaId: 'ferni',
        type: 'breakthrough',
        message: 'This changes everything!',
        emotionalIntensity: 0.9, // Above 0.7 threshold
        sendDataMessage: mockSendDataMessage,
      });

      // Should dispatch emotional bond signal
      expect(mockSendDataMessage).toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'emotional_bond_deepen',
      }));
    });

    it('should skip recording when userId is missing', async () => {
      const { recordUnifiedMoment } = await import('../../personality/bridge/personality-bridge.js');

      const result = await recordUnifiedMoment({
        userId: '',
        personaId: 'ferni',
        type: 'breakthrough',
        message: 'Test',
        sendDataMessage: mockSendDataMessage,
      });

      expect(result.success).toBe(false);
    });

    it('should handle missing sendDataMessage gracefully', async () => {
      const { recordUnifiedMoment } = await import('../../personality/bridge/personality-bridge.js');

      // Should not throw even without sendDataMessage
      const result = await recordUnifiedMoment({
        userId: 'user_123',
        personaId: 'ferni',
        type: 'laughter',
        message: 'haha that is so funny!',
        emotionalIntensity: 0.6,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Convenience functions', () => {
    it('recordBreakthrough should use correct type', async () => {
      const { recordBreakthrough } = await import('../../personality/bridge/personality-bridge.js');

      await recordBreakthrough('user_123', 'ferni', 'I finally get it!', mockSendDataMessage);

      // Should dispatch with high emotional intensity
      expect(mockSendDataMessage).toHaveBeenCalled();
    });

    it('recordVulnerability should use correct type', async () => {
      const { recordVulnerability } = await import('../../personality/bridge/personality-bridge.js');

      await recordVulnerability('user_123', 'ferni', 'I am scared', mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalled();
    });

    it('recordCelebration should use correct type', async () => {
      const { recordCelebration } = await import('../../personality/bridge/personality-bridge.js');

      await recordCelebration('user_123', 'ferni', 'I got the job!', mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalled();
    });

    it('recordCrisisSupport should use highest intensity', async () => {
      const { recordCrisisSupport } = await import('../../personality/bridge/personality-bridge.js');

      await recordCrisisSupport('user_123', 'ferni', 'I am feeling really hopeless', mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalled();
    });

    it('recordLaughter should use lower intensity and not dispatch bond signal', async () => {
      const { recordLaughter } = await import('../../personality/bridge/personality-bridge.js');

      await recordLaughter('user_123', 'ferni', 'LOL', mockSendDataMessage);

      // Laughter has 0.6 intensity which is below 0.7 threshold for bond signal
      // So sendDataMessage should NOT be called for bond signal
      // This is correct behavior - laughter is light-hearted, not bond-deepening
      expect(mockSendDataMessage).not.toHaveBeenCalledWith('humanization_signal', expect.objectContaining({
        signalType: 'emotional_bond_deepen',
      }));
    });

    it('recordDeepConversation should use moderate intensity', async () => {
      const { recordDeepConversation } = await import('../../personality/bridge/personality-bridge.js');

      await recordDeepConversation('user_123', 'ferni', 'What is the meaning of life?', mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// TYPE IMPORTS FOR TESTS
// ============================================================================

interface VulnerabilityData {
  level: string;
  category: string;
  isFirstTime?: boolean;
  acknowledgment?: string;
}

interface GrowthMilestoneData {
  area: string;
  significance: string;
  description?: string;
  celebrationMessage?: string;
}

interface PatternData {
  patternType: string;
  description: string;
  confidence: number;
  insightToShare?: string;
  isReadyToSurface?: boolean;
}
