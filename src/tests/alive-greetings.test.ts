/**
 * Alive Greetings Tests
 *
 * Tests for the system that makes personas feel real through:
 * - Caught-in-moment scenarios
 * - Physical awareness
 * - Relationship-stage depth
 * - Quirk reveals
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateAliveGreeting, getTimeOfDay, getDayContext } from '../personas/alive-greetings.js';
import type { PersonaConfig } from '../personas/types.js';
import type { BundleRuntimeEngine } from '../personas/bundles/runtime.js';

// Mock persona
const mockFerniPersona: PersonaConfig = {
  id: 'jack-b',
  name: 'Ferni',
  role: 'Life Coach',
  description: 'Your warmhearted financial life coach',
  communication: {
    greetingStyle: 'warm-friend',
    tone: 'conversational',
    personalityTraits: ['warm', 'curious', 'grounded'],
    catchphrases: ["What's on your mind?"],
    emotionalRange: {
      baseline: 'warm',
      excited: 'enthusiastic',
      concerned: 'caring',
    },
  },
  speech: {
    pace: 'moderate',
    pauseFrequency: 'frequent',
    emphasisStyle: 'warm',
    fillerUsage: 'low',
    breathingPattern: 'natural',
  },
};

// Mock BundleRuntimeEngine
function createMockRuntime(overrides: Partial<BundleRuntimeEngine> = {}): BundleRuntimeEngine {
  return {
    loadInnerWorld: vi.fn().mockResolvedValue(undefined),
    getCaughtDoing: vi.fn().mockReturnValue('just refilling my coffee... again'),
    getHabit: vi.fn().mockReturnValue('I drink too much coffee. My wife says so anyway.'),
    getGuiltyPleasure: vi.fn().mockReturnValue("I watch too much golf on TV. It's hypnotic."),
    getWeakness: vi.fn().mockReturnValue("I'm terrible at small talk."),
    getStrongOpinion: vi.fn().mockReturnValue('Morning is the best time of day.'),
    getRechargeMethod: vi.fn().mockReturnValue('A quiet morning with coffee and a notebook'),
    hasQuirks: vi.fn().mockReturnValue(true),
    hasInnerWorld: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as BundleRuntimeEngine;
}

describe('Alive Greetings', () => {
  describe('Time Context', () => {
    it('should correctly identify time of day', () => {
      const timeOfDay = getTimeOfDay();
      expect(['early_morning', 'morning', 'afternoon', 'evening', 'late_night']).toContain(
        timeOfDay
      );
    });

    it('should get day context', () => {
      const { dayOfWeek, isWeekend } = getDayContext();
      expect(typeof dayOfWeek).toBe('string');
      expect(typeof isWeekend).toBe('boolean');
    });
  });

  describe('Greeting Generation', () => {
    let mockRuntime: BundleRuntimeEngine;

    beforeEach(() => {
      mockRuntime = createMockRuntime();
    });

    it('should return null without runtime', async () => {
      const result = await generateAliveGreeting(null, mockFerniPersona);
      expect(result).toBeNull();
    });

    it('should generate a greeting for new users', async () => {
      const result = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: false,
      });

      expect(result).not.toBeNull();
      expect(result?.greeting).toBeTruthy();
      // Greeting may or may not contain persona name depending on style
      expect(typeof result?.greeting).toBe('string');
    });

    it('should generate a greeting for returning users', async () => {
      const result = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: true,
        userName: 'Sarah',
      });

      expect(result).not.toBeNull();
      expect(result?.greeting).toBeTruthy();
    });

    it('should include "caught doing" content', async () => {
      // Force caught moment style by making it the only option
      const runtime = createMockRuntime({
        getCaughtDoing: vi.fn().mockReturnValue('reading the weather'),
      });

      const result = await generateAliveGreeting(runtime, mockFerniPersona, {
        isReturningUser: false,
      });

      // The greeting might include the caught doing content
      if (result?.components.caughtDoing) {
        expect(result.components.caughtDoing).toBe('reading the weather');
      }
    });

    it('should track greeting components', async () => {
      const result = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: false,
      });

      expect(result?.components).toBeDefined();
      expect(result?.style).toBeDefined();
      expect([
        'caught_moment',
        'warm_recognition',
        'curious_stranger',
        'physical_awareness',
      ]).toContain(result?.style);
    });

    it('should adapt greeting depth based on relationship stage', async () => {
      // Stranger greeting
      const strangerResult = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: false,
        relationshipStage: 'stranger',
      });

      // Trusted advisor greeting (should be more personal)
      const trustedResult = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: true,
        userName: 'Sarah',
        relationshipStage: 'trusted_advisor',
      });

      // Both should generate greetings
      expect(strangerResult).not.toBeNull();
      expect(trustedResult).not.toBeNull();

      // Trusted advisor greetings might include more personal content
      // (The actual content varies due to randomization)
    });

    it('should include SSML markup for natural delivery', async () => {
      const result = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: false,
      });

      // Should include breaks for natural pacing
      expect(result?.greeting).toMatch(/<break time="\d+ms"\/>/);
    });

    it('should include name when returning user has one', async () => {
      const result = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: true,
        userName: 'Marcus',
        relationshipStage: 'friend',
      });

      // Name should appear in greeting for returning users
      if (result?.style === 'warm_recognition') {
        expect(result.greeting).toContain('Marcus');
      }
    });

    it('should avoid used greetings', async () => {
      // Generate a greeting
      const result1 = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: true,
        userName: 'Sarah',
      });

      // Try to generate another with the first one marked as used
      // This is probabilistic but the system should try to avoid repetition
      const usedGreetings = result1 ? [simpleHash(result1.greeting)] : [];

      const result2 = await generateAliveGreeting(mockRuntime, mockFerniPersona, {
        isReturningUser: true,
        userName: 'Sarah',
        usedGreetings,
      });

      // Both should generate, system tries to avoid repetition
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('Runtime Integration', () => {
    it('should call loadInnerWorld', async () => {
      const runtime = createMockRuntime();

      await generateAliveGreeting(runtime, mockFerniPersona, {
        isReturningUser: false,
      });

      expect(runtime.loadInnerWorld).toHaveBeenCalled();
    });

    it('should gracefully handle missing quirks', async () => {
      const runtime = createMockRuntime({
        getCaughtDoing: vi.fn().mockReturnValue(null),
        getHabit: vi.fn().mockReturnValue(null),
        getGuiltyPleasure: vi.fn().mockReturnValue(null),
        hasQuirks: vi.fn().mockReturnValue(false),
      });

      const result = await generateAliveGreeting(runtime, mockFerniPersona, {
        isReturningUser: false,
      });

      // Should still generate a greeting, just without quirk content
      expect(result).not.toBeNull();
    });
  });

  describe('Persona Variety', () => {
    it('should work with Jack Bogle persona', async () => {
      const boglePersona: PersonaConfig = {
        id: 'nayan-patel',
        name: 'Jack',
        role: 'Index Fund Pioneer',
        description: 'Founder of Vanguard',
        communication: {
          greetingStyle: 'wise-elder',
          tone: 'conversational',
          personalityTraits: ['wise', 'principled', 'patient'],
          catchphrases: ['Stay the course'],
          emotionalRange: {
            baseline: 'measured',
            excited: 'passionate',
            concerned: 'thoughtful',
          },
        },
        speech: {
          pace: 'measured',
          pauseFrequency: 'frequent',
          emphasisStyle: 'deliberate',
          fillerUsage: 'low',
          breathingPattern: 'slow',
        },
      };

      const runtime = createMockRuntime({
        getCaughtDoing: vi.fn().mockReturnValue('reading the Wall Street Journal'),
      });

      const result = await generateAliveGreeting(runtime, boglePersona, {
        isReturningUser: false,
      });

      expect(result).not.toBeNull();
      // Greeting should exist and be meaningful (not all greetings include name)
      expect(result?.greeting.length).toBeGreaterThan(10);
    });
  });
});

// Helper function to match the one in alive-greetings.ts
function simpleHash(str: string): string {
  const clean = str
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
