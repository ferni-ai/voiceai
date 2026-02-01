/**
 * Tests for Personality v2 Domain Services
 *
 * Tests the pure business logic services:
 * - AnticipationEngine
 * - TimingCalculator
 * - VulnerabilityScorer
 *
 * @module tests/personality/v2/domain-services
 */

import { describe, expect, it } from 'vitest';
import {
  AnticipationEngine,
  TimingCalculator,
  VulnerabilityScorer,
} from '../../../personality/domain/services/index.js';
import { EmotionalPattern } from '../../../personality/domain/model/emotional-pattern.js';
import { EmotionalState } from '../../../personality/domain/model/value-objects/emotional-state.js';
import { RelationshipDepth } from '../../../personality/domain/model/value-objects/relationship-depth.js';

// ============================================================================
// ANTICIPATION ENGINE TESTS
// ============================================================================

describe('AnticipationEngine', () => {
  const engine = new AnticipationEngine();

  describe('anticipateFromSpeechPattern', () => {
    it('should detect reflective/sad openers', () => {
      const anticipated = engine.anticipateFromSpeechPattern("I've been thinking about...");

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('sadness');
      expect(anticipated?.granular).toBe('melancholy');
    });

    it('should detect excitement openers', () => {
      const anticipated = engine.anticipateFromSpeechPattern('Guess what happened!');

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('joy');
      expect(anticipated?.granular).toBe('ecstatic');
    });

    it('should detect vulnerability openers', () => {
      const anticipated = engine.anticipateFromSpeechPattern('I need to tell you something...');

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('fear');
      expect(anticipated?.granular).toBe('vulnerable');
    });

    it('should detect anger openers', () => {
      const anticipated = engine.anticipateFromSpeechPattern("I can't believe they did that");

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('anger');
      expect(anticipated?.granular).toBe('frustrated');
    });

    it('should detect fear/anxiety openers', () => {
      const anticipated = engine.anticipateFromSpeechPattern("I'm worried about...");

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('fear');
      expect(anticipated?.granular).toBe('anxious');
    });

    it('should return null for unrecognized patterns', () => {
      const anticipated = engine.anticipateFromSpeechPattern('Hello');

      expect(anticipated).toBeNull();
    });
  });

  describe('anticipateFromVoiceTone', () => {
    it('should anticipate sadness from breaking voice', () => {
      const anticipated = engine.anticipateFromVoiceTone('breaking');

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('sadness');
      expect(anticipated?.granular).toBe('overwhelmed');
    });

    it('should anticipate sadness from falling tone', () => {
      const anticipated = engine.anticipateFromVoiceTone('falling');

      expect(anticipated?.emotion).toBe('sadness');
      expect(anticipated?.granular).toBe('melancholy');
    });

    it('should anticipate anticipation from rising tone', () => {
      const anticipated = engine.anticipateFromVoiceTone('rising');

      expect(anticipated?.emotion).toBe('anticipation');
    });
  });

  describe('anticipateFromContext', () => {
    it('should combine speech and tone signals', () => {
      const anticipated = engine.anticipateFromContext(
        {
          partialTranscript: "I've been thinking...",
          voiceTone: 'falling',
        },
        []
      );

      expect(anticipated).not.toBeNull();
      expect(anticipated?.confidenceScore).toBeGreaterThan(0.5);
    });

    it('should use historical patterns', () => {
      const pattern = EmotionalPattern.create({
        userId: 'test',
        patternType: 'topic_emotion',
        description: 'work → anxiety',
        triggers: ['work', 'job', 'boss'],
        resultingEmotion: 'fear',
        resultingGranular: 'anxious',
      });
      pattern.addEvidence({
        timestamp: new Date(),
        context: 'test',
        emotion: 'fear',
        granular: 'anxious',
        intensity: 0.7,
        topics: ['work'],
      });

      const anticipated = engine.anticipateFromContext({ topics: ['work', 'deadline'] }, [pattern]);

      expect(anticipated).not.toBeNull();
      expect(anticipated?.emotion).toBe('fear');
      expect(anticipated?.basedOnPatternId).toBe(pattern.id);
    });

    it('should return null with no signals', () => {
      const anticipated = engine.anticipateFromContext({}, []);

      expect(anticipated).toBeNull();
    });
  });

  describe('calculateOptimalSurfacingTime', () => {
    it('should NOT surface during crisis', () => {
      const crisisState = EmotionalState.create({
        primary: 'sadness',
        granular: 'devastated',
        intensity: 0.9,
      });

      const result = engine.calculateOptimalSurfacingTime(
        { topics: ['test'], emotionalWeight: 0.5 },
        [],
        crisisState
      );

      expect(result.shouldSurfaceNow).toBe(false);
      expect(result.reason).toContain('crisis');
    });

    it('should surface during neutral/positive state', () => {
      const neutralState = EmotionalState.neutral();

      const result = engine.calculateOptimalSurfacingTime(
        { topics: ['test'], emotionalWeight: 0.3 },
        [],
        neutralState
      );

      expect(result.shouldSurfaceNow).toBe(true);
    });
  });
});

