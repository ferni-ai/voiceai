/**
 * Tests for Personality v2 Value Objects
 *
 * Tests the immutable domain primitives:
 * - RelationshipDepth
 * - EmotionalState
 * - AnticipatedEmotion
 *
 * @module tests/personality/v2/value-objects
 */

import { describe, expect, it } from 'vitest';
import {
  RelationshipDepth,
  EmotionalState,
  AnticipatedEmotion,
} from '../../../personality/domain/model/value-objects/index.js';

// ============================================================================
// RELATIONSHIP DEPTH TESTS
// ============================================================================

describe('RelationshipDepth', () => {
  describe('Factory Methods', () => {
    it('should create a stranger relationship', () => {
      const depth = RelationshipDepth.stranger();

      expect(depth.stage).toBe('stranger');
      expect(depth.vulnerabilityScore).toBe(0);
      expect(depth.trustVelocity).toBe(0);
      expect(depth.sharedHistoryDensity).toBe(0);
      expect(depth.emotionalSafetyIndex).toBe(50);
    });

    it('should create from explicit values', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 45,
        trustVelocity: 2.5,
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 65,
      });

      expect(depth.vulnerabilityScore).toBe(45);
      expect(depth.trustVelocity).toBe(2.5);
      expect(depth.sharedHistoryDensity).toBe(30);
      expect(depth.emotionalSafetyIndex).toBe(65);
    });

    it('should clamp values to valid ranges', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 150, // Should clamp to 100
        trustVelocity: 20, // Should clamp to 10
        sharedHistoryDensity: -10, // Should clamp to 0
        emotionalSafetyIndex: 200, // Should clamp to 100
      });

      expect(depth.vulnerabilityScore).toBe(100);
      expect(depth.trustVelocity).toBe(10);
      expect(depth.sharedHistoryDensity).toBe(0);
      expect(depth.emotionalSafetyIndex).toBe(100);
    });

    it('should reconstitute from persistence', () => {
      const original = RelationshipDepth.create({
        vulnerabilityScore: 60,
        trustVelocity: 3,
        sharedHistoryDensity: 40,
        emotionalSafetyIndex: 75,
      });

      const persisted = original.toPersistence();
      const reconstituted = RelationshipDepth.fromPersistence(persisted);

      expect(reconstituted.equals(original)).toBe(true);
    });
  });

  describe('Stage Calculation', () => {
    it('should be stranger with low scores', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 5,
        trustVelocity: 0,
        sharedHistoryDensity: 0,
        emotionalSafetyIndex: 20,
      });

      expect(depth.stage).toBe('stranger');
    });

    it('should be acquaintance with moderate vulnerability', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 15,
        trustVelocity: 1,
        sharedHistoryDensity: 10,
        emotionalSafetyIndex: 40,
      });

      expect(depth.stage).toBe('acquaintance');
    });

    it('should be friend with significant vulnerability', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 35,
        trustVelocity: 2,
        sharedHistoryDensity: 25,
        emotionalSafetyIndex: 55,
      });

      expect(depth.stage).toBe('friend');
    });

    it('should be trusted with high vulnerability and safety', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 65,
        trustVelocity: 4,
        sharedHistoryDensity: 50,
        emotionalSafetyIndex: 75,
      });

      expect(depth.stage).toBe('trusted');
    });

    it('should be intimate with very high vulnerability and safety', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 85,
        trustVelocity: 5,
        sharedHistoryDensity: 70,
        emotionalSafetyIndex: 92,
      });

      expect(depth.stage).toBe('intimate');
    });
  });

  describe('canHandle', () => {
    it('should allow surface content for strangers', () => {
      const depth = RelationshipDepth.stranger();
      expect(depth.canHandle('surface')).toBe(true);
    });

    it('should NOT allow deep content for strangers', () => {
      const depth = RelationshipDepth.stranger();
      expect(depth.canHandle('deep')).toBe(false);
    });

    it('should allow deep content for friends with good safety', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 40,
        trustVelocity: 2,
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 70,
      });

      expect(depth.canHandle('deep')).toBe(true);
    });

    it('should NOT allow deep content when safety is low', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 40,
        trustVelocity: 2,
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 50, // Below threshold
      });

      expect(depth.canHandle('deep')).toBe(false);
    });

    it('should NOT allow deep content when trust is declining', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 40,
        trustVelocity: -3, // Declining
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 70,
      });

      expect(depth.canHandle('deep')).toBe(false);
    });
  });

  describe('Mutation Methods', () => {
    it('should increase vulnerability score with deposit', () => {
      const depth = RelationshipDepth.stranger();
      const updated = depth.withVulnerabilityDeposit(20);

      expect(updated.vulnerabilityScore).toBe(20);
      expect(depth.vulnerabilityScore).toBe(0); // Original unchanged
    });

    it('should increase shared history with shared moment', () => {
      const depth = RelationshipDepth.stranger();
      const updated = depth.withSharedMoment(10);

      expect(updated.sharedHistoryDensity).toBe(10);
    });

    it('should track first vulnerable share timestamp', () => {
      const depth = RelationshipDepth.stranger();
      const updated = depth.withVulnerabilityDeposit(20, true);

      expect(updated.firstVulnerableShareAt).toBeDefined();
      expect(updated.lastVulnerableShareAt).toBeDefined();
      expect(updated.firstTimeVulnerabilityCount).toBe(1);
    });

    it('should apply time decay to trust velocity', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 50,
        trustVelocity: 5,
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 70,
      });

      const decayed = depth.withTimeDecay(10);

      expect(decayed.trustVelocity).toBeLessThan(5);
      // Vulnerability score shouldn't decay
      expect(decayed.vulnerabilityScore).toBe(50);
    });
  });

  describe('Computed Properties', () => {
    it('should identify trust growing', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 30,
        trustVelocity: 3,
        sharedHistoryDensity: 20,
        emotionalSafetyIndex: 60,
      });

      expect(depth.isTrustGrowing).toBe(true);
    });

    it('should identify trust declining', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 30,
        trustVelocity: -3,
        sharedHistoryDensity: 20,
        emotionalSafetyIndex: 60,
      });

      expect(depth.isTrustDeclining).toBe(true);
    });

    it('should calculate overall health score', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 50,
        trustVelocity: 5,
        sharedHistoryDensity: 50,
        emotionalSafetyIndex: 70,
      });

      const health = depth.overallHealthScore;
      expect(health).toBeGreaterThan(50);
      expect(health).toBeLessThanOrEqual(100);
    });

    it('should recommend proactive sharing when appropriate', () => {
      const depth = RelationshipDepth.create({
        vulnerabilityScore: 40,
        trustVelocity: 4, // Growing fast
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 70, // Feels safe
      });

      expect(depth.shouldProactivelyShare()).toBe(true);
    });

    it('should NOT recommend proactive sharing for strangers', () => {
      const depth = RelationshipDepth.stranger();
      expect(depth.shouldProactivelyShare()).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should round-trip through persistence', () => {
      const original = RelationshipDepth.create({
        vulnerabilityScore: 55,
        trustVelocity: 3.5,
        sharedHistoryDensity: 45,
        emotionalSafetyIndex: 72,
      });

      const persisted = original.toPersistence();
      const restored = RelationshipDepth.fromPersistence(persisted);

      expect(restored.vulnerabilityScore).toBe(original.vulnerabilityScore);
      expect(restored.trustVelocity).toBe(original.trustVelocity);
      expect(restored.stage).toBe(original.stage);
    });
  });
});

