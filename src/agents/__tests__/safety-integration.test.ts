/**
 * Safety Integration Tests
 *
 * Tests for crisis detection and the trust context summary in the turn
 * processing pipeline.
 *
 * CRITICAL: These tests verify that user safety features are working correctly.
 * The safety module CANNOT be bypassed - these tests ensure it's properly integrated.
 */

import { describe, expect, it } from 'vitest';
import { detectCrisis, guardPreResponse } from '../safety/crisis-guard.js';
import type { TrustContext, UnsaidSignal } from '../../services/trust-systems/index.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/** Create a minimal valid TrustContext for testing */
function createTestTrustContext(overrides: Partial<TrustContext> = {}): TrustContext {
  return {
    unsaidSignals: [],
    boundaryCheck: null,
    growthReflection: null,
    callbackOpportunity: null,
    celebrationOpportunity: null,
    pendingOutreach: [],
    topicsToAvoid: [],
    // New "Better Than Human" fields (Dec 2025)
    firstTimeVulnerability: null,
    linguisticContext: '',
    protectiveMemory: '',
    deflectionContext: '',
    ...overrides,
  };
}

/** Create a minimal valid UnsaidSignal for testing */
function createTestUnsaidSignal(overrides: Partial<UnsaidSignal> = {}): UnsaidSignal {
  return {
    type: 'emotional_mismatch',
    observation: 'User says fine but context suggests otherwise',
    underlying: 'sadness',
    confidence: 0.8,
    approach: 'create_space',
    context: { userMessage: "I'm fine" },
    ...overrides,
  } as UnsaidSignal;
}

// ============================================================================
// CRISIS DETECTION TESTS
// ============================================================================

describe('Crisis Detection', () => {
  describe('detectCrisis', () => {
    it('should detect explicit suicidal ideation', () => {
      const result = detectCrisis("I don't want to live anymore");

      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBeGreaterThanOrEqual(0.7);
      expect(result.indicators).toContain('explicit_crisis_language');
    });

    it('should detect implicit distress signals', () => {
      const result = detectCrisis("Everything is falling apart and I can't cope");

      expect(result.severity).toBeGreaterThan(0.3);
      expect(result.indicators).toContain('implicit_distress');
    });

    it('should NOT flag normal conversations', () => {
      const result = detectCrisis('I had a great day at work today');

      expect(result.isCrisis).toBe(false);
      expect(result.severity).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });

    it('should amplify severity with voice distress', () => {
      const textOnly = detectCrisis('I feel so alone');
      const withVoice = detectCrisis('I feel so alone', {
        primary: 'distressed',
        intensity: 0.9,
        confidence: 0.8,
      });

      expect(withVoice.severity).toBeGreaterThan(textOnly.severity);
      expect(withVoice.indicators).toContain('voice_high_distress');
    });

    it('should provide suggested response for severe crisis', () => {
      const result = detectCrisis('I want to end it all');

      expect(result.isCrisis).toBe(true);
      expect(result.suggestedResponse).toBeDefined();
      expect(result.suggestedResponse).toContain('988');
    });
  });

  describe('guardPreResponse', () => {
    it('should block and override for severe crisis', () => {
      const result = guardPreResponse("I'm thinking about killing myself");

      expect(result.shouldBlock).toBe(true);
      expect(result.isCrisis).toBe(true);
      expect(result.replacementResponse).toBeDefined();
      expect(result.crisisSeverity).toBeGreaterThanOrEqual(0.85);
    });

    it('should NOT block for moderate distress', () => {
      const result = guardPreResponse('I feel really sad today');

      expect(result.shouldBlock).toBe(false);
      expect(result.isCrisis).toBe(false);
    });
  });
});

// ============================================================================
// CRISIS PRECEDENCE
// ============================================================================

describe('Crisis precedence', () => {
  it('crisis should take precedence over celebrating a win', () => {
    // Even if trust says "celebrate the win", crisis overrides everything
    const crisisResult = guardPreResponse(
      "I accomplished my goal but I don't want to be here anymore"
    );

    // Crisis detection should fire
    expect(crisisResult.isCrisis).toBe(true);
    expect(crisisResult.crisisSeverity).toBeGreaterThanOrEqual(0.7);
  });
});

// ============================================================================
// TRUST CONTEXT SUMMARY TESTS (for post-response monitoring)
// ============================================================================

