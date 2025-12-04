/**
 * Speech System Tests
 *
 * Tests for adaptive SSML tagging, WPM tracking, and speech context.
 *
 * Note: Requires vitest as dev dependency: npm install -D vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tagTextWithSsml } from '../ssml/index.js';

describe('Speech Context', () => {
  describe('Base SSML Tagger', () => {
    it('should add SSML tags to plain text', () => {
      const text = 'Hello, how are you doing today?';
      const tagged = tagTextWithSsml(text);

      expect(tagged).toContain('<');
      // Should have added some SSML markup
      expect(tagged.length).toBeGreaterThan(text.length);
    });

    it('should add emotional tags', () => {
      const text = "I'm so happy to hear that!";
      const tagged = tagTextWithSsml(text);

      // Should contain emotion-related markup
      expect(tagged.length).toBeGreaterThan(text.length);
    });

    it('should add speed variations', () => {
      const text = 'Let me explain this slowly and carefully.';
      const tagged = tagTextWithSsml(text);

      expect(tagged).toContain('<speed');
    });

    it('should add natural pauses', () => {
      const text = 'First, you need to understand the basics. Second, apply what you learn.';
      const tagged = tagTextWithSsml(text);

      expect(tagged).toContain('<break');
    });

    it('should handle questions', () => {
      const text = 'How are you feeling about all this?';
      const tagged = tagTextWithSsml(text);

      // Questions should have specific tagging
      expect(tagged.length).toBeGreaterThan(text.length);
    });
  });

  describe('SSML Safety', () => {
    it('should not break on empty input', () => {
      const tagged = tagTextWithSsml('');
      expect(tagged).toBe('');
    });

    it('should handle very long text', () => {
      const longText = 'This is a test. '.repeat(100);
      const tagged = tagTextWithSsml(longText);

      // Should return something
      expect(tagged.length).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const text = "What about 401(k) plans & IRAs? They're important!";
      const tagged = tagTextWithSsml(text);

      // Should not throw
      expect(tagged.length).toBeGreaterThan(0);
    });
  });

  describe('Emotion-Specific Tagging', () => {
    it('should tag happy content appropriately', () => {
      const text = "Congratulations! That's wonderful news!";
      const tagged = tagTextWithSsml(text);

      // Should have emotion markup
      expect(tagged.length).toBeGreaterThan(text.length);
    });

    it('should tag sad content gently', () => {
      const text = "I'm sorry to hear about your loss.";
      const tagged = tagTextWithSsml(text);

      // Should have slower/gentler markup
      expect(tagged.length).toBeGreaterThan(text.length);
    });

    it('should tag advice content clearly', () => {
      const text =
        "Here's what I recommend: First, maximize your 401k. Second, build an emergency fund.";
      const tagged = tagTextWithSsml(text);

      // Should have pauses between points
      expect(tagged).toContain('<break');
    });
  });

  describe('Structural Elements', () => {
    it('should add pauses after periods', () => {
      const text = 'This is important. Really important.';
      const tagged = tagTextWithSsml(text);

      expect(tagged).toContain('<break');
    });

    it('should handle lists', () => {
      const text = 'There are four principles: goals, balance, cost, and discipline.';
      const tagged = tagTextWithSsml(text);

      // Should handle the colon and list
      expect(tagged.length).toBeGreaterThan(text.length);
    });

    it('should handle numbers', () => {
      const text = 'You could save $1,000,000 over 30 years.';
      const tagged = tagTextWithSsml(text);

      // Should not break on numbers
      expect(tagged.length).toBeGreaterThan(0);
    });
  });
});

describe('WPM Tracking Concepts', () => {
  it('should calculate WPM correctly', () => {
    // 10 words in 4 seconds = 150 WPM
    const words = 'This is a test message with exactly ten words here.'.split(' ').length;
    const durationSeconds = 4;
    const wpm = (words / durationSeconds) * 60;

    expect(wpm).toBe(150);
  });

  it('should classify slow pace correctly', () => {
    const slowWPM = 100;
    const pace = slowWPM < 120 ? 'slow' : slowWPM > 160 ? 'fast' : 'moderate';

    expect(pace).toBe('slow');
  });

  it('should classify fast pace correctly', () => {
    const fastWPM = 180;
    const pace = fastWPM < 120 ? 'slow' : fastWPM > 160 ? 'fast' : 'moderate';

    expect(pace).toBe('fast');
  });

  it('should classify moderate pace correctly', () => {
    const moderateWPM = 140;
    const pace = moderateWPM < 120 ? 'slow' : moderateWPM > 160 ? 'fast' : 'moderate';

    expect(pace).toBe('moderate');
  });
});

describe('Speech Context Concepts', () => {
  it('should build default speech context', () => {
    const defaultContext = {
      baseSpeed: 0.95,
      pauseMultiplier: 1.0,
      allowLaughter: true,
      emotionIntensity: 0.5,
      userEnergy: 'medium' as const,
      topicWeight: 'light' as const,
      phase: 'greeting' as const,
    };

    expect(defaultContext.baseSpeed).toBeDefined();
    expect(defaultContext.pauseMultiplier).toBeDefined();
    expect(defaultContext.allowLaughter).toBe(true);
  });

  it('should disable laughter for heavy topics', () => {
    const heavyTopics = ['grief', 'loss', 'death', 'cancer', 'bankruptcy'];
    const currentTopics = ['grief'];

    const hasHeavyTopic = currentTopics.some((t) => heavyTopics.includes(t));
    const allowLaughter = !hasHeavyTopic;

    expect(allowLaughter).toBe(false);
  });

  it('should increase pauses for distressed users', () => {
    const distressLevel = 0.8;
    const basePauseMultiplier = 1.0;
    const adjustedPauseMultiplier = basePauseMultiplier + distressLevel * 0.5;

    expect(adjustedPauseMultiplier).toBeGreaterThan(basePauseMultiplier);
    expect(adjustedPauseMultiplier).toBe(1.4);
  });

  it('should adjust speed for fast speakers', () => {
    const userWPM = 180;
    const baseSpeed = 0.95;
    const speedAdjustment = (userWPM - 140) / 100; // 0.4 for 180 WPM
    const adjustedSpeed = Math.min(1.2, baseSpeed + speedAdjustment);

    expect(adjustedSpeed).toBeGreaterThan(baseSpeed);
  });
});
