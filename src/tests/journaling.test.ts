/**
 * Journaling System Tests
 *
 * Tests for journal prompts, capture, and storage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generatePrompts,
  getBestPrompt,
  getPromptsForCategory,
  generateSituationalPrompt,
  formatPromptForVoice,
  type PromptContext,
  type PromptCategory,
} from '../services/trust-systems/journaling-prompts.js';

// ============================================================================
// JOURNALING PROMPTS TESTS
// ============================================================================

describe('Journaling Prompts', () => {
  describe('generatePrompts', () => {
    it('should generate the requested number of prompts', () => {
      const context: PromptContext = {
        userId: 'test-user-1',
      };

      const prompts = generatePrompts(context, 3);

      expect(prompts).toHaveLength(3);
      prompts.forEach((prompt) => {
        expect(prompt.id).toBeDefined();
        expect(prompt.prompt).toBeDefined();
        expect(prompt.category).toBeDefined();
      });
    });

    it('should generate unique prompts', () => {
      const context: PromptContext = {
        userId: 'test-user-2',
      };

      const prompts = generatePrompts(context, 5);
      const ids = prompts.map((p) => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should respect time of day for category selection', () => {
      // Morning context
      const morningContext: PromptContext = {
        userId: 'test-user-3',
        timeOfDay: 'morning',
      };

      const morningPrompts = generatePrompts(morningContext, 3);
      const hasIntentionPrompt = morningPrompts.some(
        (p) => p.category === 'future' || p.category === 'gratitude'
      );

      expect(hasIntentionPrompt).toBe(true);

      // Evening context
      const eveningContext: PromptContext = {
        userId: 'test-user-4',
        timeOfDay: 'evening',
      };

      const eveningPrompts = generatePrompts(eveningContext, 3);
      const hasReflectionPrompt = eveningPrompts.some(
        (p) => p.category === 'reflection' || p.category === 'integration'
      );

      expect(hasReflectionPrompt).toBe(true);
    });

    it('should use contextual prompts when context is provided', () => {
      const contextWithWins: PromptContext = {
        userId: 'test-user-5',
        wins: ['completed a difficult project'],
      };

      const prompts = generatePrompts(contextWithWins, 3);
      const hasGrowthPrompt = prompts.some((p) => p.category === 'growth');

      expect(hasGrowthPrompt).toBe(true);
    });

    it('should be gentler when user is struggling', () => {
      const contextWithStruggles: PromptContext = {
        userId: 'test-user-6',
        struggles: ['feeling overwhelmed at work'],
      };

      const prompts = generatePrompts(contextWithStruggles, 3);
      const hasGentlePrompt = prompts.some((p) => p.difficulty === 'gentle');

      expect(hasGentlePrompt).toBe(true);
    });
  });

  describe('getBestPrompt', () => {
    it('should return a single prompt', () => {
      const context: PromptContext = {
        userId: 'test-user-7',
      };

      const prompt = getBestPrompt(context);

      expect(prompt).toBeDefined();
      expect(prompt.prompt).toBeDefined();
      expect(prompt.id).toBeDefined();
    });

    it('should return fallback prompt when context is minimal', () => {
      const context: PromptContext = {
        userId: 'fallback-test',
      };

      const prompt = getBestPrompt(context);

      expect(prompt).toBeDefined();
      expect(prompt.prompt.length).toBeGreaterThan(10);
    });
  });

  describe('getPromptsForCategory', () => {
    it('should return prompts for a specific category', () => {
      const prompts = getPromptsForCategory('test-user-8', 'gratitude', 3);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts.length).toBeLessThanOrEqual(3);
      prompts.forEach((p) => {
        expect(p.category).toBe('gratitude');
      });
    });

    const categories: PromptCategory[] = [
      'reflection',
      'exploration',
      'gratitude',
      'challenge',
      'integration',
      'growth',
      'relationship',
      'future',
      'healing',
    ];

    categories.forEach((category) => {
      it(`should have prompts for category: ${category}`, () => {
        const prompts = getPromptsForCategory('test-user', category, 3);
        expect(prompts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateSituationalPrompt', () => {
    it('should generate morning routine prompt', () => {
      const prompt = generateSituationalPrompt('test-user', 'morning_routine');

      expect(prompt).toBeDefined();
      expect(prompt.context).toContain('Morning');
      expect(prompt.difficulty).toBe('gentle');
    });

    it('should generate evening wind-down prompt', () => {
      const prompt = generateSituationalPrompt('test-user', 'evening_wind_down');

      expect(prompt).toBeDefined();
      expect(prompt.context).toContain('Evening');
    });

    it('should generate after-session prompt', () => {
      const prompt = generateSituationalPrompt('test-user', 'after_session');

      expect(prompt).toBeDefined();
      expect(prompt.context).toContain('Ferni');
      expect(prompt.followUp).toBeDefined();
    });

    it('should generate processing emotion prompt with follow-up', () => {
      const prompt = generateSituationalPrompt('test-user', 'processing_emotion');

      expect(prompt).toBeDefined();
      expect(prompt.category).toBe('healing');
      expect(prompt.followUp).toBeDefined();
    });
  });

  describe('formatPromptForVoice', () => {
    it('should format prompt with intro and SSML', () => {
      const prompt = getBestPrompt({ userId: 'test' });
      const formatted = formatPromptForVoice(prompt);

      expect(formatted.intro).toBeDefined();
      expect(formatted.prompt).toBe(prompt.prompt);
      expect(formatted.ssml).toContain('<speak>');
      expect(formatted.ssml).toContain('</speak>');
      expect(formatted.ssml).toContain('<prosody');
    });

    it('should include follow-up in SSML when present', () => {
      const promptWithFollowUp = {
        id: 'test-1',
        category: 'challenge' as PromptCategory,
        prompt: 'What truth are you avoiding?',
        followUp: 'What becomes possible when you face it?',
        context: 'test',
        difficulty: 'deep' as const,
        estimatedMinutes: 15,
        tags: ['test'],
      };

      const formatted = formatPromptForVoice(promptWithFollowUp);

      expect(formatted.followUp).toBe(promptWithFollowUp.followUp);
      expect(formatted.ssml).toContain(promptWithFollowUp.followUp);
    });
  });
});

// ============================================================================
// PROMPT DIFFICULTY TESTS
// ============================================================================

describe('Prompt Difficulty', () => {
  it('should have appropriate estimated minutes for each difficulty', () => {
    const context: PromptContext = {
      userId: 'difficulty-test',
    };

    const prompts = generatePrompts(context, 10);

    prompts.forEach((prompt) => {
      if (prompt.difficulty === 'gentle') {
        expect(prompt.estimatedMinutes).toBeLessThanOrEqual(8);
      } else if (prompt.difficulty === 'deep') {
        expect(prompt.estimatedMinutes).toBeGreaterThanOrEqual(10);
      }
    });
  });

  it('should not give deep prompts to new users', () => {
    const newUserContext: PromptContext = {
      userId: 'new-user',
      relationshipStage: 'new',
    };

    const prompts = generatePrompts(newUserContext, 5);
    const deepPrompts = prompts.filter((p) => p.difficulty === 'deep');

    // New users should get mostly gentle/moderate prompts
    expect(deepPrompts.length).toBeLessThanOrEqual(1);
  });

  it('should allow deep prompts for established relationships', () => {
    const establishedUserContext: PromptContext = {
      userId: 'established-user',
      relationshipStage: 'deep',
    };

    const prompts = generatePrompts(establishedUserContext, 5);

    // At least allow the possibility of deep prompts
    expect(prompts.some((p) => ['moderate', 'deep'].includes(p.difficulty))).toBe(true);
  });
});

// ============================================================================
// EMOTIONAL CONTEXT TESTS
// ============================================================================

describe('Emotional Context', () => {
  it('should respond to anxious emotions with healing prompts', () => {
    const anxiousContext: PromptContext = {
      userId: 'anxious-user',
      currentEmotion: 'anxious',
    };

    const prompts = generatePrompts(anxiousContext, 3);
    const hasHealingOrReflection = prompts.some(
      (p) => p.category === 'healing' || p.category === 'reflection'
    );

    expect(hasHealingOrReflection).toBe(true);
  });

  it('should respond to happy emotions with gratitude prompts', () => {
    const happyContext: PromptContext = {
      userId: 'happy-user',
      currentEmotion: 'happy',
    };

    const prompts = generatePrompts(happyContext, 3);
    const hasGratitude = prompts.some((p) => p.category === 'gratitude');

    expect(hasGratitude).toBe(true);
  });
});

// ============================================================================
// CONTEXTUAL PROMPT TESTS
// ============================================================================

describe('Contextual Prompts', () => {
  it('should personalize prompts based on wins', () => {
    const context: PromptContext = {
      userId: 'winner',
      wins: ['got a promotion'],
    };

    const prompts = generatePrompts(context, 5);
    const hasPersonalized = prompts.some(
      (p) => p.personalizedFor !== undefined || p.context.includes('win')
    );

    expect(hasPersonalized).toBe(true);
  });

  it('should personalize prompts based on struggles', () => {
    const context: PromptContext = {
      userId: 'struggling',
      struggles: ['relationship difficulties'],
    };

    const prompts = generatePrompts(context, 5);
    const hasPersonalized = prompts.some(
      (p) => p.personalizedFor !== undefined || p.context.includes('struggle')
    );

    expect(hasPersonalized).toBe(true);
  });

  it('should personalize prompts based on growth areas', () => {
    const context: PromptContext = {
      userId: 'growing',
      growthAreas: ['becoming more patient'],
    };

    const prompts = generatePrompts(context, 5);
    const hasPersonalized = prompts.some(
      (p) => p.personalizedFor !== undefined || p.context.includes('growth')
    );

    expect(hasPersonalized).toBe(true);
  });
});