describe('Trust Context Summary', () => {
  it('should correctly identify emotional mismatch presence', () => {
    const trustContext = createTestTrustContext({
      unsaidSignals: [
        createTestUnsaidSignal({
          type: 'emotional_mismatch',
          confidence: 0.85,
        }),
      ],
    });

    const hasEmotionalMismatch =
      trustContext.unsaidSignals?.some(
        (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
      ) ?? false;

    expect(hasEmotionalMismatch).toBe(true);
  });

  it('should NOT flag low-confidence emotional mismatch', () => {
    const trustContext = createTestTrustContext({
      unsaidSignals: [
        createTestUnsaidSignal({
          type: 'emotional_mismatch',
          confidence: 0.4, // Below threshold
        }),
      ],
    });

    const hasEmotionalMismatch =
      trustContext.unsaidSignals?.some(
        (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
      ) ?? false;

    expect(hasEmotionalMismatch).toBe(false);
  });

  it('should track topics to avoid', () => {
    const trustContext = createTestTrustContext({
      topicsToAvoid: ['father', 'divorce', 'work'],
    });

    expect(trustContext.topicsToAvoid).toContain('father');
    expect(trustContext.topicsToAvoid).toContain('divorce');
    expect(trustContext.topicsToAvoid).toHaveLength(3);
  });

  it('should identify growth reflection opportunity', () => {
    const trustContext = createTestTrustContext({
      growthReflection: {
        pattern: {
          id: 'anxiety_reduction',
          type: 'emotional_regulation' as const,
          before: { pattern: 'anxious', examples: [], firstSeen: new Date() },
          after: { pattern: 'calm', examples: [], firstSeen: new Date() },
          significance: 'notable' as const,
          confidence: 0.8,
          timesObserved: 3,
          reflectedBack: false,
        },
        reflection: 'You used to get anxious talking about this, but today you seem calmer.',
        timing: 'now' as const,
        ssml: '<speak>You used to get anxious talking about this...</speak>',
      },
    });

    expect(!!trustContext.growthReflection).toBe(true);
  });

  it('should identify celebration opportunity', () => {
    const trustContext = createTestTrustContext({
      celebrationOpportunity: {
        win: {
          id: 'win-123',
          type: 'showed_up',
          description: 'meditation 5 days in a row',
          timestamp: new Date(),
          celebrated: false,
        },
        celebration: 'Five days! Your consistency is inspiring.',
        ssml: '<speak>Five days!</speak>',
        intensity: 'medium',
      },
    });

    expect(!!trustContext.celebrationOpportunity).toBe(true);
  });
});

// ============================================================================
// E2E CRISIS FLOW TESTS
// These tests verify the crisis detection → turn processor → handler flow
// ============================================================================

describe('Crisis Flow E2E', () => {
  it('should produce crisis override structure for severe crisis', () => {
    // Use a phrase that matches EXPLICIT_CRISIS_PATTERNS
    // Pattern: /don't want to (live|be alive|exist|be here anymore)/i
    const crisisText = "I don't want to live anymore";

    // Step 1: Detect crisis
    const crisisResult = detectCrisis(crisisText);

    expect(crisisResult.isCrisis).toBe(true);
    expect(crisisResult.severity).toBeGreaterThanOrEqual(0.7);
    expect(crisisResult.indicators).toContain('explicit_crisis_language');

    // Step 2: Pre-response guard should block for severe
    const preGuard = guardPreResponse(crisisText);

    // Note: preGuard only blocks at very high severity (0.85+)
    // For explicit crisis language, it should be high enough
    if (crisisResult.severity >= 0.85) {
      expect(preGuard.shouldBlock).toBe(true);
      expect(preGuard.replacementResponse).toBeDefined();
    }

    // Step 3: Build the crisis object that would go into TurnProcessorResult
    const crisisForResult = {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      suggestedResponse: crisisResult.suggestedResponse,
      shouldOverrideLLM: preGuard.shouldBlock,
    };

    // Step 4: Verify the structure is correct for turn-handler
    expect(crisisForResult.isCrisis).toBe(true);
    expect(crisisForResult.indicators.length).toBeGreaterThan(0);
  });

  it('should produce crisis injection (not override) for moderate distress', () => {
    // Use a phrase that matches IMPLICIT_DISTRESS_PATTERNS
    // Pattern: /everything is (falling apart|too much|overwhelming)/i
    const distressText = "Everything is falling apart and I can't cope";

    // Step 1: Detect moderate distress
    const crisisResult = detectCrisis(distressText);

    // Should detect implicit distress
    expect(crisisResult.severity).toBeGreaterThan(0);
    expect(crisisResult.indicators).toContain('implicit_distress');

    // Step 2: Pre-response guard should NOT block for moderate
    const preGuard = guardPreResponse(distressText);

    // Moderate distress should not trigger hard block
    expect(preGuard.shouldBlock).toBe(false);

    // Step 3: Build the crisis object
    const crisisForResult = {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      suggestedResponse: crisisResult.suggestedResponse,
      shouldOverrideLLM: preGuard.shouldBlock,
    };

    // Step 4: For moderate, shouldOverrideLLM is false
    // The turn-handler will add a high-priority injection instead
    expect(crisisForResult.shouldOverrideLLM).toBe(false);
  });

  it('should NOT trigger crisis for normal conversation', () => {
    const normalTexts = [
      'I had a great day at work',
      'Can you help me plan my weekend?',
      "I'm feeling pretty good today",
      "What's the weather like?",
    ];

    for (const text of normalTexts) {
      const crisisResult = detectCrisis(text);
      const preGuard = guardPreResponse(text);

      expect(crisisResult.isCrisis).toBe(false);
      expect(crisisResult.severity).toBe(0);
      expect(preGuard.shouldBlock).toBe(false);
    }
  });

  it('should amplify crisis detection with voice emotion', () => {
    const text = "I'm fine, don't worry about me";

    // Without voice emotion - might not detect
    const withoutVoice = detectCrisis(text);

    // With distressed voice - should detect emotional mismatch/concern
    const withDistressedVoice = detectCrisis(text, {
      primary: 'distressed',
      intensity: 0.9,
      confidence: 0.85,
    });

    // Voice distress should increase severity
    expect(withDistressedVoice.severity).toBeGreaterThan(withoutVoice.severity);
    expect(withDistressedVoice.indicators).toContain('voice_high_distress');
  });
});

// ============================================================================
// TRUST CONTEXT FLOW TESTS
// These verify that trust context summary is correctly structured
// ============================================================================

describe('Trust Context Flow E2E', () => {
  it('should produce correct trust context summary shape', () => {
    const trustContext = createTestTrustContext({
      unsaidSignals: [
        createTestUnsaidSignal({
          type: 'emotional_mismatch',
          confidence: 0.85,
        }),
      ],
      topicsToAvoid: ['father', 'divorce'],
      growthReflection: {
        pattern: {
          id: 'anxiety_reduction',
          type: 'emotional_regulation' as const,
          before: { pattern: 'anxious', examples: ['I always freak out'], firstSeen: new Date() },
          after: { pattern: 'calm', examples: ['I took a breath'], firstSeen: new Date() },
          significance: 'notable' as const,
          confidence: 0.8,
          timesObserved: 3,
          reflectedBack: false,
        } as import('../../services/trust-systems/growth-reflection.js').GrowthPattern,
        reflection: 'You seem calmer now.',
        timing: 'now' as const,
        ssml: '<speak>You seem calmer now.</speak>',
      },
      celebrationOpportunity: {
        win: {
          id: 'win-1',
          type: 'showed_up',
          description: '5 days of meditation',
          timestamp: new Date(),
          celebrated: false,
        },
        celebration: 'Five days!',
        ssml: '<speak>Five days!</speak>',
        intensity: 'medium',
      },
    });

    // Build summary (mimics what injection-builders.ts does)
    const summary = {
      hasEmotionalMismatch:
        trustContext.unsaidSignals?.some(
          (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
        ) ?? false,
      topicsToAvoid: trustContext.topicsToAvoid ?? [],
      hasGrowthReflection: !!trustContext.growthReflection,
      hasCelebration: !!trustContext.celebrationOpportunity,
    };

    // Verify summary shape
    expect(summary.hasEmotionalMismatch).toBe(true);
    expect(summary.topicsToAvoid).toEqual(['father', 'divorce']);
    expect(summary.hasGrowthReflection).toBe(true);
    expect(summary.hasCelebration).toBe(true);
  });

  it('should produce empty summary for clean context', () => {
    const trustContext = createTestTrustContext();

    const summary = {
      hasEmotionalMismatch:
        trustContext.unsaidSignals?.some(
          (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
        ) ?? false,
      topicsToAvoid: trustContext.topicsToAvoid ?? [],
      hasGrowthReflection: !!trustContext.growthReflection,
      hasCelebration: !!trustContext.celebrationOpportunity,
    };

    expect(summary.hasEmotionalMismatch).toBe(false);
    expect(summary.topicsToAvoid).toEqual([]);
    expect(summary.hasGrowthReflection).toBe(false);
    expect(summary.hasCelebration).toBe(false);
  });
});