// ============================================================================
// EMOTIONAL STATE TESTS
// ============================================================================

describe('EmotionalState', () => {
  describe('Factory Methods', () => {
    it('should create neutral state', () => {
      const state = EmotionalState.neutral();

      expect(state.primary).toBe('neutral');
      expect(state.granular).toBe('calm');
      expect(state.intensity).toBe(0.3);
    });

    it('should create from explicit values', () => {
      const state = EmotionalState.create({
        primary: 'joy',
        granular: 'ecstatic',
        intensity: 0.9,
        confidence: 0.85,
      });

      expect(state.primary).toBe('joy');
      expect(state.granular).toBe('ecstatic');
      expect(state.intensity).toBe(0.9);
      expect(state.confidence).toBe(0.85);
    });

    it('should create from text analysis', () => {
      const state = EmotionalState.fromTextAnalysis('sadness', 'melancholy', 0.6, 0.7);

      expect(state.primary).toBe('sadness');
      expect(state.sources).toContain('text');
    });

    it('should create from voice analysis', () => {
      const state = EmotionalState.fromVoiceAnalysis('fear', 'anxious', 0.7, 0.8);

      expect(state.primary).toBe('fear');
      expect(state.sources).toContain('voice');
    });
  });

  describe('Computed Properties', () => {
    it('should identify negative emotions', () => {
      const sadState = EmotionalState.create({
        primary: 'sadness',
        intensity: 0.5,
      });
      const angryState = EmotionalState.create({
        primary: 'anger',
        intensity: 0.5,
      });

      expect(sadState.isNegative).toBe(true);
      expect(angryState.isNegative).toBe(true);
    });

    it('should identify positive emotions', () => {
      const joyState = EmotionalState.create({
        primary: 'joy',
        intensity: 0.5,
      });

      expect(joyState.isPositive).toBe(true);
    });

    it('should identify high intensity', () => {
      const highState = EmotionalState.create({
        primary: 'fear',
        granular: 'terrified',
        intensity: 0.85,
      });

      expect(highState.isHighIntensity).toBe(true);
    });

    it('should identify crisis level', () => {
      const crisisState = EmotionalState.create({
        primary: 'sadness',
        granular: 'devastated',
        intensity: 0.9,
      });

      expect(crisisState.isCrisisLevel).toBe(true);
    });

    it('should identify when to hold space', () => {
      const vulnerableState = EmotionalState.create({
        primary: 'fear',
        granular: 'vulnerable',
        intensity: 0.6,
      });

      expect(vulnerableState.shouldHoldSpace).toBe(true);
    });

    it('should generate human-readable description', () => {
      const state = EmotionalState.create({
        primary: 'fear',
        granular: 'anxious',
        intensity: 0.7,
      });

      expect(state.description).toContain('anxious');
    });
  });

  describe('Contradiction Handling (SUPERHUMAN)', () => {
    it('should support contradicting emotions', () => {
      const state = EmotionalState.create({
        primary: 'fear',
        granular: 'anxious',
        intensity: 0.7,
      }).withContradictingEmotion('joy', 'excited');

      expect(state.hasContradiction).toBe(true);
      expect(state.contradictingEmotion?.primary).toBe('joy');
      expect(state.contradictingEmotion?.granular).toBe('excited');
    });

    it('should describe contradictions', () => {
      const state = EmotionalState.create({
        primary: 'fear',
        granular: 'anxious',
        intensity: 0.7,
      }).withContradictingEmotion('joy', 'excited');

      expect(state.description).toContain('anxious');
      expect(state.description).toContain('excited');
    });
  });

  describe('Merging', () => {
    it('should boost confidence when emotions match', () => {
      const textState = EmotionalState.fromTextAnalysis('sadness', 'melancholy', 0.6, 0.6);
      const voiceState = EmotionalState.fromVoiceAnalysis('sadness', 'sad', 0.7, 0.7);

      const merged = textState.mergeWith(voiceState);

      expect(merged.primary).toBe('sadness');
      expect(merged.confidence).toBeGreaterThan(0.6);
      expect(merged.sources).toContain('text');
      expect(merged.sources).toContain('voice');
    });

    it('should create contradiction when emotions conflict', () => {
      const sadState = EmotionalState.create({
        primary: 'sadness',
        intensity: 0.6,
      });
      const joyState = EmotionalState.create({
        primary: 'joy',
        intensity: 0.5,
      });

      const merged = sadState.mergeWith(joyState);

      expect(merged.hasContradiction).toBe(true);
    });
  });

  describe('isAppropriateForSharing', () => {
    it('should NOT allow deep sharing during crisis', () => {
      const crisisState = EmotionalState.create({
        primary: 'sadness',
        granular: 'devastated',
        intensity: 0.9,
      });

      expect(crisisState.isAppropriateForSharing('deep')).toBe(false);
    });

    it('should allow surface sharing during moderate emotion', () => {
      const moderateState = EmotionalState.create({
        primary: 'sadness',
        granular: 'sad',
        intensity: 0.5,
      });

      expect(moderateState.isAppropriateForSharing('surface')).toBe(true);
    });
  });

  describe('distanceFrom', () => {
    it('should calculate small distance for similar emotions', () => {
      const state1 = EmotionalState.create({ primary: 'joy', intensity: 0.7 });
      const state2 = EmotionalState.create({ primary: 'joy', intensity: 0.6 });

      const distance = state1.distanceFrom(state2);
      expect(distance).toBeLessThan(0.3);
    });

    it('should calculate large distance for opposite emotions', () => {
      const joyState = EmotionalState.create({ primary: 'joy', intensity: 0.8 });
      const sadState = EmotionalState.create({ primary: 'sadness', intensity: 0.8 });

      const distance = joyState.distanceFrom(sadState);
      expect(distance).toBeGreaterThan(0.5);
    });
  });
});

