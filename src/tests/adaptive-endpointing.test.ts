/**
 * Adaptive Endpointing Tests
 *
 * Tests the adaptive endpointing system that:
 * - Calculates context-aware pause detection delays
 * - Detects heavy content requiring more time
 * - Estimates sentence completeness
 * - Tracks user speaking profiles
 *
 * @module tests/adaptive-endpointing
 */

import { describe, expect, it } from 'vitest';

import {
  adaptiveEndpointing,
  calculateEndpointingDelay,
  detectHeavyContent,
  determineTopicWeight,
  estimateSentenceCompleteness,
  getEndpointingRecommendation,
  getUserProfile,
  isLikelyIncomplete,
  updateUserProfile,
  type EndpointingContext,
} from '../conversation/adaptive-endpointing.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Adaptive Endpointing', () => {
  // --------------------------------------------------------------------------
  // Basic Delay Calculation
  // --------------------------------------------------------------------------

  describe('calculateEndpointingDelay', () => {
    it('should return base delays for light topics', () => {
      const context: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const result = calculateEndpointingDelay(context);

      expect(result.minDelay).toBeGreaterThanOrEqual(300);
      expect(result.maxDelay).toBeGreaterThan(result.minDelay);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should increase delays for heavy topics', () => {
      const lightContext: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const heavyContext: EndpointingContext = {
        topicWeight: 'heavy',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const lightResult = calculateEndpointingDelay(lightContext);
      const heavyResult = calculateEndpointingDelay(heavyContext);

      expect(heavyResult.minDelay).toBeGreaterThan(lightResult.minDelay);
      expect(heavyResult.maxDelay).toBeGreaterThan(lightResult.maxDelay);
    });

    it('should increase delays for incomplete sentences', () => {
      const completeContext: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const incompleteContext: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 0.2,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const completeResult = calculateEndpointingDelay(completeContext);
      const incompleteResult = calculateEndpointingDelay(incompleteContext);

      expect(incompleteResult.minDelay).toBeGreaterThan(completeResult.minDelay);
    });

    it('should increase delays for high emotional intensity', () => {
      const lowEmotionContext: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.3,
        conversationPhase: 'exploring',
      };

      const highEmotionContext: EndpointingContext = {
        topicWeight: 'light',
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.9,
        conversationPhase: 'exploring',
      };

      const lowResult = calculateEndpointingDelay(lowEmotionContext);
      const highResult = calculateEndpointingDelay(highEmotionContext);

      expect(highResult.minDelay).toBeGreaterThan(lowResult.minDelay);
    });

    it('should increase delays in supporting phase', () => {
      // Use heavy topic to get delays above 300ms floor clamp, making phase adjustment visible
      const exploringContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min puts us above 300ms clamp floor
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.5,
        conversationPhase: 'exploring',
      };

      const supportingContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.5,
        conversationPhase: 'supporting', // +75ms min
      };

      const exploringResult = calculateEndpointingDelay(exploringContext);
      const supportingResult = calculateEndpointingDelay(supportingContext);

      // Base 200 + heavy 150 = 350 for exploring
      // Base 200 + heavy 150 + supporting 75 = 425 for supporting
      expect(supportingResult.minDelay).toBeGreaterThan(exploringResult.minDelay);
    });

    it('should adjust for slow speakers', () => {
      // Use heavy topic to get delays above 300ms floor clamp, making speaker rate adjustment visible
      const normalContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min puts us above 300ms clamp floor
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.5,
        conversationPhase: 'exploring',
        userSpeakingRate: 130, // Normal - no adjustment
      };

      const slowContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min
        sentenceCompleteness: 1.0,
        emotionalIntensity: 0.5,
        conversationPhase: 'exploring',
        userSpeakingRate: 80, // Slow - +100ms min
      };

      const normalResult = calculateEndpointingDelay(normalContext);
      const slowResult = calculateEndpointingDelay(slowContext);

      // Base 200 + heavy 150 = 350 for normal
      // Base 200 + heavy 150 + slow 100 = 450 for slow
      expect(slowResult.minDelay).toBeGreaterThan(normalResult.minDelay);
    });

    it('should adjust for fast speakers', () => {
      // Use heavy topic + incomplete sentence to get delays high enough that fast speaker
      // subtraction (-100ms) is visible and doesn't get clamped to 300ms floor
      const normalContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min
        sentenceCompleteness: 0.2, // incomplete: +150ms min
        emotionalIntensity: 0.5,
        conversationPhase: 'exploring',
        userSpeakingRate: 130, // Normal - no adjustment
      };

      const fastContext: EndpointingContext = {
        topicWeight: 'heavy', // +150ms min
        sentenceCompleteness: 0.2, // incomplete: +150ms min
        emotionalIntensity: 0.5,
        conversationPhase: 'exploring',
        userSpeakingRate: 180, // Fast - -100ms min
      };

      const normalResult = calculateEndpointingDelay(normalContext);
      const fastResult = calculateEndpointingDelay(fastContext);

      // Base 200 + heavy 150 + incomplete 150 = 500 for normal
      // Base 200 + heavy 150 + incomplete 150 - fast 100 = 400 for fast
      expect(fastResult.minDelay).toBeLessThan(normalResult.minDelay);
    });

    it('should provide reasoning for adjustments', () => {
      const context: EndpointingContext = {
        topicWeight: 'heavy',
        sentenceCompleteness: 0.5,
        emotionalIntensity: 0.8,
        conversationPhase: 'supporting',
      };

      const result = calculateEndpointingDelay(context);

      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning.some((r) => r.includes('Heavy topic'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Heavy Content Detection
  // --------------------------------------------------------------------------

  describe('detectHeavyContent', () => {
    it('should detect crisis-related content', () => {
      const crisisTexts = [
        'I have been thinking about suicide',
        'I feel like I want to die',
        'Sometimes I think about killing myself',
      ];

      for (const text of crisisTexts) {
        const detected = detectHeavyContent(text);
        expect(detected.length).toBeGreaterThan(0);
      }
    });

    it('should detect trauma-related content', () => {
      const traumaTexts = [
        'I was abused as a child',
        'The trauma still affects me',
        'After the abuse...',
      ];

      for (const text of traumaTexts) {
        const detected = detectHeavyContent(text);
        expect(detected.length).toBeGreaterThan(0);
      }
    });

    it('should detect life event content', () => {
      const lifeEventTexts = [
        'I just got divorced',
        'My mother has cancer',
        'I was fired yesterday',
        'We are facing bankruptcy',
      ];

      for (const text of lifeEventTexts) {
        const detected = detectHeavyContent(text);
        expect(detected.length).toBeGreaterThan(0);
      }
    });

    it('should detect vulnerability disclosures', () => {
      const disclosureTexts = [
        "I've never told anyone this before",
        'This is a secret I have kept',
        'I feel ashamed to admit this',
      ];

      for (const text of disclosureTexts) {
        const detected = detectHeavyContent(text);
        expect(detected.length).toBeGreaterThan(0);
      }
    });

    it('should not detect heavy content in neutral text', () => {
      const neutralTexts = [
        'I had a great day today',
        'The weather is nice',
        'I went to the grocery store',
      ];

      for (const text of neutralTexts) {
        const detected = detectHeavyContent(text);
        expect(detected.length).toBe(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Sentence Completeness Estimation
  // --------------------------------------------------------------------------

  describe('estimateSentenceCompleteness', () => {
    it('should detect complete sentences with punctuation', () => {
      expect(estimateSentenceCompleteness('This is a complete sentence.')).toBeGreaterThan(0.8);
      expect(estimateSentenceCompleteness('Is this a question?')).toBeGreaterThan(0.8);
      expect(estimateSentenceCompleteness('What an exclamation!')).toBeGreaterThan(0.8);
    });

    it('should detect incomplete sentences', () => {
      expect(estimateSentenceCompleteness('I was thinking about')).toBeLessThan(0.6);
      expect(estimateSentenceCompleteness('The thing is, um')).toBeLessThan(0.6);
      expect(estimateSentenceCompleteness('But')).toBeLessThan(0.6);
    });

    it('should detect trailing indicators', () => {
      expect(estimateSentenceCompleteness('I mean...')).toBeLessThan(0.5);
      expect(estimateSentenceCompleteness('And so,')).toBeLessThan(0.5);
    });

    it('should handle empty text', () => {
      expect(estimateSentenceCompleteness('')).toBe(0);
    });

    it('should consider length in estimation', () => {
      const short = estimateSentenceCompleteness('Hi');
      const longer = estimateSentenceCompleteness('I think this is a fairly complete thought');

      expect(longer).toBeGreaterThan(short);
    });
  });

  // --------------------------------------------------------------------------
  // Topic Weight Determination
  // --------------------------------------------------------------------------

  describe('determineTopicWeight', () => {
    it('should return heavy for high emotional intensity', () => {
      const weight = determineTopicWeight({ emotionalIntensity: 0.9 });
      expect(weight).toBe('heavy');
    });

    it('should return heavy for crisis keywords', () => {
      const weight = determineTopicWeight({ keywords: ['suicide', 'help'] });
      expect(weight).toBe('heavy');
    });

    it('should return heavy for heavy topics', () => {
      const heavyTopics = ['death', 'grief', 'trauma', 'abuse', 'suicide'];

      for (const topic of heavyTopics) {
        const weight = determineTopicWeight({ topic });
        expect(weight).toBe('heavy');
      }
    });

    it('should return medium for relationship topics', () => {
      const mediumTopics = ['relationship', 'conflict', 'anxiety', 'work'];

      for (const topic of mediumTopics) {
        const weight = determineTopicWeight({ topic, emotionalIntensity: 0.4 });
        expect(weight).toBe('medium');
      }
    });

    it('should return light for neutral content', () => {
      const weight = determineTopicWeight({ topic: 'hobbies', emotionalIntensity: 0.3 });
      expect(weight).toBe('light');
    });
  });

  // --------------------------------------------------------------------------
  // User Profile Tracking
  // --------------------------------------------------------------------------

  describe('User Profile', () => {
    it('should create and update user profile', () => {
      updateUserProfile('test-user', {
        wordCount: 50,
        durationMs: 20000,
        pauseMs: 500,
      });

      const profile = getUserProfile('test-user');

      expect(profile).not.toBeNull();
      expect(profile!.averageWpm).toBeGreaterThan(0);
      expect(profile!.samples).toBe(1);
    });

    it('should update profile with exponential moving average', () => {
      updateUserProfile('test-user-2', {
        wordCount: 100,
        durationMs: 60000, // 100 WPM
      });

      const profile1 = getUserProfile('test-user-2');
      const initialWpm = profile1!.averageWpm;

      updateUserProfile('test-user-2', {
        wordCount: 200,
        durationMs: 60000, // 200 WPM
      });

      const profile2 = getUserProfile('test-user-2');

      // Should have moved toward the new value
      expect(profile2!.averageWpm).toBeGreaterThan(initialWpm);
      expect(profile2!.samples).toBe(2);
    });

    it('should return null for unknown user', () => {
      const profile = getUserProfile('unknown-user');
      expect(profile).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Incomplete Detection
  // --------------------------------------------------------------------------

  describe('isLikelyIncomplete', () => {
    it('should return true for incomplete sentences', () => {
      expect(isLikelyIncomplete('I was thinking and')).toBe(true);
      expect(isLikelyIncomplete('But')).toBe(true);
      expect(isLikelyIncomplete('So...')).toBe(true);
    });

    it('should return false for complete sentences', () => {
      expect(isLikelyIncomplete('I finished the task.')).toBe(false);
      expect(isLikelyIncomplete('What do you think?')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Recommendation API
  // --------------------------------------------------------------------------

  describe('getEndpointingRecommendation', () => {
    it('should provide recommendation from text', () => {
      const result = getEndpointingRecommendation('I am feeling really stressed about work');

      expect(result.minDelay).toBeGreaterThan(0);
      expect(result.maxDelay).toBeGreaterThan(result.minDelay);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should increase delays for heavy content text', () => {
      const neutralResult = getEndpointingRecommendation('The weather is nice today.');
      const heavyResult = getEndpointingRecommendation(
        'I have been thinking about suicide lately.'
      );

      expect(heavyResult.minDelay).toBeGreaterThan(neutralResult.minDelay);
    });

    it('should accept partial context', () => {
      const result = getEndpointingRecommendation('Testing', {
        emotionalIntensity: 0.8,
        conversationPhase: 'supporting',
      });

      expect(result.minDelay).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Export Object API
  // --------------------------------------------------------------------------

  describe('adaptiveEndpointing export', () => {
    it('should have all expected methods', () => {
      expect(adaptiveEndpointing.calculate).toBe(calculateEndpointingDelay);
      expect(adaptiveEndpointing.detectHeavyContent).toBe(detectHeavyContent);
      expect(adaptiveEndpointing.estimateCompleteness).toBe(estimateSentenceCompleteness);
      expect(adaptiveEndpointing.determineTopicWeight).toBe(determineTopicWeight);
      expect(adaptiveEndpointing.updateProfile).toBe(updateUserProfile);
      expect(adaptiveEndpointing.getProfile).toBe(getUserProfile);
      expect(adaptiveEndpointing.isIncomplete).toBe(isLikelyIncomplete);
      expect(adaptiveEndpointing.getRecommendation).toBe(getEndpointingRecommendation);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should clamp delays to reasonable bounds', () => {
      const extremeContext: EndpointingContext = {
        topicWeight: 'heavy',
        sentenceCompleteness: 0.0,
        emotionalIntensity: 1.0,
        conversationPhase: 'supporting',
        utteranceType: 'incomplete',
        heavyContentSignals: ['suicide', 'death', 'trauma', 'abuse', 'crisis'],
      };

      const result = calculateEndpointingDelay(extremeContext);

      // Should be clamped to max 3000ms
      expect(result.maxDelay).toBeLessThanOrEqual(3000);
      // Min should be at least 300ms
      expect(result.minDelay).toBeGreaterThanOrEqual(300);
    });

    it('should handle empty text', () => {
      expect(() => {
        detectHeavyContent('');
        estimateSentenceCompleteness('');
        getEndpointingRecommendation('');
      }).not.toThrow();
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(1000);

      expect(() => {
        detectHeavyContent(longText);
        estimateSentenceCompleteness(longText);
        getEndpointingRecommendation(longText);
      }).not.toThrow();
    });

    it('should handle special characters', () => {
      expect(() => {
        detectHeavyContent('Test with $100 & <tags> and "quotes"');
        estimateSentenceCompleteness('What about this? Or this!');
        getEndpointingRecommendation('Testing... and more...');
      }).not.toThrow();
    });
  });
});
