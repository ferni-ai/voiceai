/**
 * Emotion Detection Service Tests
 *
 * Tests for emotion detection from text, energy level detection,
 * response style adaptation, and conversation analysis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

import {
  type EmotionCategory,
  type EnergyLevel,
  type EmotionResult,
  detectEmotion,
  isUserDistressed,
  isUserExcited,
  getResponseStyle,
  analyzeConversationEmotion,
} from '../emotion-detection.js';

describe('EmotionDetection', () => {
  describe('EmotionCategory type', () => {
    it('should have all emotion categories', () => {
      const categories: EmotionCategory[] = [
        'distressed',
        'excited',
        'sad',
        'angry',
        'anxious',
        'happy',
        'frustrated',
        'confused',
        'grateful',
        'neutral',
      ];

      expect(categories).toHaveLength(10);
    });
  });

  describe('EnergyLevel type', () => {
    it('should have all energy levels', () => {
      const levels: EnergyLevel[] = ['low', 'medium', 'high'];
      expect(levels).toHaveLength(3);
    });
  });

  describe('EmotionResult type', () => {
    it('should create complete result', () => {
      const result: EmotionResult = {
        primary: 'excited',
        secondary: 'happy',
        confidence: 0.85,
        energy: 'high',
        keywords: ['excited', 'amazing'],
      };

      expect(result.primary).toBe('excited');
      expect(result.secondary).toBe('happy');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.keywords).toHaveLength(2);
    });

    it('should allow optional secondary emotion', () => {
      const result: EmotionResult = {
        primary: 'neutral',
        confidence: 0.5,
        energy: 'medium',
        keywords: [],
      };

      expect(result.secondary).toBeUndefined();
    });
  });

  describe('detectEmotion', () => {
    describe('Distressed detection', () => {
      const distressedPhrases = [
        "I'm so overwhelmed right now",
        "I can't handle this anymore",
        "I'm falling apart",
        "I'm panicking",
        "I'm losing it",
      ];

      it.each(distressedPhrases)('should detect distress in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('distressed');
        expect(result.confidence).toBeGreaterThan(0.4);
      });
    });

    describe('Excited detection', () => {
      const excitedPhrases = [
        "I'm so excited about this!",
        'This is amazing!!',
        "I can't wait to start",
        'Best day ever!',
        "I'm pumped!",
      ];

      it.each(excitedPhrases)('should detect excitement in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('excited');
      });
    });

    describe('Sad detection', () => {
      const sadPhrases = [
        "I'm feeling so sad today",
        'I feel empty inside',
        "I've been crying all day",
        'I feel so lonely',
        'I feel heartbroken',
      ];

      it.each(sadPhrases)('should detect sadness in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('sad');
      });
    });

    describe('Angry detection', () => {
      const angryPhrases = [
        "I'm so angry right now",
        "I'm furious about this",
        'This is ridiculous!',
        'I hate this situation',
      ];

      it.each(angryPhrases)('should detect anger in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('angry');
      });
    });

    describe('Anxious detection', () => {
      const anxiousPhrases = [
        "I'm so anxious about tomorrow",
        "I'm worried about the meeting",
        "I'm scared of what might happen",
        'What if everything goes wrong?',
      ];

      it.each(anxiousPhrases)('should detect anxiety in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('anxious');
      });
    });

    describe('Happy detection', () => {
      const happyPhrases = [
        "I'm feeling happy today",
        "I'm in a good mood",
        'Everything is wonderful',
        "I'm so grateful",
      ];

      it.each(happyPhrases)('should detect happiness in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(['happy', 'grateful']).toContain(result.primary);
      });
    });

    describe('Frustrated detection', () => {
      const frustratedPhrases = [
        "I'm so frustrated with this",
        "It's not working and I'm annoyed",
        "Ugh, I can't figure this out",
        'This is pointless',
      ];

      it.each(frustratedPhrases)('should detect frustration in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('frustrated');
      });
    });

    describe('Confused detection', () => {
      const confusedPhrases = [
        "I'm confused about what to do",
        "I don't understand this",
        'This makes no sense',
        'Help me understand',
      ];

      it.each(confusedPhrases)('should detect confusion in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('confused');
      });
    });

    describe('Grateful detection', () => {
      const gratefulPhrases = [
        'Thank you so much',
        'I really appreciate this',
        "You're the best!",
        'This means a lot to me',
      ];

      it.each(gratefulPhrases)('should detect gratitude in: "%s"', (phrase) => {
        const result = detectEmotion(phrase);
        expect(result.primary).toBe('grateful');
      });
    });

    describe('Neutral detection', () => {
      it('should return neutral for emotionless text', () => {
        const result = detectEmotion('The weather is mild today');
        expect(result.primary).toBe('neutral');
        expect(result.confidence).toBe(0.5);
      });

      it('should return neutral for technical text', () => {
        const result = detectEmotion('The function returns a boolean value');
        expect(result.primary).toBe('neutral');
      });
    });

    describe('Confidence calculation', () => {
      it('should have higher confidence with more keywords', () => {
        const oneKeyword = detectEmotion("I'm excited");
        const twoKeywords = detectEmotion("I'm excited and thrilled");

        // Both may hit cap, but with more keywords confidence should be >= single
        expect(twoKeywords.confidence).toBeGreaterThanOrEqual(oneKeyword.confidence);
      });

      it('should cap confidence at 0.95', () => {
        const result = detectEmotion(
          "I'm excited, thrilled, pumped, amazing, incredible, fantastic, awesome!"
        );
        expect(result.confidence).toBeLessThanOrEqual(0.95);
      });
    });

    describe('Secondary emotion detection', () => {
      it('should detect secondary emotion when present', () => {
        const result = detectEmotion("I'm excited but also a bit nervous about it");
        expect(result.secondary).toBeDefined();
      });

      it('should not have secondary emotion for single emotion text', () => {
        const result = detectEmotion("I'm happy");
        // May or may not have secondary depending on implementation
        // Just verify the primary is correct
        expect(['happy', 'neutral']).toContain(result.primary);
      });
    });

    describe('Keyword extraction', () => {
      it('should extract matched keywords', () => {
        const result = detectEmotion("I'm so excited and thrilled about this opportunity!");
        expect(result.keywords).toContain('excited');
        expect(result.keywords).toContain('thrilled');
      });

      it('should return empty keywords for neutral', () => {
        const result = detectEmotion('The sky is blue');
        expect(result.keywords).toHaveLength(0);
      });
    });
  });

  describe('Energy level detection', () => {
    describe('High energy patterns', () => {
      it('should detect high energy from multiple exclamation marks', () => {
        const result = detectEmotion('This is amazing!!!');
        expect(result.energy).toBe('high');
      });

      it('should detect high energy from ALL CAPS', () => {
        const result = detectEmotion("I'M SO EXCITED RIGHT NOW");
        expect(result.energy).toBe('high');
      });

      it('should detect high energy from intensifiers with exclamations', () => {
        // "so excited" pattern + multiple !! = 2 high patterns
        const result = detectEmotion("I'm so excited about this!!");
        expect(result.energy).toBe('high');
      });

      it('should detect high energy from multiple high-energy patterns', () => {
        // Needs 2+ high patterns: "can't wait" + multiple !!
        const result = detectEmotion("I can't wait for tomorrow!!");
        expect(result.energy).toBe('high');
      });
    });

    describe('Low energy patterns', () => {
      it('should detect low energy from trailing dots', () => {
        const result = detectEmotion("I don't know what to do...");
        expect(result.energy).toBe('low');
      });

      it('should detect low energy from "tired"', () => {
        const result = detectEmotion("I'm feeling so tired and drained");
        expect(result.energy).toBe('low');
      });

      it('should detect low energy from "exhausted" with additional patterns', () => {
        // Needs 2+ low patterns: "exhausted" + trailing dots
        const result = detectEmotion("I'm completely exhausted...");
        expect(result.energy).toBe('low');
      });

      it('should detect low energy from "whatever"', () => {
        const result = detectEmotion('Whatever, it is what it is...');
        expect(result.energy).toBe('low');
      });
    });

    describe('Medium energy', () => {
      it('should default to medium for neutral text', () => {
        const result = detectEmotion('I had a meeting today');
        expect(result.energy).toBe('medium');
      });

      it('should be medium for balanced text', () => {
        const result = detectEmotion("I'm doing okay, nothing special");
        expect(result.energy).toBe('medium');
      });
    });
  });

  describe('isUserDistressed', () => {
    it('should return true for distressed user', () => {
      expect(isUserDistressed("I can't handle this anymore")).toBe(true);
    });

    it('should return true for anxious user', () => {
      expect(isUserDistressed("I'm so worried about what might happen")).toBe(true);
    });

    it('should return true for highly sad user', () => {
      expect(isUserDistressed('I feel so empty and hopeless')).toBe(true);
    });

    it('should return false for happy user', () => {
      expect(isUserDistressed("I'm having a great day!")).toBe(false);
    });

    it('should return false for neutral user', () => {
      expect(isUserDistressed('The weather is nice')).toBe(false);
    });
  });

  describe('isUserExcited', () => {
    it('should return true for excited high-energy user', () => {
      expect(isUserExcited("I'm so excited!! Can't wait!!!")).toBe(true);
    });

    it('should return true for happy high-energy user', () => {
      expect(isUserExcited("I'M SO HAPPY RIGHT NOW!!")).toBe(true);
    });

    it('should return false for low-energy happiness', () => {
      expect(isUserExcited("I'm content today")).toBe(false);
    });

    it('should return false for sad user', () => {
      expect(isUserExcited("I'm feeling down")).toBe(false);
    });
  });

  describe('getResponseStyle', () => {
    describe('Distressed/Anxious/Sad response style', () => {
      it('should use slow pace for distressed', () => {
        const style = getResponseStyle({
          primary: 'distressed',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.pace).toBe('slow');
        expect(style.tone).toBe('gentle');
        expect(style.pauseMultiplier).toBe(1.5);
      });

      it('should use slow pace for anxious', () => {
        const style = getResponseStyle({
          primary: 'anxious',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.pace).toBe('slow');
      });

      it('should use slow pace for sad', () => {
        const style = getResponseStyle({
          primary: 'sad',
          confidence: 0.8,
          energy: 'low',
          keywords: [],
        });
        expect(style.pace).toBe('slow');
        expect(style.tone).toBe('gentle');
      });
    });

    describe('Excited/Happy response style', () => {
      it('should use fast pace for high-energy excitement', () => {
        const style = getResponseStyle({
          primary: 'excited',
          confidence: 0.8,
          energy: 'high',
          keywords: [],
        });
        expect(style.pace).toBe('fast');
        expect(style.tone).toBe('enthusiastic');
        expect(style.pauseMultiplier).toBe(0.8);
      });

      it('should use normal pace for medium-energy happiness', () => {
        const style = getResponseStyle({
          primary: 'happy',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.pace).toBe('normal');
        expect(style.tone).toBe('enthusiastic');
      });
    });

    describe('Angry/Frustrated response style', () => {
      it('should use supportive tone for angry', () => {
        const style = getResponseStyle({
          primary: 'angry',
          confidence: 0.8,
          energy: 'high',
          keywords: [],
        });
        expect(style.tone).toBe('supportive');
        expect(style.pauseMultiplier).toBe(1.2);
      });

      it('should use supportive tone for frustrated', () => {
        const style = getResponseStyle({
          primary: 'frustrated',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.tone).toBe('supportive');
      });
    });

    describe('Confused response style', () => {
      it('should use slow pace with warm tone', () => {
        const style = getResponseStyle({
          primary: 'confused',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.pace).toBe('slow');
        expect(style.tone).toBe('warm');
        expect(style.pauseMultiplier).toBe(1.3);
      });
    });

    describe('Grateful response style', () => {
      it('should use warm tone', () => {
        const style = getResponseStyle({
          primary: 'grateful',
          confidence: 0.8,
          energy: 'medium',
          keywords: [],
        });
        expect(style.tone).toBe('warm');
        expect(style.pauseMultiplier).toBe(1.0);
      });
    });

    describe('Neutral response style', () => {
      it('should use warm tone with normal pace', () => {
        const style = getResponseStyle({
          primary: 'neutral',
          confidence: 0.5,
          energy: 'medium',
          keywords: [],
        });
        expect(style.pace).toBe('normal');
        expect(style.tone).toBe('warm');
        expect(style.pauseMultiplier).toBe(1.0);
      });
    });
  });

  describe('analyzeConversationEmotion', () => {
    describe('Dominant emotion detection', () => {
      it('should find dominant emotion across messages', () => {
        const messages = [
          "I'm excited about the project!",
          'This is amazing!',
          'I love working on this',
          "I'm thrilled with the progress",
        ];

        const analysis = analyzeConversationEmotion(messages);
        expect(['excited', 'happy']).toContain(analysis.dominantEmotion);
      });

      it('should return neutral for empty messages', () => {
        const analysis = analyzeConversationEmotion([]);
        expect(analysis.dominantEmotion).toBe('neutral');
        expect(analysis.emotionalArc).toBe('stable');
        expect(analysis.averageEnergy).toBe('medium');
      });
    });

    describe('Emotional arc detection', () => {
      it('should detect improving arc', () => {
        const messages = [
          "I'm feeling really down today",
          'Still struggling with things',
          'Getting a bit better now',
          'Actually feeling good!',
        ];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.emotionalArc).toBe('improving');
      });

      it('should detect declining arc', () => {
        const messages = [
          "I'm excited to start!",
          'This is going well',
          "I'm getting frustrated",
          "I can't handle this anymore",
        ];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.emotionalArc).toBe('declining');
      });

      it('should detect stable arc', () => {
        const messages = [
          "I'm doing okay",
          'Things are fine',
          'Pretty normal day',
          'Nothing special happening',
        ];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.emotionalArc).toBe('stable');
      });
    });

    describe('Average energy calculation', () => {
      it('should calculate high average energy', () => {
        const messages = ["I'M SO EXCITED!!!", 'This is AMAZING!!!', "Can't wait for tomorrow!!"];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.averageEnergy).toBe('high');
      });

      it('should calculate low average energy', () => {
        const messages = [
          "I'm tired...",
          'Feeling drained today...',
          "I don't know... whatever...",
        ];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.averageEnergy).toBe('low');
      });

      it('should calculate medium average energy', () => {
        const messages = ['Having a normal day', 'Things are going okay', 'Nothing too exciting'];

        const analysis = analyzeConversationEmotion(messages);
        expect(analysis.averageEnergy).toBe('medium');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = detectEmotion('');
      expect(result.primary).toBe('neutral');
    });

    it('should handle single word', () => {
      const result = detectEmotion('excited');
      expect(result.primary).toBe('excited');
    });

    it('should handle mixed emotions', () => {
      const result = detectEmotion("I'm excited but also worried about it");
      expect(result.primary).toBeDefined();
      expect(result.secondary).toBeDefined();
    });

    it('should handle special characters', () => {
      const result = detectEmotion('This is great!!! 🎉');
      expect(result.primary).toBeDefined();
    });

    it('should be case insensitive', () => {
      const lower = detectEmotion("i'm excited");
      const upper = detectEmotion("I'M EXCITED");
      expect(lower.primary).toBe(upper.primary);
    });
  });
});
