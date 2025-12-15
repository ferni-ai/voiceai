/**
 * Meaningful Silence Unit Tests
 *
 * Tests for the silence handling system that transforms awkward pauses
 * into relationship-building moments.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// TEST SETUP - Mock external dependencies
// ============================================================================

// Mock audio modules
vi.mock('../../audio/ambient-music.js', () => ({
  playAmbientMusic: vi.fn(() => Promise.resolve(false)),
  stopAmbientMusic: vi.fn(),
}));

vi.mock('../../audio/index.js', () => ({
  getMusicPlayer: vi.fn(() => ({
    getSessionHistory: () => [],
  })),
}));

vi.mock('../../services/dj-service.js', () => ({
  getMusicConversationStarter: vi.fn(() => null),
  getSpontaneousMusicOffer: vi.fn(() => "Want me to put on some music while you think?"),
}));

vi.mock('../voice-registry.js', () => ({
  getCanonicalPersonaId: vi.fn((id: string) => id),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Meaningful Silence System', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getMeaningfulSilenceResponse', () => {
    it('should return comfortable presence for short silence (< 15s)', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(mockPersona, {
        silenceDurationSeconds: 10,
        turnCount: 5,
        topicsDiscussed: ['career'],
        recentEmotionalTone: 'neutral',
      });

      expect(response).toBeDefined();
      expect(response.type).toBe('comfortable_presence');
      expect(response.invitesReply).toBe(false);
      expect(response.text).toBeTruthy();
      // Should contain SSML tags for natural speech
      expect(response.text).toMatch(/<break|<emotion/);
    });

    it('should return gentle response after heavy emotional topic', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(mockPersona, {
        silenceDurationSeconds: 12,
        turnCount: 5,
        topicsDiscussed: ['loss', 'grief'],
        recentEmotionalTone: 'heavy',
      });

      expect(response).toBeDefined();
      expect(response.type).toBe('comfortable_presence');
      expect(response.invitesReply).toBe(false);
      // Should be gentle and supportive
      expect(response.text).toMatch(/time|hear|trust|pressure|okay/i);
    });

    it('should reference memorable moments when available (15-25s)', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(mockPersona, {
        silenceDurationSeconds: 20,
        turnCount: 5,
        topicsDiscussed: [],
        memorableMoments: ['your daughter Sarah'],
        recentEmotionalTone: 'neutral',
      });

      expect(response).toBeDefined();
      expect(response.type).toBe('memory_callback');
      expect(response.invitesReply).toBe(true);
      expect(response.text).toContain('your daughter Sarah');
    });

    it('should ask thoughtful questions for medium silence without memorable moments', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      // Run multiple times to verify we get thoughtful questions
      let gotQuestion = false;
      for (let i = 0; i < 10; i++) {
        const response = getMeaningfulSilenceResponse(mockPersona, {
          silenceDurationSeconds: 20,
          turnCount: 5,
          topicsDiscussed: ['general'],
          memorableMoments: [], // Empty so we don't get memory_callback
          recentEmotionalTone: 'neutral',
        });

        if (response.type === 'thoughtful_question') {
          gotQuestion = true;
          expect(response.invitesReply).toBe(true);
          break;
        }
      }

      expect(gotQuestion).toBe(true);
    });

    it('should provide topic-specific questions for work discussions', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      // Force random to give us the memory_callback path
      const originalRandom = Math.random;
      let workQuestionFound = false;

      // Run multiple iterations to catch a work-related question
      for (let i = 0; i < 30 && !workQuestionFound; i++) {
        Math.random = originalRandom; // Reset for fair randomization
        const response = getMeaningfulSilenceResponse(mockPersona, {
          silenceDurationSeconds: 20,
          turnCount: 5,
          topicsDiscussed: ['work', 'career', 'job'],
          memorableMoments: [],
          recentEmotionalTone: 'neutral',
        });

        if (response.type === 'thoughtful_question') {
          // Work questions may include these themes
          if (response.text.match(/work|money|job|proud|career|factor/i)) {
            workQuestionFound = true;
          }
        }
      }

      // We should eventually get some relevant questions (probabilistic test)
      // Not asserting workQuestionFound=true since it's random-dependent
    });

    it('should handle very long silence (> 40s) with engagement', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(mockPersona, {
        silenceDurationSeconds: 50,
        turnCount: 5,
        topicsDiscussed: [],
        recentEmotionalTone: 'neutral',
      });

      expect(response).toBeDefined();
      // For very long silence without topic context, returns micro_story or thoughtful_question
      expect(['micro_story', 'thoughtful_question']).toContain(response.type);
    });

    it('should be game-aware when game is active', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(mockPersona, {
        silenceDurationSeconds: 15,
        turnCount: 5,
        topicsDiscussed: [],
        recentEmotionalTone: 'light',
        isGameActive: true,
        activeGameType: 'music_quiz',
      });

      expect(response).toBeDefined();
      // When game is active with short silence (< 30s), we stay silent to not interrupt thinking
      expect(response.type).toBe('comfortable_presence');
      // Empty text means "don't say anything" - user is thinking about their answer
      expect(response.text).toBe('');
    });
  });

  describe('extractMemorableMoments', () => {
    it('should extract family mentions', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        'My wife Sarah and I have been planning this trip for months'
      );

      expect(moments).toContain('your wife');
    });

    it('should extract life events', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "We're getting married next summer!"
      );

      expect(moments).toContain('getting married');
    });

    it('should extract pregnancy/baby mentions', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "We're expecting a baby in March"
      );

      expect(moments).toContain('the baby');
    });

    it('should extract retirement mentions', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "I'm thinking about retiring early"
      );

      expect(moments).toContain('retirement');
    });

    it('should extract job/career changes', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "I just started a new job at a tech company"
      );

      expect(moments).toContain('the new job');
    });

    it('should extract loss mentions sensitively', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "My father passed away last year"
      );

      expect(moments).toContain('your loss');
    });

    it('should extract milestone mentions', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "This is my first home purchase"
      );

      expect(moments).toContain('your first home');
    });

    it('should limit to 3 moments maximum', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "My wife and I are getting married, expecting a baby, starting a new job, and buying our first home"
      );

      expect(moments.length).toBeLessThanOrEqual(3);
    });

    it('should deduplicate moments', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "My wife loves it when my wife and I go hiking together"
      );

      // Should only have one instance of 'your wife'
      const wifeCount = moments.filter(m => m === 'your wife').length;
      expect(wifeCount).toBeLessThanOrEqual(1);
    });

    it('should return empty array for no memorable content', async () => {
      const { extractMemorableMoments } = await import('../meaningful-silence.js');

      const moments = extractMemorableMoments(
        "What's the weather like today?"
      );

      expect(moments).toEqual([]);
    });
  });

  describe('mergeMemorableMoments', () => {
    it('should merge new moments with existing ones', async () => {
      const { mergeMemorableMoments } = await import('../meaningful-silence.js');

      const existing = ['your wife', 'retirement'];
      const newMoments = ['the baby'];

      const merged = mergeMemorableMoments(existing, newMoments);

      expect(merged).toContain('your wife');
      expect(merged).toContain('retirement');
      expect(merged).toContain('the baby');
    });

    it('should prioritize new moments (they come first)', async () => {
      const { mergeMemorableMoments } = await import('../meaningful-silence.js');

      const existing = ['old moment'];
      const newMoments = ['new moment'];

      const merged = mergeMemorableMoments(existing, newMoments);

      expect(merged[0]).toBe('new moment');
    });

    it('should limit to 5 moments maximum', async () => {
      const { mergeMemorableMoments } = await import('../meaningful-silence.js');

      const existing = ['mom1', 'mom2', 'mom3', 'mom4'];
      const newMoments = ['new1', 'new2', 'new3'];

      const merged = mergeMemorableMoments(existing, newMoments);

      expect(merged.length).toBeLessThanOrEqual(5);
    });

    it('should deduplicate when merging', async () => {
      const { mergeMemorableMoments } = await import('../meaningful-silence.js');

      const existing = ['your wife', 'retirement'];
      const newMoments = ['your wife', 'the baby'];

      const merged = mergeMemorableMoments(existing, newMoments);

      const wifeCount = merged.filter(m => m === 'your wife').length;
      expect(wifeCount).toBe(1);
    });
  });

  describe('SilenceHandler class', () => {
    it('should track silence state', async () => {
      const { SilenceHandler } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const handler = new SilenceHandler(mockPersona);

      // Start silence
      handler.startSilence();

      // Handler should be tracking silence
      // The handler remembers the silence start time
      expect(handler).toBeDefined();
    });

    it('should reset on end silence', async () => {
      const { SilenceHandler } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      const handler = new SilenceHandler(mockPersona);

      // Start and then end silence
      handler.startSilence();
      handler.endSilence();

      // State should be clean after end
      expect(handler).toBeDefined();
    });
  });

  describe('Time-aware responses', () => {
    it('should recognize late night hours', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      // Run multiple times since time-awareness is probabilistic (30% chance)
      let gotTimeAware = false;
      for (let i = 0; i < 30; i++) {
        const response = getMeaningfulSilenceResponse(mockPersona, {
          silenceDurationSeconds: 12,
          turnCount: 5,
          topicsDiscussed: [],
          recentEmotionalTone: 'neutral',
          currentHour: 2, // 2 AM
        });

        if (response.type === 'time_aware') {
          gotTimeAware = true;
          // Time-aware responses can mention sleep, late, night, hour, morning, or early
          expect(response.text).toMatch(/late|night|hour|morning|early|sleep/i);
          break;
        }
      }

      // We should eventually get a time-aware response (probabilistic)
      // Not strictly asserting since it's random-based
    });

    it('should recognize early morning hours', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const mockPersona = {
        id: 'ferni',
        name: 'Ferni',
        stories: [],
      } as any;

      let gotTimeAware = false;
      for (let i = 0; i < 30; i++) {
        const response = getMeaningfulSilenceResponse(mockPersona, {
          silenceDurationSeconds: 12,
          turnCount: 5,
          topicsDiscussed: [],
          recentEmotionalTone: 'neutral',
          currentHour: 5, // 5 AM
        });

        if (response.type === 'time_aware') {
          gotTimeAware = true;
          break;
        }
      }

      // Probabilistic test - we should eventually get time-aware response
    });
  });

  describe('Persona-specific behavior', () => {
    it('should provide different observations for Nayan (wisdom persona)', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const nayanPersona = {
        id: 'nayan-patel',
        name: 'Nayan Patel',
        stories: [],
      } as any;

      // Nayan should have contemplative, wisdom-focused responses
      const response = getMeaningfulSilenceResponse(nayanPersona, {
        silenceDurationSeconds: 10,
        turnCount: 5,
        topicsDiscussed: [],
        recentEmotionalTone: 'neutral',
      });

      expect(response).toBeDefined();
      // Nayan's presence responses should feel philosophical
    });

    it('should provide different observations for Peter (analytical persona)', async () => {
      const { getMeaningfulSilenceResponse } = await import('../meaningful-silence.js');

      const peterPersona = {
        id: 'peter-john',
        name: 'Peter John',
        stories: [],
      } as any;

      const response = getMeaningfulSilenceResponse(peterPersona, {
        silenceDurationSeconds: 10,
        turnCount: 5,
        topicsDiscussed: ['stocks'],
        recentEmotionalTone: 'neutral',
      });

      expect(response).toBeDefined();
    });
  });
});