// ============================================================================
// TIMING CALCULATOR TESTS
// ============================================================================

describe('TimingCalculator', () => {
  const calculator = new TimingCalculator();

  describe('analyzeMessageTiming', () => {
    it('should detect needs_to_be_heard for long emotional messages', () => {
      const longMessage = `
        I've been feeling so overwhelmed lately. Work has been absolutely insane,
        and I don't know how to keep up. Every day I wake up with this sense of dread,
        and it just builds throughout the day. I feel like I'm drowning.
      `;

      const result = calculator.analyzeMessageTiming(longMessage);

      expect(result.intent).toBe('needs_to_be_heard');
      expect(result.suggestedResponse).toBe('deep_listening');
      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should detect just_venting for frustrated messages', () => {
      const ventingMessage =
        "I can't believe they did that AGAIN! So frustrated!! They always do this.";

      const result = calculator.analyzeMessageTiming(ventingMessage);

      expect(result.intent).toBe('just_venting');
      expect(result.suggestedResponse).toBe('validation');
      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should detect seeking_perspective for questions', () => {
      const questionMessage = 'What do you think I should do about this situation?';

      const result = calculator.analyzeMessageTiming(questionMessage);

      expect(result.intent).toBe('seeking_perspective');
      expect(result.personalMomentAppropriate).toBe(true);
    });

    it('should detect vulnerable_share for intimate revelations', () => {
      const vulnerableMessage =
        "I've never told anyone this, but I'm really scared about the future.";

      const result = calculator.analyzeMessageTiming(vulnerableMessage);

      expect(result.intent).toBe('vulnerable_share');
      expect(result.suggestedResponse).toBe('hold_space');
    });

    it('should detect sharing_good_news', () => {
      const goodNewsMessage = "Guess what! I finally got the job! I'm so excited!!";

      const result = calculator.analyzeMessageTiming(goodNewsMessage);

      expect(result.intent).toBe('sharing_good_news');
      expect(result.suggestedResponse).toBe('celebrate');
    });

    it('should detect seeking_advice', () => {
      const adviceMessage = 'I need your advice on how to handle this conversation with my boss.';

      const result = calculator.analyzeMessageTiming(adviceMessage);

      expect(result.intent).toBe('seeking_advice');
      expect(result.suggestedResponse).toBe('gentle_guidance');
    });
  });

  describe('shouldSharePersonalMoment', () => {
    const friendDepth = RelationshipDepth.create({
      vulnerabilityScore: 40,
      trustVelocity: 3,
      sharedHistoryDensity: 30,
      emotionalSafetyIndex: 70,
    });

    const neutralState = EmotionalState.neutral();

    it('should NOT share during crisis', () => {
      const crisisState = EmotionalState.create({
        primary: 'sadness',
        granular: 'devastated',
        intensity: 0.9,
      });

      const result = calculator.shouldSharePersonalMoment(
        'some message',
        0.8,
        crisisState,
        friendDepth
      );

      expect(result.should).toBe(false);
      expect(result.reason).toContain('crisis');
    });

    it('should NOT share when venting', () => {
      const result = calculator.shouldSharePersonalMoment(
        "I can't believe they did this!! So annoyed!",
        0.8,
        neutralState,
        friendDepth
      );

      expect(result.should).toBe(false);
      expect(result.reason).toContain('venting');
    });

    it('should share when timing is good and relevance is high', () => {
      const result = calculator.shouldSharePersonalMoment(
        'What do you think about this?',
        0.7,
        neutralState,
        friendDepth
      );

      expect(result.should).toBe(true);
    });

    it('should share for high relevance even with neutral timing', () => {
      const result = calculator.shouldSharePersonalMoment(
        'I was just thinking about that.',
        0.85, // Very high relevance
        neutralState,
        friendDepth
      );

      expect(result.should).toBe(true);
    });
  });

  describe('shouldBringUpCallback', () => {
    const neutralState = EmotionalState.neutral();

    it('should allow callback during checking_in', () => {
      const result = calculator.shouldBringUpCallback('Hey, how are you?', 'medium', neutralState);

      expect(result.should).toBe(true);
    });

    it('should allow urgent callback in more situations', () => {
      const result = calculator.shouldBringUpCallback(
        'Just wanted to share something with you.',
        'high',
        neutralState
      );

      expect(result.should).toBe(true);
    });

    it('should NOT callback during venting', () => {
      const result = calculator.shouldBringUpCallback(
        "I'm so frustrated with everything right now!",
        'medium',
        neutralState
      );

      expect(result.should).toBe(false);
    });
  });

  describe('shouldSurfacePatternInsight', () => {
    const friendDepth = RelationshipDepth.create({
      vulnerabilityScore: 40,
      trustVelocity: 3,
      sharedHistoryDensity: 30,
      emotionalSafetyIndex: 70,
    });

    const neutralState = EmotionalState.neutral();

    it('should surface high-confidence patterns with good timing', () => {
      const result = calculator.shouldSurfacePatternInsight(
        "I've been wondering about this for a while.",
        0.8, // High confidence
        neutralState,
        friendDepth
      );

      expect(result.should).toBe(true);
    });

    it('should NOT surface for strangers', () => {
      const strangerDepth = RelationshipDepth.stranger();

      const result = calculator.shouldSurfacePatternInsight(
        "I've been wondering about this.",
        0.8,
        neutralState,
        strangerDepth
      );

      expect(result.should).toBe(false);
    });

    it('should NOT surface when trust is declining', () => {
      const decliningTrustDepth = RelationshipDepth.create({
        vulnerabilityScore: 40,
        trustVelocity: -3, // Declining
        sharedHistoryDensity: 30,
        emotionalSafetyIndex: 70,
      });

      const result = calculator.shouldSurfacePatternInsight(
        "I've been wondering about this.",
        0.8,
        neutralState,
        decliningTrustDepth
      );

      expect(result.should).toBe(false);
    });
  });

  describe('formatTimingGuidance', () => {
    it('should format guidance for deep_listening', () => {
      const analysis = calculator.analyzeMessageTiming(
        "I've been feeling overwhelmed and exhausted with everything lately."
      );

      const guidance = calculator.formatTimingGuidance(analysis);

      expect(guidance).toContain('TIMING INTELLIGENCE');
      expect(guidance).toContain('needs_to_be_heard');
    });
  });
});

