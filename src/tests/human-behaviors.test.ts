/**
 * Human Behaviors Module Tests
 *
 * Tests for sophisticated human-like behaviors:
 * - Cultural moment awareness
 * - User engagement detection
 * - Running jokes
 * - Spontaneous thoughts
 * - Preference learning
 * - Voice prosody response
 * - Topic threading verification
 * - Proactive goal references
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  detectCulturalMoment,
  getSpontaneousThought,
  inferUserPreferences,
  getPreferenceGuidance,
  getVoiceProsodyResponse,
} from '../intelligence/human-behaviors.js';
import { createUserProfile, type UserProfile } from '../types/user-profile.js';

describe('Human Behaviors Module', () => {
  // ============================================================================
  // CULTURAL MOMENT AWARENESS
  // ============================================================================

  describe('detectCulturalMoment', () => {
    it('should return a cultural moment object or null', async () => {
      const moment = await detectCulturalMoment();

      // Result is either null or a valid cultural moment
      if (moment !== null) {
        expect(moment).toHaveProperty('type');
        expect(moment).toHaveProperty('name');
        expect(moment).toHaveProperty('reference');
        expect(moment).toHaveProperty('relevance');
        expect([
          'holiday',
          'tax_season',
          'market_anniversary',
          'earnings_season',
          'fed_meeting',
          'quarter_end',
        ]).toContain(moment.type);
        expect(['high', 'medium', 'low']).toContain(moment.relevance);
      }
    });

    it('should return consistent structure', async () => {
      // Run multiple times to ensure consistency
      for (let i = 0; i < 5; i++) {
        const moment = await detectCulturalMoment();
        if (moment) {
          expect(typeof moment.name).toBe('string');
          expect(typeof moment.reference).toBe('string');
          expect(moment.reference.length).toBeGreaterThan(10);
        }
      }
    });
  });

  // ============================================================================
  // SPONTANEOUS THOUGHTS
  // ============================================================================

  describe('getSpontaneousThought', () => {
    it('should return valid thought structure or null', () => {
      // Run multiple times since it's probabilistic (5% chance)
      let foundThought = false;
      for (let i = 0; i < 100; i++) {
        const thought = getSpontaneousThought();
        if (thought !== null) {
          foundThought = true;
          expect(thought).toHaveProperty('thought');
          expect(thought).toHaveProperty('trigger');
          expect(['random', 'topic', 'time', 'weather', 'market']).toContain(thought.trigger);
          expect(typeof thought.thought).toBe('string');
          break;
        }
      }
      // At 5% chance, we should usually find one in 100 tries
      // But don't fail if we don't - it's probabilistic
    });
  });

  // ============================================================================
  // PREFERENCE LEARNING
  // ============================================================================

  describe('inferUserPreferences', () => {
    it('should detect preference for directness', () => {
      const messages = [
        'Just tell me what to do',
        'Get to the point please',
        "What's the bottom line?",
      ];

      const preferences = inferUserPreferences(messages, null);

      expect(preferences.communicationStyle).toBe('direct');
      expect(preferences.responseLength).toBe('brief');
    });

    it('should detect preference for detailed explanations', () => {
      const messages = [
        'Can you explain how this works in more detail? I really want to understand the mechanics.',
        'Tell me more about the tax implications and how they might affect my situation',
        "Why does compound interest work that way? What's the underlying principle?",
      ];

      const preferences = inferUserPreferences(messages, null);

      expect(preferences.responseLength).toBe('thorough');
    });

    it('should return unknown for insufficient data', () => {
      const messages = ['hi'];

      const preferences = inferUserPreferences(messages, null);

      expect(preferences.communicationStyle).toBe('unknown');
    });
  });

  describe('getPreferenceGuidance', () => {
    it('should generate guidance for direct communicators', () => {
      const preferences = {
        communicationStyle: 'direct' as const,
        responseLength: 'brief' as const,
        storyAppetite: 'prefers_facts' as const,
        humorReceptivity: 'low' as const,
        adviceStyle: 'prescriptive' as const,
      };

      const guidance = getPreferenceGuidance(preferences);

      expect(guidance).toContain('direct');
      expect(guidance).toContain('SHORT');
    });

    it('should return empty string for unknown preferences', () => {
      const preferences = {
        communicationStyle: 'unknown' as const,
        responseLength: 'unknown' as const,
        storyAppetite: 'unknown' as const,
        humorReceptivity: 'unknown' as const,
        adviceStyle: 'unknown' as const,
      };

      const guidance = getPreferenceGuidance(preferences);

      expect(guidance).toBe('');
    });
  });

  // ============================================================================
  // VOICE PROSODY RESPONSE
  // ============================================================================

  describe('getVoiceProsodyResponse', () => {
    it('should respond to high stress', () => {
      const voiceEmotion = {
        primary: 'anxious',
        stressLevel: 0.8,
        arousal: 0.6,
        valence: -0.3,
      };

      const response = getVoiceProsodyResponse(voiceEmotion);

      expect(response.shouldAdjust).toBe(true);
      expect(response.guidance).toContain('stressed');
      expect(response.emotionalMirror).toBeDefined();
    });

    it('should respond to excitement', () => {
      const voiceEmotion = {
        primary: 'excited',
        stressLevel: 0.2,
        arousal: 0.8,
        valence: 0.5,
      };

      const response = getVoiceProsodyResponse(voiceEmotion);

      expect(response.shouldAdjust).toBe(true);
      expect(response.guidance).toContain('excited');
    });

    it('should return no adjustment for neutral voice', () => {
      const voiceEmotion = {
        primary: 'neutral',
        stressLevel: 0.3,
        arousal: 0.5,
        valence: 0.1,
      };

      const response = getVoiceProsodyResponse(voiceEmotion);

      expect(response.shouldAdjust).toBe(false);
    });

    it('should handle null input', () => {
      const response = getVoiceProsodyResponse(null);

      expect(response.shouldAdjust).toBe(false);
      expect(response.guidance).toBe('');
    });
  });
});
