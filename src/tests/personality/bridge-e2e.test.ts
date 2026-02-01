/**
 * Personality Bridge E2E Tests
 *
 * Verifies that the personality bridge correctly dispatches signals
 * with the correct signal types that the frontend expects.
 *
 * CRITICAL: These tests verify that we send:
 * - `visible_vulnerability` NOT `vulnerability`
 * - `spontaneous_delight` for growth celebrations
 * - `superhuman_observation` for pattern surfacing
 * - `emotional_bond_deepen` for bond signals
 * - `anticipatory_presence` for anticipation
 *
 * @module tests/personality/bridge-e2e
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SendDataMessageFn } from '../../personality/bridge/signal-dispatchers.js';

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
    buildContext: vi.fn(() =>
      Promise.resolve({
        formattedContext: 'test context',
        anticipatedEmotion: null,
        pendingVulnerabilities: [],
        surfaceablePatterns: [],
        celebratableMilestones: [],
      })
    ),
    recordMoment: vi.fn(() =>
      Promise.resolve({
        vulnerabilityDetected: false,
        isFirstTimeVulnerability: false,
        domainEvents: [],
      })
    ),
  })),
}));

// ============================================================================
// E2E SIGNAL TYPE VERIFICATION
// ============================================================================

describe('Personality Bridge E2E - Signal Type Verification', () => {
  let mockSendDataMessage: SendDataMessageFn;
  let capturedSignals: Array<{ type: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    capturedSignals = [];
    mockSendDataMessage = vi.fn(async (type: string, payload: Record<string, unknown>) => {
      capturedSignals.push({ type, payload });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Vulnerability Signals', () => {
    it('should send visible_vulnerability NOT vulnerability', async () => {
      const { dispatchVulnerabilitySignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      await dispatchVulnerabilitySignal(
        mockSendDataMessage,
        {
          level: 'vulnerable',
          category: 'mental_health',
          isFirstTime: true,
        },
        true
      );

      // CRITICAL: Must be visible_vulnerability, not vulnerability
      const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
      expect(signal).toBeDefined();
      expect(signal!.payload.signalType).toBe('visible_vulnerability');
      expect(signal!.payload.signalType).not.toBe('vulnerability');
    });

    it('should map vulnerability levels to correct frontend types', async () => {
      const { dispatchVulnerabilitySignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      // Test all vulnerability level mappings
      const mappings = [
        { level: 'sacred', expectedType: 'growth' },
        { level: 'vulnerable', expectedType: 'admission' },
        { level: 'personal', expectedType: 'reflection' },
        { level: 'surface', expectedType: 'uncertainty' },
      ];

      for (const { level, expectedType } of mappings) {
        capturedSignals = [];
        await dispatchVulnerabilitySignal(
          mockSendDataMessage,
          { level, category: 'test', isFirstTime: false },
          false
        );

        const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
        expect(signal!.payload.vulnerabilityType).toBe(expectedType);
      }
    });
  });

  describe('Growth Celebration Signals', () => {
    it('should send spontaneous_delight for growth celebrations', async () => {
      const { dispatchGrowthCelebrationSignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      await dispatchGrowthCelebrationSignal(mockSendDataMessage, {
        area: 'anxiety_management',
        significance: 'major',
        description: 'Handled a panic attack calmly',
      });

      const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
      expect(signal).toBeDefined();
      expect(signal!.payload.signalType).toBe('spontaneous_delight');
    });
  });

  describe('Pattern Surfacing Signals', () => {
    it('should send superhuman_observation for patterns', async () => {
      const { dispatchPatternSurfacingSignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      await dispatchPatternSurfacingSignal(mockSendDataMessage, {
        patternType: 'temporal',
        description: 'Sunday anxiety pattern',
        confidence: 0.85,
        insightToShare: 'I notice Sunday evenings seem harder for you',
      });

      const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
      expect(signal).toBeDefined();
      expect(signal!.payload.signalType).toBe('superhuman_observation');
      expect(signal!.payload.observationType).toBe('temporal');
    });

    it('should map pattern types to correct observation types', async () => {
      const { dispatchPatternSurfacingSignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      const mappings = [
        { patternType: 'temporal', expectedObservationType: 'temporal' },
        { patternType: 'topic_emotion', expectedObservationType: 'correlation' },
        { patternType: 'person_related', expectedObservationType: 'correlation' },
        { patternType: 'other', expectedObservationType: 'pattern' },
      ];

      for (const { patternType, expectedObservationType } of mappings) {
        capturedSignals = [];
        await dispatchPatternSurfacingSignal(mockSendDataMessage, {
          patternType,
          description: 'Test pattern',
          confidence: 0.8,
        });

        const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
        expect(signal!.payload.observationType).toBe(expectedObservationType);
      }
    });
  });

  describe('Emotional Bond Signals', () => {
    it('should send emotional_bond_deepen for bond moments', async () => {
      const { dispatchEmotionalBondSignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      await dispatchEmotionalBondSignal(mockSendDataMessage, 'User shared deep story', 0.85);

      const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
      expect(signal).toBeDefined();
      expect(signal!.payload.signalType).toBe('emotional_bond_deepen');
      expect(signal!.payload.intensity).toBe(0.85);
    });
  });

  describe('Anticipation Signals', () => {
    it('should send anticipatory_presence for emotion prediction', async () => {
      const { dispatchAnticipationSignal } = await import(
        '../../personality/bridge/signal-dispatchers.js'
      );

      await dispatchAnticipationSignal(mockSendDataMessage, {
        emotion: 'sadness',
        confidence: 0.85,
        signals: ['falling tone', 'slow pace'],
        shouldPrepareEmpathy: true,
      });

      const signal = capturedSignals.find((s) => s.type === 'humanization_signal');
      expect(signal).toBeDefined();
      expect(signal!.payload.signalType).toBe('anticipatory_presence');
      expect(signal!.payload.anticipatedEmotion).toBe('sadness');
      expect(signal!.payload.shouldPrepareEmpathy).toBe(true);
    });
  });
});

// ============================================================================
// UNIFIED RECORDING E2E
// ============================================================================

describe('Personality Bridge E2E - Unified Recording', () => {
  let mockSendDataMessage: SendDataMessageFn;
  let capturedSignals: Array<{ type: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    capturedSignals = [];
    mockSendDataMessage = vi.fn(async (type: string, payload: Record<string, unknown>) => {
      capturedSignals.push({ type, payload });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordUnifiedMoment', () => {
    it('should record to both systems and dispatch bond signal for high intensity', async () => {
      const { recordUnifiedMoment } = await import(
        '../../personality/bridge/personality-bridge.js'
      );
      const { getRelationshipEngine } = await import('../../intelligence/relationship/index.js');
      const { createPersonalityService } = await import('../../personality/v2/index.js');

      await recordUnifiedMoment({
        userId: 'user_e2e_test',
        personaId: 'ferni',
        type: 'breakthrough',
        message: 'I finally understand myself!',
        emotionalIntensity: 0.9, // High intensity triggers bond signal
        sendDataMessage: mockSendDataMessage,
      });

      // Verify both systems were called
      expect(getRelationshipEngine).toHaveBeenCalledWith('user_e2e_test', 'ferni');
      expect(createPersonalityService).toHaveBeenCalled();

      // Verify emotional bond signal was dispatched (intensity > 0.7)
      const bondSignal = capturedSignals.find(
        (s) => s.type === 'humanization_signal' && s.payload.signalType === 'emotional_bond_deepen'
      );
      expect(bondSignal).toBeDefined();
    });

    it('should NOT dispatch bond signal for low intensity moments', async () => {
      const { recordUnifiedMoment } = await import(
        '../../personality/bridge/personality-bridge.js'
      );

      await recordUnifiedMoment({
        userId: 'user_e2e_test',
        personaId: 'ferni',
        type: 'laughter',
        message: 'LOL that is funny',
        emotionalIntensity: 0.5, // Below 0.7 threshold
        sendDataMessage: mockSendDataMessage,
      });

      // Should NOT have emotional_bond_deepen signal
      const bondSignal = capturedSignals.find(
        (s) => s.type === 'humanization_signal' && s.payload.signalType === 'emotional_bond_deepen'
      );
      expect(bondSignal).toBeUndefined();
    });

    it('should accept voice features for multimodal analysis', async () => {
      const { recordUnifiedMoment } = await import(
        '../../personality/bridge/personality-bridge.js'
      );

      const result = await recordUnifiedMoment({
        userId: 'user_e2e_test',
        personaId: 'ferni',
        type: 'vulnerability',
        message: 'I have never told anyone this...',
        emotionalIntensity: 0.85,
        voiceFeatures: {
          pitchMean: 180.5,
          speakingRate: 120,
          energyLevel: -25.3,
          jitter: 0.03,
          shimmer: 0.08,
        },
        sendDataMessage: mockSendDataMessage,
      });

      // Recording should succeed with voice features
      expect(result.success).toBe(true);
    });
  });

  describe('Convenience Functions', () => {
    it('recordBreakthrough should use correct type and high intensity', async () => {
      const { recordBreakthrough } = await import('../../personality/bridge/personality-bridge.js');

      // recordBreakthrough is a void convenience function
      await recordBreakthrough(
        'user_e2e_test',
        'ferni',
        'I finally get it!',
        mockSendDataMessage
      );

      // Should dispatch bond signal (breakthrough has high intensity = 0.8)
      const bondSignal = capturedSignals.find(
        (s) => s.type === 'humanization_signal' && s.payload.signalType === 'emotional_bond_deepen'
      );
      expect(bondSignal).toBeDefined();
    });

    it('recordVulnerability should dispatch bond signal', async () => {
      const { recordVulnerability } = await import(
        '../../personality/bridge/personality-bridge.js'
      );

      await recordVulnerability(
        'user_e2e_test',
        'ferni',
        'I am really scared',
        mockSendDataMessage
      );

      // Vulnerability has high intensity (0.8) which should trigger bond signal
      const bondSignal = capturedSignals.find(
        (s) => s.type === 'humanization_signal' && s.payload.signalType === 'emotional_bond_deepen'
      );
      expect(bondSignal).toBeDefined();
    });
  });
});

// ============================================================================
// FRONTEND SIGNAL CONTRACT VERIFICATION
// ============================================================================

describe('Personality Bridge E2E - Frontend Signal Contract', () => {
  it('should match frontend BetterThanHumanSignalType enum values', async () => {
    // These are the signal types the frontend expects
    // From: apps/web/src/eq/types.ts - BetterThanHumanSignalType
    const expectedSignalTypes = [
      'visible_vulnerability',
      'spontaneous_delight',
      'superhuman_observation',
      'emotional_bond_deepen',
      'anticipatory_presence',
      'inside_joke_callback',
      'temporal_insight',
      'meta_relationship_moment',
      'somatic_presence',
      'concern_detected',
      'voice_state_detected',
      'emotional_trajectory',
    ];

    // Import our dispatchers
    const {
      dispatchVulnerabilitySignal,
      dispatchGrowthCelebrationSignal,
      dispatchPatternSurfacingSignal,
      dispatchEmotionalBondSignal,
      dispatchAnticipationSignal,
    } = await import('../../personality/bridge/signal-dispatchers.js');

    const capturedTypes: string[] = [];
    const mockSend: SendDataMessageFn = async (type, payload) => {
      if (type === 'humanization_signal') {
        capturedTypes.push(payload.signalType as string);
      }
    };

    // Dispatch each signal type
    await dispatchVulnerabilitySignal(
      mockSend,
      { level: 'vulnerable', category: 'test' },
      false
    );
    await dispatchGrowthCelebrationSignal(mockSend, {
      area: 'test',
      significance: 'major',
    });
    await dispatchPatternSurfacingSignal(mockSend, {
      patternType: 'temporal',
      description: 'test',
      confidence: 0.8,
    });
    await dispatchEmotionalBondSignal(mockSend, 'test', 0.8);
    await dispatchAnticipationSignal(mockSend, {
      emotion: 'test',
      confidence: 0.8,
      signals: [],
    });

    // Verify all our signal types are in the expected list
    for (const type of capturedTypes) {
      expect(expectedSignalTypes).toContain(type);
    }

    // Specifically verify we're NOT sending incorrect types
    expect(capturedTypes).not.toContain('vulnerability'); // WRONG
    expect(capturedTypes).toContain('visible_vulnerability'); // CORRECT
  });
});
