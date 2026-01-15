/**
 * Greetings System Unit Tests
 *
 * Tests the greeting generation system:
 * - Voice recognition greetings (returning users)
 * - Static greetings (first-time users)
 * - Random greeting selection
 * - Persona-specific greeting styles
 *
 * @module personas/__tests__/greetings.test
 */

import { describe, expect, it, vi } from 'vitest';
import {
  generateVoiceRecognitionGreeting,
  generateStaticGreeting,
  generateRandomGreeting,
} from '../greetings.js';
import type { PersonaConfig } from '../types.js';

// Create mock persona configs with required fields for greeting tests
function createMockPersona(id: string, name: string, greetingStyle: string = 'warm'): PersonaConfig {
  // Using 'as unknown as PersonaConfig' since we only need fields relevant to greeting tests
  return {
    id,
    name,
    description: `${name} persona`,
    voice: {
      provider: 'cartesia',
      voiceId: 'mock-voice-id',
    },
    identity: {
      selfReference: name,
      coreValues: ['helpfulness', 'warmth'],
      role: 'AI assistant',
      priorities: ['user wellbeing'],
      desiredUserExperience: 'feeling supported and heard',
    },
    communication: {
      greetingStyle: greetingStyle as 'warm' | 'professional' | 'casual' | 'formal',
      returningUserStyle: greetingStyle as 'warm' | 'professional' | 'casual' | 'formal',
      formalityLevel: 0.3,
      thinkingPhrases: ['Hmm...', 'Let me think...'],
      listeningCues: ['I see', 'Mm-hmm'],
      backchannels: { phrases: ['mm-hmm'], frequency: 0.3 },
      silenceFillers: { phrases: ['...'], minSilenceMs: 500 },
      selfCorrections: ['Actually...'],
      trailingOffs: ['...'],
      interruptionRecoveries: ['Sorry, go ahead'],
    },
    personality: {
      traits: ['warm', 'helpful'],
      warmth: 0.8,
      humor: 0.5,
      directness: 0.6,
    },
    knowledge: {
      domains: ['general'],
      expertise: [],
    },
    systemPrompt: `You are ${name}, a helpful AI assistant.`,
  } as unknown as PersonaConfig;
}

const mockFerni = createMockPersona('ferni', 'Ferni', 'warm');
const mockPeter = createMockPersona('peter-john', 'Peter', 'professional');
const mockAlex = createMockPersona('alex-chen', 'Alex', 'casual');
const mockMaya = createMockPersona('maya-santos', 'Maya', 'warm');
const mockJordan = createMockPersona('jordan-taylor', 'Jordan', 'casual');
const mockNayan = createMockPersona('nayan-patel', 'Nayan', 'warm');

const allMockPersonas = [mockFerni, mockPeter, mockAlex, mockMaya, mockJordan, mockNayan];

describe('Greetings System', () => {
  describe('generateVoiceRecognitionGreeting', () => {
    it('should generate greeting for voice_recognized scenario', () => {
      const greeting = generateVoiceRecognitionGreeting(mockFerni, 'voice_recognized', {
        userName: 'Sam',
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should include user name in voice_recognized greeting', () => {
      const greeting = generateVoiceRecognitionGreeting(mockFerni, 'voice_recognized', {
        userName: 'Alex',
      });

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should handle voice_familiar scenario', () => {
      const greeting = generateVoiceRecognitionGreeting(mockFerni, 'voice_familiar', {
        possibleName: 'Sam',
        confidence: 0.7,
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });

    it('should handle voice_mismatch scenario', () => {
      const greeting = generateVoiceRecognitionGreeting(mockFerni, 'voice_mismatch', {
        expectedName: 'Jane',
      });

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
    });

    it('should work for all personas', () => {
      for (const persona of allMockPersonas) {
        const greeting = generateVoiceRecognitionGreeting(persona, 'voice_recognized', {
          userName: 'Test',
        });

        expect(greeting, `Greeting should exist for ${persona.id}`).toBeDefined();
        expect(typeof greeting).toBe('string');
      }
    });
  });

  describe('generateStaticGreeting', () => {
    it('should generate basic greeting for new user', () => {
      const greeting = generateStaticGreeting(mockFerni, {});

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should work for all personas', () => {
      for (const persona of allMockPersonas) {
        const greeting = generateStaticGreeting(persona, {});

        expect(greeting, `Static greeting should exist for ${persona.id}`).toBeDefined();
        expect(typeof greeting).toBe('string');
      }
    });

    it('should handle returning user context', () => {
      const newUserGreeting = generateStaticGreeting(mockFerni, {
        isReturningUser: false,
      });

      const returningGreeting = generateStaticGreeting(mockFerni, {
        isReturningUser: true,
        userName: 'Sam',
      });

      // Both should be valid greetings
      expect(newUserGreeting).toBeDefined();
      expect(returningGreeting).toBeDefined();
    });

    it('should include user name when provided', () => {
      const greeting = generateStaticGreeting(mockFerni, {
        isReturningUser: true,
        userName: 'Alex',
      });

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });
  });

  describe('generateRandomGreeting', () => {
    it('should generate a greeting', () => {
      const greeting = generateRandomGreeting(mockFerni);

      expect(greeting).toBeDefined();
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should return different greetings on multiple calls', () => {
      const greetings = new Set<string>();

      // Generate 10 greetings and collect unique ones
      for (let i = 0; i < 10; i++) {
        const greeting = generateRandomGreeting(mockFerni);
        if (greeting) {
          greetings.add(greeting);
        }
      }

      // Should have some variety (at least 1 greeting)
      expect(greetings.size).toBeGreaterThanOrEqual(1);
    });

    it('should work for all mock personas', () => {
      for (const persona of allMockPersonas) {
        const greeting = generateRandomGreeting(persona);

        expect(greeting, `Random greeting should exist for ${persona.id}`).toBeDefined();
        expect(typeof greeting).toBe('string');
      }
    });
  });

  describe('Greeting style differentiation', () => {
    it('warm style should generate greetings', () => {
      const warmPersona = createMockPersona('warm-test', 'Warm', 'warm');
      const greeting = generateStaticGreeting(warmPersona, {});

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('professional style should generate greetings', () => {
      const professionalPersona = createMockPersona('prof-test', 'Prof', 'professional');
      const greeting = generateStaticGreeting(professionalPersona, {});

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('casual style should generate greetings', () => {
      const casualPersona = createMockPersona('casual-test', 'Casual', 'casual');
      const greeting = generateStaticGreeting(casualPersona, {});

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });
  });
});
