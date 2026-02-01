/**
 * Cognitive Intelligence Engine Tests
 *
 * Tests cognitive differentiation loading, constraint building, and context generation.
 *
 * @module intelligence/cognitive/__tests__/cognitive-engine.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CognitiveDifferentiation } from '../../../personas/cognitive-differentiation.js';

// Mock getCognitiveDifferentiation
vi.mock('../../../personas/cognitive-differentiation.js', () => ({
  getCognitiveDifferentiation: vi.fn(),
}));

// Import after mocking
import {
  getCognitiveProfile,
  buildConstraints,
  buildCognitiveContext,
  buildCognitivePromptInjection,
  getCognitiveEngineResult,
  getPersonaQuestion,
  getInsightLeadIn,
  getDisagreementPhrase,
  clearCognitiveCache,
} from '../engine.js';
import { getCognitiveDifferentiation } from '../../../personas/cognitive-differentiation.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockFerniDiff: CognitiveDifferentiation = {
  personaId: 'ferni',
  questioning: {
    openVsClosed: 0.95,
    feelingVsData: 0.85,
    whyVsHow: 0.9,
    followUpFrequency: 0.8,
    questionStarters: [
      "What's the version of this you're not saying out loud?",
      'If that feeling had a voice, what would it say?',
      'What would you do if no one was watching?',
    ],
    deepDiveQuestions: ['What does that mean to you?'],
    avoidQuestions: ['Why did you do that?'],
  },
  silence: {
    primaryInterpretation: 'processing',
    comfortWithSilence: 5000,
    silenceResponses: {
      short: ["I'm here."],
      medium: ['Take your time.'],
      long: ['No rush. When you are ready.'],
    },
    silenceBreakers: ["It sounds like there's more there...", "That's a lot to sit with."],
  },
  disagreement: {
    primaryStyle: 'gentle',
    secondaryStyle: 'curious',
    disagreementFrequency: 0.3,
    strongOpinionTopics: ['self-worth', 'avoiding feelings'],
    disagreementPhrases: {
      mild: ['I wonder if there is another way to see this...'],
      moderate: ['What I am hearing is different from what I am seeing...'],
      strong: ['I care about you too much to let that slide.'],
    },
    reconciliationPhrases: ['We are still figuring this out together.'],
  },
  insight: {
    primaryFraming: 'observation',
    contextualFraming: {
      emotional: 'observation',
      analytical: 'reflection',
      actionable: 'question',
    },
    insightLeadIns: [
      'I notice...',
      'What strikes me is...',
      "There's something about what you said...",
    ],
    softeners: ['I might be wrong, but...', 'I wonder if...'],
    amplifiers: ['This feels important:', "Here's what I keep coming back to:"],
  },
  pacing: {
    baseThinkingTime: 300,
    complexityMultiplier: 1.5,
    emotionalMultiplier: 1.3,
    midResponsePauseFrequency: 0.4,
    thinkingSignals: ['Hmm...', 'Let me think about that...'],
    processingSignals: ["That's landing for me..."],
    breathingTopics: ['loss', 'grief', 'death', 'breakup', 'divorce'],
  },
};

const mockPeterDiff: CognitiveDifferentiation = {
  personaId: 'peter',
  questioning: {
    openVsClosed: 0.7,
    feelingVsData: 0.3, // Data-focused
    whyVsHow: 0.4, // How-focused
    followUpFrequency: 0.9,
    questionStarters: ['What does the data tell us?', "Let's break this down systematically..."],
    deepDiveQuestions: ['What patterns do you see?'],
    avoidQuestions: [],
  },
  silence: {
    primaryInterpretation: 'reflection',
    comfortWithSilence: 3000,
    silenceResponses: {
      short: ['Interesting...'],
      medium: ['Take your time to process.'],
      long: ['Still with me?'],
    },
    silenceBreakers: ['What patterns are emerging for you?'],
  },
  disagreement: {
    primaryStyle: 'evidence_based',
    secondaryStyle: 'data_driven',
    disagreementFrequency: 0.5,
    strongOpinionTopics: ['financial planning', 'risk assessment'],
    disagreementPhrases: {
      mild: ['The research suggests otherwise...'],
      moderate: ['Based on the evidence, I see it differently.'],
      strong: ['The data clearly shows a different picture.'],
    },
    reconciliationPhrases: ["Let's look at the numbers together."],
  },
  insight: {
    primaryFraming: 'data',
    contextualFraming: {
      emotional: 'metaphor',
      analytical: 'data',
      actionable: 'example',
    },
    insightLeadIns: ['The research shows...', 'Based on the data...'],
    softeners: ['Early evidence suggests...'],
    amplifiers: ['The data is clear:'],
  },
  pacing: {
    baseThinkingTime: 200,
    complexityMultiplier: 2.0,
    emotionalMultiplier: 1.1,
    midResponsePauseFrequency: 0.2,
    thinkingSignals: ['Let me analyze that...'],
    processingSignals: ['Calculating...'],
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('CognitiveEngine', () => {
  beforeEach(() => {
    clearCognitiveCache();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getCognitiveProfile
  // ==========================================================================

  describe('getCognitiveProfile', () => {
    it('should load Ferni cognitive profile', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const profile = getCognitiveProfile('ferni');

      expect(profile).not.toBeNull();
      expect(profile?.personaId).toBe('ferni');
      expect(profile?.questioning.whyVsHow).toBe(0.9);
      expect(profile?.silence.primaryInterpretation).toBe('processing');
    });

    it('should load Peter cognitive profile with different style', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockPeterDiff);

      const profile = getCognitiveProfile('peter');

      expect(profile).not.toBeNull();
      expect(profile?.personaId).toBe('peter');
      expect(profile?.questioning.feelingVsData).toBe(0.3); // Data-focused
      expect(profile?.insight.primaryFraming).toBe('data');
    });

    it('should cache loaded profiles', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      getCognitiveProfile('ferni');
      getCognitiveProfile('ferni');

      // Should only call underlying function once
      expect(getCognitiveDifferentiation).toHaveBeenCalledTimes(1);
    });

    it('should return null for unknown persona', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const profile = getCognitiveProfile('unknown');

      expect(profile).toBeNull();
    });
  });

  // ==========================================================================
  // buildConstraints
  // ==========================================================================

  describe('buildConstraints', () => {
    it('should build questioning constraints for why-focused persona', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const constraints = buildConstraints(profile);

      expect(constraints.questioning.preferWhyQuestions).toBe(true);
      expect(constraints.questioning.preferFeelingsOverData).toBe(true);
      expect(constraints.questioning.preferOpenEnded).toBe(true);
    });

    it('should build questioning constraints for how-focused persona', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockPeterDiff);
      const profile = getCognitiveProfile('peter')!;

      const constraints = buildConstraints(profile);

      expect(constraints.questioning.preferWhyQuestions).toBe(false);
      expect(constraints.questioning.preferFeelingsOverData).toBe(false);
    });

    it('should adjust thinking time for emotional context', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const normalConstraints = buildConstraints(profile);
      const emotionalConstraints = buildConstraints(profile, {
        personaId: 'ferni',
        userContext: { emotionalIntensity: 0.9 },
      });

      expect(emotionalConstraints.pacing.thinkingTimeMs).toBeGreaterThan(
        normalConstraints.pacing.thinkingTimeMs
      );
    });

    it('should include strong opinion topics', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const constraints = buildConstraints(profile);

      expect(constraints.disagreement.strongTopics).toContain('self-worth');
    });
  });

  // ==========================================================================
  // buildCognitiveContext
  // ==========================================================================

  describe('buildCognitiveContext', () => {
    it('should include question starters in phrases', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const context = buildCognitiveContext(profile);

      expect(context.phrases.questionStarters.length).toBeGreaterThan(0);
      expect(context.phrases.questionStarters.length).toBeLessThanOrEqual(3);
    });

    it('should include silence breakers when silence detected', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const context = buildCognitiveContext(profile, {
        personaId: 'ferni',
        conversationState: { hasSilence: true },
      });

      expect(context.phrases.silenceBreakers.length).toBeGreaterThan(0);
    });

    it('should include insight lead-ins', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const context = buildCognitiveContext(profile);

      expect(context.phrases.insightLeadIns.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // buildCognitivePromptInjection
  // ==========================================================================

  describe('buildCognitivePromptInjection', () => {
    it('should include questioning style for Ferni', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('COGNITIVE STYLE');
      expect(injection).toContain('Ask "why" questions');
      expect(injection).toContain('Ask about feelings');
    });

    it('should include questioning style for Peter', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockPeterDiff);
      const profile = getCognitiveProfile('peter')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('practical "how"');
      expect(injection).toContain('Reference data');
    });

    it('should include silence handling', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('WHEN USER GOES QUIET');
      expect(injection).toContain('Give them space');
    });

    it('should include disagreement approach for personas that disagree', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockPeterDiff);
      const profile = getCognitiveProfile('peter')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('WHEN YOU DISAGREE');
      expect(injection).toContain('evidence');
    });

    it('should include insight framing', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('HOW TO SHARE INSIGHTS');
      expect(injection).toContain('I notice');
    });

    it('should include sample question starters', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);
      const profile = getCognitiveProfile('ferni')!;

      const injection = buildCognitivePromptInjection(profile);

      expect(injection).toContain('SAMPLE QUESTION STARTERS');
    });
  });

  // ==========================================================================
  // getCognitiveEngineResult
  // ==========================================================================

  describe('getCognitiveEngineResult', () => {
    it('should return complete result with profile, context, and injection', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const result = getCognitiveEngineResult('ferni');

      expect(result).not.toBeNull();
      expect(result?.profile).toBeDefined();
      expect(result?.context).toBeDefined();
      expect(result?.promptInjection).toBeDefined();
    });

    it('should return null for unknown persona', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = getCognitiveEngineResult('unknown');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Helper functions
  // ==========================================================================

  describe('getPersonaQuestion', () => {
    it('should return a question starter for Ferni', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const question = getPersonaQuestion('ferni');

      expect(question).not.toBeNull();
      expect(mockFerniDiff.questioning.questionStarters).toContain(question);
    });
  });

  describe('getInsightLeadIn', () => {
    it('should return an insight lead-in for Ferni', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const leadIn = getInsightLeadIn('ferni');

      expect(leadIn).not.toBeNull();
      expect(mockFerniDiff.insight.insightLeadIns).toContain(leadIn);
    });
  });

  describe('getDisagreementPhrase', () => {
    it('should return a moderate disagreement phrase', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const phrase = getDisagreementPhrase('ferni', 'moderate');

      expect(phrase).not.toBeNull();
      expect(mockFerniDiff.disagreement.disagreementPhrases.moderate).toContain(phrase);
    });

    it('should return a mild disagreement phrase when specified', () => {
      (getCognitiveDifferentiation as ReturnType<typeof vi.fn>).mockReturnValue(mockFerniDiff);

      const phrase = getDisagreementPhrase('ferni', 'mild');

      expect(phrase).not.toBeNull();
      expect(mockFerniDiff.disagreement.disagreementPhrases.mild).toContain(phrase);
    });
  });
});
