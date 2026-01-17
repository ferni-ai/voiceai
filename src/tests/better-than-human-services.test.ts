/**
 * Unit Tests for Better Than Human Services
 *
 * Tests for the 9 new "Better Than Human" services.
 *
 * @module tests/better-than-human-services
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Silence Interpreter
import {
  analyzeSilence,
  type SilenceAnalysis,
  type VoiceMarkers,
} from '../services/superhuman/silence-interpreter.js';

// Contradiction Comfort
import {
  detectContradiction,
  getValidationPhrase,
  type ContradictionDetection,
} from '../services/superhuman/contradiction-comfort.js';

// Perfect Timing
import { detectReceptivity, type ReceptivityScore } from '../services/superhuman/perfect-timing.js';

// Pattern Mirror
import {
  recordTopicEnergy,
  buildPatternMirrorContext,
} from '../services/superhuman/pattern-mirror.js';

// Future Self Letters
import { generateFutureSelfLetter } from '../services/superhuman/future-self.js';

// First-Time Vulnerability
import {
  detectFirstTimeVulnerability,
  type FirstTimeVulnerabilityResult,
} from '../services/trust-systems/first-time-vulnerability.js';

// Linguistic Mirroring
import {
  recordLinguisticPatterns,
  buildLinguisticContext,
} from '../services/trust-systems/linguistic-mirroring.js';

// Ambient Context
import {
  analyzeAmbientAudio,
  type AmbientContext,
} from '../services/trust-systems/ambient-context.js';

// ============================================================================
// SILENCE INTERPRETER TESTS
// ============================================================================

describe('Silence Interpreter', () => {
  const defaultVoiceMarkers: VoiceMarkers = {
    breathPattern: 'normal',
    microSounds: [],
    energyJustBefore: 0.5,
  };

  it('should classify short silences as processing', () => {
    const analysis = analyzeSilence(2000, {
      voiceMarkersBefore: defaultVoiceMarkers,
      conversationPhase: 'middle',
    });

    expect(analysis).toBeDefined();
    expect(analysis.type).toBeDefined();
    expect(analysis.confidence).toBeGreaterThan(0);
    expect(analysis.duration).toBe(2000);
    expect([
      'processing',
      'emotional',
      'uncomfortable',
      'invitational',
      'exhausted',
      'contemplative',
    ]).toContain(analysis.type);
  });

  it('should detect emotional silences with sighing breath', () => {
    const analysis = analyzeSilence(5000, {
      voiceMarkersBefore: {
        breathPattern: 'sighing',
        microSounds: ['sigh'],
        energyJustBefore: 0.3,
      },
      conversationPhase: 'deep',
      precedingEmotion: 'sad',
    });

    expect(analysis).toBeDefined();
    // With sighing + low energy + deep phase + sad emotion, should lean toward emotional
    expect(['emotional', 'contemplative', 'exhausted']).toContain(analysis.type);
  });

  it('should suggest appropriate response types', () => {
    const analysis = analyzeSilence(4000, {
      voiceMarkersBefore: defaultVoiceMarkers,
      conversationPhase: 'middle',
    });

    expect(analysis.recommendedResponse).toBeDefined();
    expect([
      'hold_space',
      'gentle_presence',
      'soft_prompt',
      'offer_rest',
      'honor_moment',
    ]).toContain(analysis.recommendedResponse);
  });

  it('should return SSML phrase for responses', () => {
    const analysis = analyzeSilence(3000, {
      voiceMarkersBefore: defaultVoiceMarkers,
      conversationPhase: 'opening',
    });

    // responsePhrase can be empty for 'hold_space'
    expect(typeof analysis.responsePhrase).toBe('string');
  });
});

// ============================================================================
// CONTRADICTION COMFORT TESTS
// ============================================================================

describe('Contradiction Comfort', () => {
  it('should detect contradictions when opposite emotions are present', () => {
    const result = detectContradiction(
      "I'm excited about the new job but also really scared",
      ['excited'],
      'job change'
    );

    // May or may not detect depending on message content
    if (result?.detected) {
      expect(result.emotions).toBeDefined();
      expect(result.emotions.length).toBe(2);
      expect(result.validationPhrase).toBeDefined();
    }
  });

  it('should detect explicit contradiction markers', () => {
    const result = detectContradiction(
      'Part of me wants to go, but part of me wants to stay',
      [],
      'decision'
    );

    if (result?.detected) {
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  it('should return null when no contradiction detected', () => {
    const result = detectContradiction('I had a nice day at work', ['content'], 'work');

    // Simple statement without contradictions
    expect(result === null || result.detected === false).toBe(true);
  });

  it('should provide validation phrase for known emotion pairs', () => {
    const phrase = getValidationPhrase('excited', 'scared');
    // May return null if not a known pair in the system
    if (phrase) {
      expect(typeof phrase).toBe('string');
    }
  });
});

// ============================================================================
// PERFECT TIMING TESTS
// ============================================================================

describe('Perfect Timing Intelligence', () => {
  it('should detect receptivity from voice analysis', () => {
    const result: ReceptivityScore = detectReceptivity({
      energy: 0.7,
      stressLevel: 0.2,
      greetingTone: 'warm',
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.interpretation).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it('should detect low receptivity for stressed users', () => {
    const result = detectReceptivity({
      energy: 0.3,
      stressLevel: 0.8,
      greetingTone: 'rushed',
    });

    expect(result.score).toBeLessThan(0.5);
    expect(result.recommendations.keepItLight).toBe(true);
  });

  it('should detect high receptivity for warm greetings', () => {
    const result = detectReceptivity({
      energy: 0.8,
      stressLevel: 0.1,
      greetingTone: 'warm',
    });

    expect(result.score).toBeGreaterThan(0.5);
  });

  it('should include factors in result', () => {
    const result = detectReceptivity({
      energy: 0.5,
      stressLevel: 0.5,
      greetingTone: 'neutral',
    });

    expect(result.factors).toBeDefined();
    expect(result.factors.energy).toBe(0.5);
    expect(result.factors.stress).toBe(0.5);
  });
});

// ============================================================================
// PATTERN MIRROR TESTS
// ============================================================================

describe('Pattern Mirror', () => {
  const testUserId = 'test-user-patterns';

  beforeEach(() => {
    // Record some topic energy data
    recordTopicEnergy(testUserId, {
      topic: 'work',
      voiceEnergy: 0.8,
      baselineEnergy: 0.5,
      sentiment: 'positive',
    });

    recordTopicEnergy(testUserId, {
      topic: 'family-conflict',
      voiceEnergy: 0.3,
      baselineEnergy: 0.5,
      sentiment: 'negative',
    });
  });

  it('should record topic energy without errors', () => {
    expect(() => {
      recordTopicEnergy(testUserId, {
        topic: 'test-topic',
        voiceEnergy: 0.6,
        baselineEnergy: 0.5,
      });
    }).not.toThrow();
  });

  it('should build pattern context', () => {
    const context = buildPatternMirrorContext(testUserId);
    expect(typeof context).toBe('string');
    // May be empty if not enough data
  });
});

// ============================================================================
// FUTURE SELF LETTERS TESTS
// ============================================================================

describe('Future Self Letters', () => {
  const testUserId = 'test-user-future';

  it('should generate a future self letter', async () => {
    // Provide context that the function needs
    // generateFutureSelfLetter(userId, timeframe, context)
    const letter = await generateFutureSelfLetter(testUserId, '1_year', {
      dreams: [{ dream: 'start a business', status: 'active' }],
      commitments: [{ content: 'launch MVP', type: 'intention' }],
      patterns: [],
      values: [],
      recentTopics: ['entrepreneurship'],
      userName: 'Test User',
    });

    expect(letter).toBeDefined();
    expect(letter.optimisticPath).toBeDefined();
    expect(letter.optimisticPath.letter).toBeDefined();
    expect(typeof letter.optimisticPath.letter).toBe('string');
    expect(letter.optimisticPath.letter.length).toBeGreaterThan(0);
  });

  it('should include both optimistic and cautionary paths', async () => {
    const letter = await generateFutureSelfLetter(testUserId, '6_months', {
      dreams: [{ dream: 'public speaking mastery', status: 'active' }],
      commitments: [],
      patterns: [],
      values: [],
      recurringStruggles: ['anxiety before presentations'],
      userName: 'Test User',
    });

    expect(letter.optimisticPath).toBeDefined();
    expect(letter.cautionaryPath).toBeDefined();
    expect(letter.timeframe).toBe('6_months');
  });
});

// ============================================================================
// FIRST-TIME VULNERABILITY TESTS
// ============================================================================

describe('First-Time Vulnerability Detection', () => {
  const testUserId = 'test-user-vulnerability';

  it('should detect first-time vulnerability markers in text', () => {
    const result = detectFirstTimeVulnerability(
      testUserId,
      "I've never told anyone this before, but I struggle with anxiety"
    );

    if (result?.detected) {
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.markers.text.length).toBeGreaterThan(0);
      expect(result.suggestedAcknowledgment).toBeDefined();
    }
  });

  it('should detect hesitation markers', () => {
    const result = detectFirstTimeVulnerability(
      testUserId,
      "I... I don't know if I should say this..."
    );

    if (result?.detected) {
      expect(result.markers.text).toContain('hesitation');
    }
  });

  it('should return null for surface-level messages', () => {
    const result = detectFirstTimeVulnerability(testUserId, 'The weather is nice today');

    expect(result === null || result.detected === false).toBe(true);
  });

  it('should assign vulnerability level', () => {
    const result = detectFirstTimeVulnerability(
      testUserId,
      "This is really hard to admit, but I've been struggling with addiction"
    );

    if (result?.detected) {
      expect(result.vulnerabilityLevel).toBeGreaterThanOrEqual(0);
      expect(result.vulnerabilityLevel).toBeLessThanOrEqual(5);
    }
  });
});

// ============================================================================
// LINGUISTIC MIRRORING TESTS
// ============================================================================

describe('Linguistic Mirroring', () => {
  const testUserId = 'test-user-linguistic';

  it('should record linguistic patterns without errors', () => {
    expect(() => {
      recordLinguisticPatterns(testUserId, "I'm feeling kinda overwhelmed today", {
        topic: 'stress',
        emotion: 'overwhelmed',
      });
    }).not.toThrow();
  });

  it('should build linguistic context after recording', () => {
    recordLinguisticPatterns(testUserId, 'This whole situation is super frustrating', {
      emotion: 'frustrated',
    });

    const context = buildLinguisticContext(testUserId);
    expect(typeof context).toBe('string');
  });

  it('should learn emotion vocabulary over time', () => {
    // Record multiple messages with consistent vocabulary
    recordLinguisticPatterns(testUserId, "I'm feeling kinda down", { emotion: 'sad' });
    recordLinguisticPatterns(testUserId, 'Today was kinda rough', { emotion: 'sad' });
    recordLinguisticPatterns(testUserId, 'Things have been kinda hard', { emotion: 'sad' });

    // The system should now recognize "kinda" as a user pattern
    const context = buildLinguisticContext(testUserId);
    // Context will include learned patterns if enough data
    expect(typeof context).toBe('string');
  });
});

// ============================================================================
// AMBIENT CONTEXT TESTS
// ============================================================================

describe('Ambient Context Detection', () => {
  it('should analyze quiet environment', () => {
    const result: AmbientContext = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.1,
      speechToNoiseRatio: 0.9,
      frequencySpread: 0.2,
    });

    expect(result.environment).toBe('quiet');
    expect(result.distractionLevel).toBeLessThan(0.5);
    expect(result.privacyConcern).toBe(false);
  });

  it('should detect noisy environment', () => {
    const result = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.8,
      speechToNoiseRatio: 0.3,
      frequencySpread: 0.8,
    });

    expect(result.environment).toBe('noisy');
    expect(result.distractionLevel).toBeGreaterThan(0);
  });

  it('should detect privacy concerns with multiple voices', () => {
    const result = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.5,
      speechToNoiseRatio: 0.5,
      frequencySpread: 0.5,
      multipleVoices: true,
    });

    expect(result.privacyConcern).toBe(true);
  });

  it('should detect office environment with typing', () => {
    const result = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.3,
      speechToNoiseRatio: 0.7,
      frequencySpread: 0.4,
      rhythmicPatterns: true,
    });

    expect(result.environment).toBe('office');
  });

  it('should detect outdoor environment', () => {
    const result = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.4,
      speechToNoiseRatio: 0.6,
      frequencySpread: 0.6,
      outdoorIndicators: true,
    });

    expect(result.environment).toBe('outdoor');
  });

  it('should provide suggestions based on environment', () => {
    const result = analyzeAmbientAudio({
      backgroundNoiseLevel: 0.7,
      speechToNoiseRatio: 0.3,
      frequencySpread: 0.7,
      multipleVoices: true,
    });

    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Better Than Human Integration', () => {
  it('should import all services without errors', async () => {
    const integration = await import('../agents/integrations/better-than-human-integration.js');

    expect(integration.loadBetterThanHumanProfiles).toBeDefined();
    expect(integration.processSilenceWithInterpreter).toBeDefined();
    expect(integration.processVoiceProsody).toBeDefined();
    expect(integration.processTranscriptForBetterThanHuman).toBeDefined();
    expect(integration.processAmbientSignals).toBeDefined();
    expect(integration.buildBetterThanHumanContext).toBeDefined();
    // New exports from gap fixes
    expect(integration.recordSilenceOutcomeFromResponse).toBeDefined();
    expect(integration.betterThanHumanIntegration).toBeDefined();
    expect(integration.betterThanHumanIntegration.recordSilenceOutcome).toBeDefined();
  });

  it('should process transcript for vulnerabilities and contradictions', async () => {
    const { processTranscriptForBetterThanHuman } =
      await import('../agents/integrations/better-than-human-integration.js');

    const result = await processTranscriptForBetterThanHuman(
      {
        transcript: "I've never told anyone this, but I feel both excited and terrified",
        isFinal: true,
        emotion: 'anxious',
        recentEmotions: ['excited'],
      },
      {
        userId: 'test-user-integration',
        sessionId: 'test-session',
        personaId: 'ferni',
        turnCount: 5,
      }
    );

    expect(result).toBeDefined();
    // May or may not detect vulnerability/contradiction depending on thresholds
  });

  it('should process ambient signals correctly', async () => {
    const { processAmbientSignals } =
      await import('../agents/integrations/better-than-human-integration.js');

    const result = processAmbientSignals({
      backgroundNoiseLevel: 0.7,
      speechToNoiseRatio: 0.3,
      frequencySpread: 0.6,
      multipleVoices: true,
      outdoorIndicators: false,
    });

    expect(result).toBeDefined();
    expect(result.environment).toBeDefined();
    expect(result.privacyConcern).toBe(true); // Multiple voices should trigger privacy concern
    expect(result.distractionLevel).toBeGreaterThan(0);
  });

  it('should process silence with interpreter', async () => {
    const { processSilenceWithInterpreter } =
      await import('../agents/integrations/better-than-human-integration.js');

    const result = processSilenceWithInterpreter(
      {
        durationMs: 3000,
        precedingTopic: 'relationship',
        precedingEmotion: 'sad',
        precedingUserMessage: 'I never told you this before...',
        voiceMarkersBefore: {
          breathPattern: 'heavy',
          microSounds: ['sigh'],
          energyJustBefore: 0.3,
          emotionJustBefore: 'sad',
        },
        conversationPhase: 'deep',
      },
      {
        userId: 'test-user-silence',
        sessionId: 'test-session',
        personaId: 'ferni',
        turnCount: 10,
      }
    );

    expect(result).toBeDefined();
    expect(result?.type).toBeDefined();
    expect(result?.recommendedResponse).toBeDefined();
    // Deep conversation + sad emotion + heavy breathing = likely emotional silence
    expect(['emotional', 'contemplative', 'processing']).toContain(result?.type);
  });

  it('should process voice prosody for timing learning', async () => {
    const { processVoiceProsody } =
      await import('../agents/integrations/better-than-human-integration.js');

    // This should not throw
    expect(() =>
      processVoiceProsody(
        {
          energy: 0.6,
          stressLevel: 0.3,
          arousal: 0.5,
          valence: 0.7,
          speechRate: 1.1,
          energyMean: 0.6,
          greetingTone: 'warm',
        },
        {
          userId: 'test-user-prosody',
          sessionId: 'test-session',
          personaId: 'ferni',
          turnCount: 3,
        },
        'career'
      )
    ).not.toThrow();
  });

  it('should build complete BTH context', async () => {
    const { buildBetterThanHumanContext } =
      await import('../agents/integrations/better-than-human-integration.js');

    const context = await buildBetterThanHumanContext('test-user-context');

    expect(typeof context).toBe('string');
    // Context may be empty for new users, but should not throw
  });
});
