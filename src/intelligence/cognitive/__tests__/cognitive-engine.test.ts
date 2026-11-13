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
  buildConstraints,
  buildCognitiveContext,
  buildCognitivePromptInjection,
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