// ============================================================================
// ANTICIPATED EMOTION TESTS
// ============================================================================

describe('AnticipatedEmotion', () => {
  describe('Factory Methods', () => {
    it('should create from explicit values', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'sadness',
        granular: 'melancholy',
        confidence: 'likely',
        signals: ['partial_speech', 'tone_shift'],
        reasoning: 'Falling tone with reflective phrase',
      });

      expect(anticipated.emotion).toBe('sadness');
      expect(anticipated.granular).toBe('melancholy');
      expect(anticipated.confidence).toBe('likely');
      expect(anticipated.signals).toContain('partial_speech');
    });

    it('should create from partial speech', () => {
      const anticipated = AnticipatedEmotion.fromPartialSpeech(
        "I've been thinking about...",
        'sadness',
        'melancholy',
        0.7,
        'Reflective phrase suggests processing'
      );

      expect(anticipated.emotion).toBe('sadness');
      expect(anticipated.signals).toContain('partial_speech');
      expect(anticipated.partialTranscript).toBe("I've been thinking about...");
    });

    it('should create from pattern', () => {
      const anticipated = AnticipatedEmotion.fromPattern(
        'pattern_123',
        'fear',
        'anxious',
        0.8,
        'Historical pattern: work stress',
        3600
      );

      expect(anticipated.emotion).toBe('fear');
      expect(anticipated.basedOnPatternId).toBe('pattern_123');
      expect(anticipated.predictionHorizon).toBe(3600);
    });

    it('should create from voice tone', () => {
      const anticipated = AnticipatedEmotion.fromVoiceTone('breaking', 'sadness', 0.85);

      expect(anticipated.emotion).toBe('sadness');
      expect(anticipated.signals).toContain('tone_shift');
    });
  });

  describe('Computed Properties', () => {
    it('should identify actionable predictions', () => {
      const highConfidence = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      expect(highConfidence.isActionable).toBe(true);
    });

    it('should NOT be actionable for speculative predictions', () => {
      const lowConfidence = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'speculative',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      expect(lowConfidence.isActionable).toBe(false);
    });

    it('should recommend empathy preparation for negative emotions', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      expect(anticipated.shouldPrepareEmpathy).toBe(true);
    });

    it('should recommend celebration preparation for joy', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'joy',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      expect(anticipated.shouldPrepareCelebration).toBe(true);
    });

    it('should suggest micro-expressions', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      expect(anticipated.suggestedMicroExpression).toBe('concernFlash');
    });
  });

  describe('wasAccurate', () => {
    it('should return true for exact match', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      const actual = EmotionalState.create({ primary: 'sadness', intensity: 0.7 });

      expect(anticipated.wasAccurate(actual)).toBe(true);
    });

    it('should return true for emotions in same cluster', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'fear',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      const actual = EmotionalState.create({ primary: 'sadness', intensity: 0.7 });

      // Both in negative cluster
      expect(anticipated.wasAccurate(actual)).toBe(true);
    });

    it('should return false for opposite emotions', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'joy',
        confidence: 'likely',
        signals: ['partial_speech'],
        reasoning: 'Test',
      });

      const actual = EmotionalState.create({ primary: 'sadness', intensity: 0.7 });

      expect(anticipated.wasAccurate(actual)).toBe(false);
    });
  });

  describe('combineWith', () => {
    it('should boost confidence for matching predictions', () => {
      const prediction1 = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'possible',
        signals: ['partial_speech'],
        reasoning: 'Speech pattern',
      });

      const prediction2 = AnticipatedEmotion.create({
        emotion: 'sadness',
        confidence: 'possible',
        signals: ['tone_shift'],
        reasoning: 'Voice tone',
      });

      const combined = prediction1.combineWith(prediction2);

      expect(combined.confidenceScore).toBeGreaterThan(prediction1.confidenceScore);
      expect(combined.signals).toContain('partial_speech');
      expect(combined.signals).toContain('tone_shift');
    });
  });

  describe('formatForPrompt', () => {
    it('should format actionable predictions', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'sadness',
        granular: 'melancholy',
        confidence: 'likely',
        signals: ['partial_speech', 'tone_shift'],
        reasoning: 'Falling tone with reflective phrase',
      });

      const formatted = anticipated.formatForPrompt();

      expect(formatted).toContain('ANTICIPATED EMOTION');
      expect(formatted).toContain('sadness');
      expect(formatted).toContain('SUPERHUMAN');
    });

    it('should return empty for non-actionable predictions', () => {
      const anticipated = AnticipatedEmotion.create({
        emotion: 'neutral',
        confidence: 'speculative',
        signals: [],
        reasoning: 'Test',
      });

      expect(anticipated.formatForPrompt()).toBe('');
    });
  });
});
