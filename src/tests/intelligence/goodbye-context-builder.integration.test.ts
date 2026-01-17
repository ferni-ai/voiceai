/**
 * Goodbye Context Builder Integration Tests
 *
 * These tests validate the "Better Than Human" goodbye intelligence:
 * - Anticipates endings before explicit goodbye
 * - Time-aware farewells
 * - Emotional echo for heavy conversations
 * - Personalized sign-offs based on conversation topics
 * - Persona-specific goodbye phrases
 *
 * @module tests/intelligence/goodbye-context-builder.integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// ============================================================================
// IMPORTS
// ============================================================================

import {
  buildGoodbyeContext,
  GOODBYE_PATTERNS,
  PRE_GOODBYE_PATTERNS,
  detectWindingDown,
  getTimeAwareGoodbye,
  detectHeavyConversation,
  generatePersonalizedSignoff,
  type GoodbyeContextInjection,
} from '../../intelligence/context-builders/goodbye.js';
import type { ContextBuilderInput } from '../../intelligence/context-builders/index.js';
import type { PersonaProfile } from '../../personas/types.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockPersona(id = 'ferni', overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    role: 'life-coach',
    voice: {},
    cognitive: {},
    ...overrides,
  } as PersonaProfile;
}

function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: overrides.userText ?? 'Hello',
    analysis: {
      intent: {
        primary: 'conversation',
        confidence: 0.8,
        isQuestion: false,
        suggestedApproach: [],
      },
      emotion: {
        primary: 'neutral',
        valence: 0.5,
        arousal: 0.5,
        confidence: 0.7,
        secondary: [],
      },
      topics: {
        detected: [],
        keywords: [],
      },
      state: {
        phase: 'exploring',
        engagement: 0.7,
        rapport: 0.6,
      },
    },
    userData: {
      turnCount: 5,
      wasInterrupted: false,
      userWentSilent: false,
      ...overrides.userData,
    },
    persona: createMockPersona(overrides.persona?.id),
    userProfile: overrides.userProfile,
    services: overrides.services,
  } as ContextBuilderInput;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Goodbye Context Builder Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // ANTICIPATORY GOODBYE DETECTION
  // ==========================================================================

  describe('Better Than Human: Anticipatory Goodbye Detection', () => {
    it('should detect winding down BEFORE explicit goodbye', () => {
      // These phrases indicate the user is about to leave without saying "goodbye"
      // Must match PRE_GOODBYE_PATTERNS in goodbye.ts
      const windingDownPhrases = [
        "anyway, that's about it", // matches "anyway..." and "that's about it"
        'should probably go now', // matches "should probably go"
        'thanks for listening to me', // matches "thanks for listening"
        'appreciate you', // matches "appreciate you"
        "it's getting late", // matches "it's getting late"
        "I think we're good", // matches "i think we're good"
      ];

      for (const phrase of windingDownPhrases) {
        const detected = detectWindingDown(phrase, 10);
        expect(detected, `Failed to detect winding down for: "${phrase}"`).toBe(true);
      }
    });

    it('should inject pre-goodbye context when user is winding down', () => {
      const input = createMockInput({
        userText: "anyway, that's all I wanted to discuss...",
        userData: { turnCount: 12 },
      });

      const injections = buildGoodbyeContext(input);
      const preGoodbye = injections.find((i) => i.source === 'pre_goodbye');

      expect(preGoodbye).toBeDefined();
      expect(preGoodbye?.content).toContain('WINDING DOWN');
      expect(preGoodbye?.priority).toBe('hint');
    });

    it('should NOT pre-emptively detect goodbye in early conversation', () => {
      const input = createMockInput({
        userText: 'ok, sounds good',
        userData: { turnCount: 2 },
      });

      const injections = buildGoodbyeContext(input);
      const preGoodbye = injections.find((i) => i.source === 'pre_goodbye');

      expect(preGoodbye).toBeUndefined();
    });
  });

  // ==========================================================================
  // TIME-AWARE FAREWELLS
  // ==========================================================================

  describe('Better Than Human: Time-Aware Farewells', () => {
    it('should provide time-appropriate farewell suggestions', () => {
      const result = getTimeAwareGoodbye('America/New_York');

      expect(result).toBeDefined();
      expect(result.timeOfDay).toBeDefined();
      expect(result.suggestion).toBeDefined();
      expect(['morning', 'afternoon', 'evening', 'night']).toContain(result.timeOfDay);
    });

    it('should include time context in goodbye injection when user says goodbye', () => {
      const input = createMockInput({
        userText: 'Goodbye, talk to you later!',
        userData: { turnCount: 10 },
      });

      const injections = buildGoodbyeContext(input);
      const goodbye = injections.find((i) => i.source === 'goodbye');

      expect(goodbye).toBeDefined();
      // Time-aware suggestions are included in the goodbye injection
      expect(goodbye?.content).toContain('GOODBYE DETECTED');
    });
  });

  // ==========================================================================
  // EMOTIONAL ECHO FOR HEAVY CONVERSATIONS
  // ==========================================================================

  describe('Better Than Human: Emotional Echo', () => {
    describe('detectHeavyConversation', () => {
      it('should detect grief-related topics', () => {
        const history = [
          'My dog passed away last week',
          "I've been missing him so much",
          "It's hard to come home to an empty house",
        ];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(true);
        expect(result.topics.length).toBeGreaterThan(0);
      });

      it('should detect mental health topics', () => {
        // Must match HEAVY_CONVERSATION_MARKERS: anxiety, depression, therapy, mental health, trauma
        const topics = [
          { history: ['I started therapy recently'], expected: true },
          { history: ["I've been dealing with depression"], expected: true },
          { history: ['My anxiety has been really bad'], expected: true },
          { history: ["I'm working on my mental health"], expected: true },
        ];

        for (const { history, expected } of topics) {
          const result = detectHeavyConversation(history);
          expect(result.isHeavy, `Failed for: ${history[0]}`).toBe(expected);
        }
      });

      it('should detect relationship pain', () => {
        const history = [
          'Going through a divorce right now',
          'The hardest part is telling the kids',
        ];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(true);
      });

      it('should detect health concerns', () => {
        // Must match HEAVY_CONVERSATION_MARKERS: diagnosis, cancer, illness, hospital
        const history = [
          'Got my diagnosis back from the doctor',
          "They found cancer and I'm scared",
        ];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(true);
      });

      it('should NOT flag casual conversations', () => {
        const history = [
          'I had a great weekend',
          'Went hiking with friends',
          'The weather was perfect',
        ];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(false);
        expect(result.topics).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // PERSONALIZED SIGN-OFFS
  // ==========================================================================

  describe('Better Than Human: Personalized Sign-offs', () => {
    it('should generate personalized sign-off from conversation topics', () => {
      const result = generatePersonalizedSignoff(['job interview', 'career change'], 'Alice');

      expect(result).toBeDefined();
      expect(result).toContain('Alice');
      expect(result).toContain('job interview');
    });

    it('should handle multiple topics gracefully', () => {
      const result = generatePersonalizedSignoff(
        ['meditation', 'exercise routine', 'sleep schedule'],
        'Bob'
      );

      expect(result).toBeDefined();
      expect(result).toContain('Bob');
      // Should reference at least one topic
      expect(
        result!.includes('meditation') || result!.includes('exercise') || result!.includes('sleep')
      ).toBe(true);
    });

    it('should return null for empty topics', () => {
      const result = generatePersonalizedSignoff([]);
      expect(result).toBeNull();
    });

    it('should work without a name', () => {
      const result = generatePersonalizedSignoff(['yoga practice']);
      expect(result).toBeDefined();
      expect(result).toContain('yoga practice');
    });
  });

  // ==========================================================================
  // INTERRUPTION RECOVERY
  // ==========================================================================

  describe('Interruption Recovery', () => {
    it('should inject recovery context when agent was interrupted', () => {
      const input = createMockInput({
        userText: 'wait, hold on',
        userData: { turnCount: 5, wasInterrupted: true },
      });

      const injections = buildGoodbyeContext(input);
      const interruption = injections.find((i) => i.source === 'interruption');

      expect(interruption).toBeDefined();
      expect(interruption?.content).toContain('INTERRUPTION');
      expect(interruption?.priority).toBe('critical');
    });

    it('should NOT inject recovery when not interrupted', () => {
      const input = createMockInput({
        userText: 'wait, hold on',
        userData: { turnCount: 5, wasInterrupted: false },
      });

      const injections = buildGoodbyeContext(input);
      const interruption = injections.find((i) => i.source === 'interruption');

      expect(interruption).toBeUndefined();
    });
  });

  // ==========================================================================
  // SILENCE HANDLING
  // ==========================================================================

  describe('Silence Handling', () => {
    it('should inject silence context when user went silent', () => {
      const input = createMockInput({
        userText: '',
        userData: { turnCount: 8, userWentSilent: true },
      });

      const injections = buildGoodbyeContext(input);
      const silence = injections.find((i) => i.source === 'silence');

      expect(silence).toBeDefined();
      expect(silence?.content).toContain('SILENCE');
    });

    it('should provide appropriate silence fillers based on turn count', () => {
      // Early conversation silence
      const earlyInput = createMockInput({
        userText: '',
        userData: { turnCount: 2, userWentSilent: true },
      });
      const earlyInjections = buildGoodbyeContext(earlyInput);
      const earlySilence = earlyInjections.find((i) => i.source === 'silence');

      // Later conversation silence
      const lateInput = createMockInput({
        userText: '',
        userData: { turnCount: 20, userWentSilent: true },
      });
      const lateInjections = buildGoodbyeContext(lateInput);
      const lateSilence = lateInjections.find((i) => i.source === 'silence');

      // Both should have silence handling but potentially different approaches
      expect(earlySilence).toBeDefined();
      expect(lateSilence).toBeDefined();
    });
  });

  // ==========================================================================
  // EXPLICIT GOODBYE DETECTION
  // ==========================================================================

  describe('Explicit Goodbye Detection', () => {
    const goodbyePhrases = [
      { phrase: 'goodbye', expected: true },
      { phrase: 'bye', expected: true },
      { phrase: 'bye bye', expected: true },
      { phrase: 'gotta go', expected: true },
      { phrase: 'have to go', expected: true },
      { phrase: 'need to go', expected: true },
      { phrase: 'talk later', expected: true },
      { phrase: 'catch you later', expected: true },
      { phrase: 'take care', expected: true },
      { phrase: 'see you', expected: true },
      { phrase: 'see you later', expected: true },
      { phrase: 'until next time', expected: true },
      { phrase: "i'm out", expected: true },
      { phrase: 'signing off', expected: true },
      { phrase: 'heading out', expected: true },
      // Non-goodbye phrases that sound like leaving but aren't in GOODBYE_PATTERNS
      { phrase: "that's all", expected: false }, // This is in PRE_GOODBYE_PATTERNS, not GOODBYE_PATTERNS
      { phrase: 'going to leave now', expected: false }, // Not in GOODBYE_PATTERNS
      // Non-goodbye phrases
      { phrase: 'how are you', expected: false },
      { phrase: "let's talk about goals", expected: false },
      { phrase: 'i need to go over this again', expected: true }, // "need to go" matches
    ];

    it.each(goodbyePhrases)(
      'should correctly classify "$phrase" as goodbye=$expected',
      ({ phrase, expected }) => {
        expect(GOODBYE_PATTERNS.test(phrase)).toBe(expected);
      }
    );

    it('should inject goodbye context for explicit goodbyes', () => {
      const input = createMockInput({
        userText: 'Alright, goodbye!',
        userData: { turnCount: 8 },
      });

      const injections = buildGoodbyeContext(input);
      const goodbye = injections.find((i) => i.source === 'goodbye');

      expect(goodbye).toBeDefined();
      expect(goodbye?.content).toContain('GOODBYE DETECTED');
      expect(goodbye?.content).toContain('SUPERHUMAN WARM WRAP-UP');
    });
  });

  // ==========================================================================
  // PERSONA-SPECIFIC BEHAVIOR
  // ==========================================================================

  describe('Persona-Specific Goodbye Behavior', () => {
    const personas = ['ferni', 'peter', 'maya', 'alex', 'jordan', 'nayan'];

    it.each(personas)('should handle goodbye for %s persona', (personaId) => {
      const input = createMockInput({
        userText: 'Thanks for everything, goodbye!',
        userData: { turnCount: 10 },
        persona: createMockPersona(personaId),
      });

      const injections = buildGoodbyeContext(input);
      const goodbye = injections.find((i) => i.source === 'goodbye');

      expect(goodbye).toBeDefined();
      // Each persona should get goodbye handling
    });

    it.each(personas)('should handle silence for %s persona', (personaId) => {
      const input = createMockInput({
        userText: '',
        userData: { turnCount: 5, userWentSilent: true },
        persona: createMockPersona(personaId),
      });

      const injections = buildGoodbyeContext(input);
      const silence = injections.find((i) => i.source === 'silence');

      expect(silence).toBeDefined();
    });
  });

  // ==========================================================================
  // INJECTION PRIORITY
  // ==========================================================================

  describe('Injection Priority', () => {
    it('should prioritize interruption recovery over other injections', () => {
      const input = createMockInput({
        userText: 'wait, goodbye',
        userData: { turnCount: 10, wasInterrupted: true },
      });

      const injections = buildGoodbyeContext(input);

      // Should have both interruption and goodbye
      const interruption = injections.find((i) => i.source === 'interruption');
      const goodbye = injections.find((i) => i.source === 'goodbye');

      expect(interruption).toBeDefined();
      expect(goodbye).toBeDefined();

      // Interruption should be critical priority
      expect(interruption?.priority).toBe('critical');
    });
  });
});