// ============================================================================
// VULNERABILITY SCORER TESTS
// ============================================================================

describe('VulnerabilityScorer', () => {
  const scorer = new VulnerabilityScorer();

  describe('detectVulnerability', () => {
    it('should detect sacred level vulnerability', () => {
      const result = scorer.detectVulnerability(
        "I've never told anyone this, but I struggle with depression."
      );

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('sacred');
      expect(result.isFirstTime).toBe(true);
      expect(result.firstTimeMarkers).toContain('explicit_first_time');
    });

    it('should detect vulnerable level for struggles', () => {
      const result = scorer.detectVulnerability("I'm really scared about what might happen next.");

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('vulnerable');
      expect(result.category).toBe('fear_confession');
    });

    it('should detect personal level for relationship issues', () => {
      const result = scorer.detectVulnerability(
        "I'm having some relationship issues with my partner."
      );

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('personal');
      expect(result.category).toBe('relationship_issue');
    });

    it('should detect surface level for minor concerns', () => {
      const result = scorer.detectVulnerability("I'm a bit worried about the meeting tomorrow.");

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('surface');
    });

    it('should NOT detect vulnerability in neutral messages', () => {
      const result = scorer.detectVulnerability('The weather is nice today.');

      expect(result.isVulnerable).toBe(false);
    });

    it('should detect first-time markers', () => {
      const result = scorer.detectVulnerability(
        'Can I tell you something? This is really personal.'
      );

      expect(result.isFirstTime).toBe(true);
      expect(result.firstTimeMarkers).toContain('permission_seeking');
    });

    it('should detect hesitation markers', () => {
      const result = scorer.detectVulnerability("Um... well... I've been struggling with anxiety.");

      expect(result.firstTimeMarkers).toContain('hesitation_markers');
    });

    it('should detect minimizing language', () => {
      const result = scorer.detectVulnerability(
        "It's probably nothing, but I've been feeling really down."
      );

      expect(result.firstTimeMarkers).toContain('minimizing_language');
    });

    it('should calculate appropriate trust impact', () => {
      const sacredResult = scorer.detectVulnerability("I've never told anyone about my trauma.");
      const personalResult = scorer.detectVulnerability('I have some money problems right now.');

      expect(sacredResult.trustImpact).toBeGreaterThan(personalResult.trustImpact);
    });

    it('should provide suggested acknowledgment', () => {
      const result = scorer.detectVulnerability(
        "I've been struggling with grief after losing my dad."
      );

      expect(result.suggestedAcknowledgment).toBeTruthy();
      expect(result.suggestedAcknowledgment.length).toBeGreaterThan(0);
    });

    it('should extract keywords', () => {
      const result = scorer.detectVulnerability(
        "I've been struggling with anxiety at work lately."
      );

      expect(result.keywords).toContain('struggling');
      expect(result.keywords).toContain('anxiety');
      expect(result.keywords).toContain('work');
    });
  });

  describe('calculateVulnerabilityScore', () => {
    it('should return 0 for non-vulnerable messages', () => {
      const score = scorer.calculateVulnerabilityScore('Hello, how are you?');

      expect(score).toBe(0);
    });

    it('should return high score for sacred content', () => {
      const score = scorer.calculateVulnerabilityScore("I've never told anyone about my abuse.");

      expect(score).toBeGreaterThan(80);
    });

    it('should return moderate score for personal content', () => {
      const score = scorer.calculateVulnerabilityScore("I'm having relationship problems.");

      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(60);
    });
  });

  describe('needsImmediateAcknowledgment', () => {
    it('should need acknowledgment for sacred shares', () => {
      const result = scorer.needsImmediateAcknowledgment("I've never told anyone about my trauma.");

      expect(result).toBe(true);
    });

    it('should need acknowledgment for first-time vulnerable shares', () => {
      const result = scorer.needsImmediateAcknowledgment(
        "I've never told anyone, but I struggle with anxiety."
      );

      expect(result).toBe(true);
    });

    it('should NOT need acknowledgment for surface shares', () => {
      const result = scorer.needsImmediateAcknowledgment("I'm a bit worried about tomorrow.");

      expect(result).toBe(false);
    });
  });

  describe('formatForDebug', () => {
    it('should format vulnerability detection result', () => {
      const result = scorer.detectVulnerability("I've been struggling with anxiety.");
      const formatted = scorer.formatForDebug(result);

      expect(formatted).toContain('Vulnerability Detection');
      expect(formatted).toContain('Level');
      expect(formatted).toContain('Confidence');
    });
  });
});
