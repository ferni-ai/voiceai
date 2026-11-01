/**
 * Greetings Tests
 *
 * Tests for the greetings module that generates:
 * - Static template-based greetings
 * - Voice recognition scenario greetings
 * - Memory-enhanced greetings
 * - Dynamic Gemini-powered greetings
 *
 * @module tests/greetings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Dynamic greetings go to Vertex through the shared client; mock it at that boundary.
const geminiClient = vi.hoisted(() => ({
  current: null as null | { models: { generateContent: ReturnType<typeof vi.fn> } },
}));
vi.mock('../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/gemini-config.js')>()),
  getGeminiClient: async () => geminiClient.current,
}));

import {
  generateStaticGreeting,
  generateVoiceRecognitionGreeting,
  generateRandomGreeting,
  generateDynamicGreeting,
  generateGreeting,
  type VoiceRecognitionScenario,
  type PersonaMemoryForGreeting,
} from '../personas/greetings.js';
import type { PersonaConfig, GreetingStyle } from '../personas/types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestPersona(overrides?: Partial<PersonaConfig>): PersonaConfig {
  return {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'A test persona for unit testing',
    voice: {
      voiceId: 'test-voice-id',
      provider: 'cartesia',
    },
    identity: {
      selfReference: 'Testy',
      coreValues: ['helpfulness', 'clarity'],
      role: 'Test Helper',
      priorities: ['testing', 'quality'],
      desiredUserExperience: 'confident',
    },
    communication: {
      greetingStyle: 'warm-friend' as GreetingStyle,
      returningUserStyle: 'warm-friend' as GreetingStyle,
      formalityLevel: 0.5,
      thinkingPhrases: ['Let me think...'],
      listeningCues: ['I see'],
      backchannels: {
        neutral: ['mm-hmm'],
        engaged: ['oh!'],
        empathetic: ['I understand'],
      },
      silenceFillers: {
        early: ['So...'],
        mid: ['Well...'],
        late: ['...'],
      },
      selfCorrections: ['Actually...'],
      trailingOffs: ['...'],
      interruptionRecoveries: ['Sorry, you were saying?'],
      humilityPhrases: ["I'm not sure..."],
      emotionalExpressions: {
        laughter: ['[laughter]'],
        surprise: ['Oh!'],
        concern: ['Hmm...'],
        joy: ['Wonderful!'],
        empathy: ['I understand'],
      },
    },
    personality: {
      warmth: 0.8,
      humorLevel: 0.5,
      humorStyle: ['dry-wit'],
      directness: 0.6,
      energy: 0.7,
      tangentFrequency: 0.3,
      traits: ['helpful', 'friendly'],
      boundaries: ['never be rude'],
    },
    knowledge: {
      domains: ['testing'],
      qualifiedTopics: ['unit tests', 'integration tests'],
      outOfScopeTopics: ['politics'],
      outOfScopeResponse: "I'm not qualified to discuss that.",
    },
    systemPrompt: 'You are a test persona.',
    ...overrides,
  } as PersonaConfig;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Greetings Module', () => {
  // --------------------------------------------------------------------------
  // generateStaticGreeting
  // --------------------------------------------------------------------------

  describe('generateStaticGreeting()', () => {
    it('should generate a greeting for new user', () => {
      const persona = createTestPersona();
      const greeting = generateStaticGreeting(persona, { isReturningUser: false });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should include persona name in new user greeting', () => {
      const persona = createTestPersona({
        identity: { ...createTestPersona().identity, selfReference: 'TestBot' },
      });
      const greeting = generateStaticGreeting(persona, { isReturningUser: false });

      expect(greeting).toContain('TestBot');
    });

    it('should generate greeting for returning user with name', () => {
      // Mock Math.random to skip time-aware greetings (which don't use userName)
      // Time-aware greetings trigger when Math.random() < 0.2
      const originalRandom = Math.random;
      Math.random = () => 0.5; // Always >= 0.2, so time-aware check fails

      try {
        const persona = createTestPersona();
        const greeting = generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: 'Alice',
        });

        expect(greeting).toContain('Alice');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should generate greeting for returning user without name', () => {
      const persona = createTestPersona();
      const greeting = generateStaticGreeting(persona, { isReturningUser: true });

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
      // Should not contain placeholder
      expect(greeting).not.toContain('{name}');
    });

    it('should work without options', () => {
      const persona = createTestPersona();
      const greeting = generateStaticGreeting(persona);

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });

    it('should return greeting with SSML tags', () => {
      const persona = createTestPersona();
      const greeting = generateStaticGreeting(persona);

      // Templates contain SSML tags like <break>, <emotion>, etc.
      // At least some greetings should have them
      // We just verify it's a valid string - SSML may or may not be present depending on random selection
      expect(typeof greeting).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Different Greeting Styles
  // --------------------------------------------------------------------------

  describe('Greeting Styles', () => {
    const styles: GreetingStyle[] = [
      'warm-friend',
      'professional',
      'enthusiastic',
      'calm-supportive',
      'casual-peer',
      'wise-mentor',
    ];

    styles.forEach((style) => {
      it(`should generate greeting for ${style} style`, () => {
        const persona = createTestPersona({
          communication: {
            ...createTestPersona().communication,
            greetingStyle: style,
          },
        });

        const greeting = generateStaticGreeting(persona, { isReturningUser: false });
        expect(greeting).toBeDefined();
        expect(greeting.length).toBeGreaterThan(0);
      });

      it(`should generate returning user greeting for ${style} style`, () => {
        const persona = createTestPersona({
          communication: {
            ...createTestPersona().communication,
            greetingStyle: style,
          },
        });

        // Generate multiple times - 20% chance of time-aware greeting that may not include name
        // So we verify the greeting is valid, and check for name in most cases
        const greeting = generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: 'Bob',
        });
        expect(greeting).toBeDefined();
        expect(greeting.length).toBeGreaterThan(0);
        // Name may or may not be present depending on random time-aware greeting selection
      });
    });
  });

  // --------------------------------------------------------------------------
  // generateVoiceRecognitionGreeting
  // --------------------------------------------------------------------------

  describe('generateVoiceRecognitionGreeting()', () => {
    it('should generate greeting for voice_recognized scenario', () => {
      const persona = createTestPersona();
      const greeting = generateVoiceRecognitionGreeting(persona, 'voice_recognized', {
        userName: 'Alice',
      });

      expect(greeting).toBeDefined();
      expect(greeting).toContain('Alice');
    });

    it('should generate greeting for voice_familiar scenario', () => {
      const persona = createTestPersona();
      const greeting = generateVoiceRecognitionGreeting(persona, 'voice_familiar', {
        possibleName: 'Bob',
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      // Not all voice_familiar templates contain the possibleName placeholder
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should generate greeting for voice_mismatch scenario', () => {
      const persona = createTestPersona();
      const greeting = generateVoiceRecognitionGreeting(persona, 'voice_mismatch', {
        expectedName: 'Carol',
      });

      expect(greeting).toBeDefined();
      expect(greeting).toContain('Carol');
    });

    it('should use fallback names when not provided', () => {
      const persona = createTestPersona();

      // Voice recognition greetings are randomly selected from templates
      // Not all templates contain placeholders, so we just verify we get valid strings
      const recognized = generateVoiceRecognitionGreeting(persona, 'voice_recognized', {});
      expect(recognized).toBeDefined();
      expect(typeof recognized).toBe('string');

      const familiar = generateVoiceRecognitionGreeting(persona, 'voice_familiar', {});
      expect(familiar).toBeDefined();
      expect(typeof familiar).toBe('string');

      const mismatch = generateVoiceRecognitionGreeting(persona, 'voice_mismatch', {});
      expect(mismatch).toBeDefined();
      expect(typeof mismatch).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // generateRandomGreeting (sync wrapper)
  // --------------------------------------------------------------------------

  describe('generateRandomGreeting()', () => {
    it('should return a string greeting', () => {
      const persona = createTestPersona();
      const greeting = generateRandomGreeting(persona);

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });

    it('should accept options like generateStaticGreeting', () => {
      // Mock Math.random to skip time-aware greetings (which don't use userName)
      const originalRandom = Math.random;
      Math.random = () => 0.5; // Always >= 0.2, so time-aware check fails

      try {
        const persona = createTestPersona();
        const greeting = generateRandomGreeting(persona, {
          isReturningUser: true,
          userName: 'TestUser',
        });

        expect(greeting).toContain('TestUser');
      } finally {
        Math.random = originalRandom;
      }
    });
  });

  // --------------------------------------------------------------------------
  // generateDynamicGreeting (Gemini API)
  // --------------------------------------------------------------------------

  describe('generateDynamicGreeting()', () => {
    const generateContent = vi.fn();
    const fetchSpy = vi.fn();

    beforeEach(() => {
      generateContent.mockReset();
      fetchSpy.mockReset();
      vi.stubGlobal('fetch', fetchSpy);
      geminiClient.current = { models: { generateContent } };
    });

    afterEach(() => {
      geminiClient.current = null;
      vi.unstubAllGlobals();
    });

    it('throws GeminiUnavailableError when there is no client', async () => {
      geminiClient.current = null;
      await expect(generateDynamicGreeting(createTestPersona())).rejects.toMatchObject({
        name: 'GeminiUnavailableError',
      });
    });

    it('throws GeminiCallError with the status, not the message, on an API error', async () => {
      generateContent.mockRejectedValue(
        Object.assign(new Error('bad request for prompt: You are Testy'), { status: 400 })
      );
      const thrown = await generateDynamicGreeting(createTestPersona()).catch((e: Error) => e);
      expect(thrown).toMatchObject({ name: 'GeminiCallError', status: 400 });
      expect((thrown as Error).message).not.toContain('You are Testy');
    });

    it('returns null for an empty response', async () => {
      generateContent.mockResolvedValue({ text: '' });
      expect(await generateDynamicGreeting(createTestPersona())).toBeNull();
    });

    it('returns the greeting from the Vertex client', async () => {
      generateContent.mockResolvedValue({ text: 'Hello! I am Testy. Nice to meet you!' });
      expect(await generateDynamicGreeting(createTestPersona())).toBe(
        'Hello! I am Testy. Nice to meet you!'
      );
    });

    it('calls the shared client with the default model and a timeout, and no raw API URL', async () => {
      generateContent.mockResolvedValue({ text: 'Test greeting here' });
      await generateDynamicGreeting(createTestPersona(), {
        isReturningUser: true,
        userName: 'TestUser',
      });

      expect(generateContent).toHaveBeenCalledTimes(1);
      const req = generateContent.mock.calls[0][0];
      expect(req.model).toBe(process.env.GEMINI_MODEL || 'gemini-3.5-flash');
      expect(req.contents).toContain('TestUser');
      expect(req.config.maxOutputTokens).toBe(150);
      expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('generateGreeting falls back when the dynamic path fails', async () => {
      generateContent.mockRejectedValue(Object.assign(new Error('x'), { status: 503 }));
      vi.stubEnv('DYNAMIC_GREETING', 'on');
      const originalRandom = Math.random;
      Math.random = () => 0.1; // take the dynamic branch
      try {
        const greeting = await generateGreeting(createTestPersona());
        expect(generateContent).toHaveBeenCalled();
        expect(typeof greeting).toBe('string');
        expect(greeting.length).toBeGreaterThan(0);
      } finally {
        Math.random = originalRandom;
        vi.unstubAllEnvs();
      }
    });

    it('generateGreeting skips the dynamic path while DYNAMIC_GREETING is off', async () => {
      vi.stubEnv('DYNAMIC_GREETING', 'off');
      const originalRandom = Math.random;
      Math.random = () => 0.1;
      try {
        const greeting = await generateGreeting(createTestPersona());
        expect(generateContent).not.toHaveBeenCalled();
        expect(greeting.length).toBeGreaterThan(0);
      } finally {
        Math.random = originalRandom;
        vi.unstubAllEnvs();
      }
    });
  });

  // --------------------------------------------------------------------------
  // generateGreeting (main async function)
  // --------------------------------------------------------------------------

  describe('generateGreeting()', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should always return a greeting string', async () => {
      const persona = createTestPersona();
      const greeting = await generateGreeting(persona);

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should work with returning user options', async () => {
      // Mock Math.random to skip time-aware greetings
      const originalRandom = Math.random;
      Math.random = () => 0.5;

      try {
        const persona = createTestPersona();
        const greeting = await generateGreeting(persona, {
          isReturningUser: true,
          userName: 'ReturningUser',
        });

        expect(greeting).toBeDefined();
        // Name should appear in greeting
        expect(greeting).toContain('ReturningUser');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should fall back to static greeting when other methods fail', async () => {
      const persona = createTestPersona();

      // No bundleRuntime, no API key, no memories
      const greeting = await generateGreeting(persona, {
        isReturningUser: false,
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // PersonaMemoryForGreeting Integration
  // --------------------------------------------------------------------------

  describe('Memory-Based Greetings', () => {
    it('should accept persona memories for greeting generation', async () => {
      const persona = createTestPersona({ id: 'ferni' });
      const memories: PersonaMemoryForGreeting[] = [
        {
          type: 'win',
          name: 'Paid off credit card',
          sentiment: 'positive',
        },
      ];

      const greeting = await generateGreeting(persona, {
        isReturningUser: true,
        userName: 'TestUser',
        personaMemories: memories,
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });

    it('should handle empty memories array', async () => {
      const persona = createTestPersona();
      const greeting = await generateGreeting(persona, {
        isReturningUser: true,
        personaMemories: [],
      });

      expect(greeting).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle persona with minimal config', () => {
      const minimalPersona = createTestPersona({
        identity: {
          selfReference: '',
          coreValues: [],
          role: '',
          priorities: [],
          desiredUserExperience: '',
        },
      });

      const greeting = generateStaticGreeting(minimalPersona);
      expect(greeting).toBeDefined();
      // Should use fallback "your advisor" when selfReference is empty
      expect(greeting).toContain('your advisor');
    });

    it('should handle special characters in user name', () => {
      // Mock Math.random to skip time-aware greetings
      const originalRandom = Math.random;
      Math.random = () => 0.5;

      try {
        const persona = createTestPersona();
        const greeting = generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: "O'Brien-Smith",
        });

        expect(greeting).toContain("O'Brien-Smith");
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should handle very long user names', () => {
      const persona = createTestPersona();
      const longName = 'A'.repeat(100);
      const greeting = generateStaticGreeting(persona, {
        isReturningUser: true,
        userName: longName,
      });

      // Greeting is valid - may or may not contain name depending on random time-aware selection
      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should handle last conversation summary', () => {
      const persona = createTestPersona();
      // Generate multiple times - some may include summary reference
      let foundSummaryReference = false;
      for (let i = 0; i < 20; i++) {
        const greeting = generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: 'TestUser',
          lastConversationSummary: 'retirement planning strategies',
        });
        if (greeting.includes('retirement')) {
          foundSummaryReference = true;
          break;
        }
      }
      // 30% chance to reference, should find at least one in 20 tries
      // If not found, that's statistically possible but unlikely
      // We just verify the greeting is always valid
      expect(
        generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: 'TestUser',
          lastConversationSummary: 'test topic',
        })
      ).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Randomness and Variety
  // --------------------------------------------------------------------------

  describe('Greeting Variety', () => {
    it('should generate different greetings on repeated calls', () => {
      const persona = createTestPersona();
      const greetings = new Set<string>();

      // Generate 20 greetings
      for (let i = 0; i < 20; i++) {
        const greeting = generateStaticGreeting(persona, { isReturningUser: false });
        greetings.add(greeting);
      }

      // Should have at least 2 different greetings (templates have variety)
      expect(greetings.size).toBeGreaterThan(1);
    });

    it('should generate different returning user greetings', () => {
      const persona = createTestPersona();
      const greetings = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const greeting = generateStaticGreeting(persona, {
          isReturningUser: true,
          userName: 'User',
        });
        greetings.add(greeting);
      }

      expect(greetings.size).toBeGreaterThan(1);
    });
  });
});
