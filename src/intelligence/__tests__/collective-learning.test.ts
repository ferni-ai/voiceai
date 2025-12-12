/**
 * Collective Learning Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  analyzeResponseType,
  analyzeResponseLength,
  analyzeUserEngagement,
  getCollectiveRecommendations,
  type ConversationSignalContext,
} from '../collective-learning-integration.js';
import type { EmotionResult } from '../emotion-detector.js';

describe('Collective Learning Integration', () => {
  describe('analyzeResponseType', () => {
    it('should detect story responses', () => {
      const response = 'I remember when I first started out, there was a time...';
      expect(analyzeResponseType(response)).toBe('story');
    });

    it('should detect question responses', () => {
      const response = 'What do you think about that? How does it make you feel?';
      expect(analyzeResponseType(response)).toBe('question');
    });

    it('should detect empathy responses', () => {
      const response = "I understand how difficult that must be. That sounds really hard.";
      expect(analyzeResponseType(response)).toBe('empathy');
    });

    it('should detect humor responses', () => {
      const response = "Haha, that's actually pretty funny! 😄";
      expect(analyzeResponseType(response)).toBe('humor');
    });

    it('should detect explanation responses', () => {
      const response = "Here's how that works - let me explain the process.";
      expect(analyzeResponseType(response)).toBe('explanation');
    });

    it('should default to advice for general responses', () => {
      const response = 'You might want to consider taking some time to think about it.';
      expect(analyzeResponseType(response)).toBe('advice');
    });
  });

  describe('analyzeResponseLength', () => {
    it('should classify brief responses', () => {
      const response = 'I see. Tell me more.';
      expect(analyzeResponseLength(response)).toBe('brief');
    });

    it('should classify moderate responses', () => {
      // Need 30-80 words for moderate (30 < x < 80)
      // 50 words exactly:
      const words = Array(50).fill('word').join(' ');
      expect(analyzeResponseLength(words)).toBe('moderate');
    });

    it('should classify lengthy responses', () => {
      const response = 'This is a longer explanation. '.repeat(20);
      expect(analyzeResponseLength(response)).toBe('lengthy');
    });
  });

  describe('analyzeUserEngagement', () => {
    const baseEmotion: EmotionResult = {
      primary: 'neutral',
      intensity: 0.5,
      valence: 'neutral',
      distressLevel: 0,
      confidence: 0.8,
      markers: [],
      suggestedTone: 'warm',
    };

    it('should calculate baseline engagement', () => {
      const engagement = analyzeUserEngagement('Just checking in.', null, baseEmotion);

      expect(engagement.engagementScore).toBeGreaterThanOrEqual(0);
      expect(engagement.engagementScore).toBeLessThanOrEqual(1);
    });

    it('should increase engagement for longer messages', () => {
      const shortEngagement = analyzeUserEngagement('Yes.', null, baseEmotion);
      // Need more words to trigger engagement boost (> 20 words per the algorithm)
      const longEngagement = analyzeUserEngagement(
        'I have so much to share about this topic. Let me tell you all about it and all the details of what happened to me and how I feel about everything now. This is really important!',
        null,
        baseEmotion
      );

      expect(longEngagement.engagementScore).toBeGreaterThan(shortEngagement.engagementScore);
    });

    it('should increase engagement for questions', () => {
      const noQuestion = analyzeUserEngagement('I understand.', null, baseEmotion);
      const withQuestion = analyzeUserEngagement('I understand. What do you think?', null, baseEmotion);

      expect(withQuestion.engagementScore).toBeGreaterThan(noQuestion.engagementScore);
      expect(withQuestion.askedFollowUp).toBe(true);
    });

    it('should increase engagement for thank you', () => {
      const noThanks = analyzeUserEngagement('Okay.', null, baseEmotion);
      const withThanks = analyzeUserEngagement('Thanks, that really helps!', null, baseEmotion);

      expect(withThanks.engagementScore).toBeGreaterThan(noThanks.engagementScore);
    });

    it('should detect wanting more', () => {
      const engagement = analyzeUserEngagement('Tell me more about that!', null, baseEmotion);

      expect(engagement.topicDepthened).toBe(true);
    });

    it('should track emotional shift from previous', () => {
      const previousEmotion: EmotionResult = {
        ...baseEmotion,
        valence: 'negative',
      };
      const currentEmotion: EmotionResult = {
        ...baseEmotion,
        valence: 'positive',
      };

      const engagement = analyzeUserEngagement('I feel better now!', previousEmotion, currentEmotion);

      expect(engagement.emotionalShift).toBe('positive');
    });
  });

  describe('getCollectiveRecommendations', () => {
    it('should return recommendations for context', () => {
      const recommendations = getCollectiveRecommendations({
        personaId: 'ferni',
        emotion: 'anxiety',
        topic: 'work',
        relationshipStage: 'established',
      });

      expect(recommendations).toHaveProperty('recommendedQuestions');
      expect(recommendations).toHaveProperty('personaAdjustments');
      expect(Array.isArray(recommendations.recommendedQuestions)).toBe(true);
      expect(Array.isArray(recommendations.personaAdjustments)).toBe(true);
    });
  });
});

