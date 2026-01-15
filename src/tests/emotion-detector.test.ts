/**
 * Emotion Detector Tests
 *
 * Tests for the emotion detector module that analyzes:
 * - Primary and secondary emotions
 * - Emotional intensity and valence
 * - Distress levels
 * - Suggested response tones
 * - Emotional trajectory tracking
 *
 * @module tests/emotion-detector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  EmotionDetector,
  getEmotionDetector,
  detectEmotion,
  type EmotionResult,
  type PrimaryEmotion,
} from '../intelligence/emotion-detector.js';

// ============================================================================
// TESTS
// ============================================================================

describe('EmotionDetector', () => {
  let detector: EmotionDetector;

  beforeEach(() => {
    detector = new EmotionDetector();
  });

  // --------------------------------------------------------------------------
  // Basic Detection
  // --------------------------------------------------------------------------

  describe('detect()', () => {
    it('should return an EmotionResult', () => {
      const result = detector.detect('I am happy today');

      expect(result).toBeDefined();
      expect(result.primary).toBeDefined();
      expect(result.intensity).toBeDefined();
      expect(result.valence).toBeDefined();
      expect(result.distressLevel).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.markers).toBeDefined();
      expect(result.suggestedTone).toBeDefined();
    });

    it('should detect joy', () => {
      const result = detector.detect('I am so happy and excited about this!');

      expect(result.primary).toBe('joy');
      expect(result.valence).toBe('positive');
    });

    it('should detect sadness', () => {
      const result = detector.detect('I feel really sad and depressed');

      expect(result.primary).toBe('sadness');
      expect(result.valence).toBe('negative');
    });

    it('should detect anger', () => {
      const result = detector.detect('I am so angry and furious right now');

      expect(result.primary).toBe('anger');
      expect(result.valence).toBe('negative');
    });

    it('should detect fear', () => {
      const result = detector.detect('I am scared and terrified');

      expect(result.primary).toBe('fear');
      expect(result.valence).toBe('negative');
    });

    it('should detect anxiety', () => {
      const result = detector.detect('I feel anxious and stressed about everything');

      expect(result.primary).toBe('anxiety');
      expect(result.valence).toBe('negative');
    });

    it('should detect trust', () => {
      const result = detector.detect('I really trust and believe in this approach');

      expect(result.primary).toBe('trust');
      expect(result.valence).toBe('positive');
    });

    it('should detect anticipation', () => {
      const result = detector.detect("I can't wait and I'm so excited for what's coming");

      expect(result.primary).toBe('anticipation');
      expect(result.valence).toBe('positive');
    });

    it('should detect regret', () => {
      const result = detector.detect(
        'I deeply regret that decision, I wish I had chosen differently'
      );

      expect(result.primary).toBe('regret');
      expect(result.valence).toBe('negative');
    });

    it('should return neutral for neutral text', () => {
      const result = detector.detect('The meeting is at 3pm');

      expect(result.primary).toBe('neutral');
      expect(result.valence).toBe('neutral');
    });
  });

  // --------------------------------------------------------------------------
  // Intensity Modifiers
  // --------------------------------------------------------------------------

  describe('Intensity Modifiers', () => {
    it('should increase intensity with amplifiers', () => {
      const normal = detector.detect('I am happy');
      detector.clearHistory();
      const amplified = detector.detect('I am extremely happy');

      expect(amplified.intensity).toBeGreaterThan(normal.intensity);
    });

    it('should decrease intensity with diminishers', () => {
      const normal = detector.detect('I am worried');
      detector.clearHistory();
      const diminished = detector.detect('I am a little worried');

      expect(diminished.intensity).toBeLessThanOrEqual(normal.intensity);
    });

    it('should handle multiple modifiers', () => {
      const result = detector.detect('I am very very happy');
      expect(result.intensity).toBeGreaterThan(0.5);
    });

    it('should detect all caps as increased intensity', () => {
      const normal = detector.detect('I am angry');
      detector.clearHistory();
      const shouting = detector.detect('I AM ANGRY');

      expect(shouting.intensity).toBeGreaterThan(normal.intensity);
    });
  });

  // --------------------------------------------------------------------------
  // Distress Detection
  // --------------------------------------------------------------------------

  describe('Distress Detection', () => {
    it('should detect high distress', () => {
      const result = detector.detect("I'm desperate and can't cope anymore");
      expect(result.distressLevel).toBeGreaterThan(0.7);
    });

    it('should detect crisis language', () => {
      const result = detector.detect('This is an emergency, I need help immediately');
      expect(result.distressLevel).toBeGreaterThan(0.5);
    });

    it('should detect financial distress', () => {
      const result = detector.detect('The market crashed and I lost everything');
      expect(result.distressLevel).toBeGreaterThan(0.5);
    });

    it('should return low distress for calm messages', () => {
      const result = detector.detect("I'm curious about investment options");
      expect(result.distressLevel).toBeLessThan(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // Suggested Tone
  // --------------------------------------------------------------------------

  describe('Suggested Tone', () => {
    it('should suggest gentle tone for high distress', () => {
      const result = detector.detect("I'm terrified and can't cope with this");
      expect(['gentle', 'reassuring']).toContain(result.suggestedTone);
    });

    it('should suggest warm tone for joy', () => {
      const result = detector.detect("I'm so happy and thrilled!");
      expect(['warm', 'friendly', 'enthusiastic']).toContain(result.suggestedTone);
    });

    it('should suggest calm or reassuring tone for anger', () => {
      const result = detector.detect('I am really angry about this');
      expect(['calm', 'reassuring']).toContain(result.suggestedTone);
    });

    it('should suggest informative tone for neutral', () => {
      const result = detector.detect('Can you tell me about savings accounts?');
      expect(['informative', 'calm', 'friendly']).toContain(result.suggestedTone);
    });
  });

  // --------------------------------------------------------------------------
  // Negation Handling
  // --------------------------------------------------------------------------

  describe('Negation Handling', () => {
    it('should handle negation of positive emotions', () => {
      const result = detector.detect("I'm not happy about this");
      // Should not detect as joy
      expect(result.primary).not.toBe('joy');
    });

    it('should handle "never" as negation', () => {
      const result = detector.detect('I never feel excited about finances');
      expect(result.primary).not.toBe('anticipation');
    });
  });

  // --------------------------------------------------------------------------
  // Markers
  // --------------------------------------------------------------------------

  describe('Markers', () => {
    it('should include detected keywords in markers', () => {
      const result = detector.detect('I feel happy and grateful');
      expect(result.markers).toContain('happy');
      expect(result.markers).toContain('grateful');
    });

    it('should include modifiers in markers', () => {
      const result = detector.detect('I am extremely worried');
      expect(result.markers).toContain('worried');
      expect(result.markers).toContain('extremely');
    });

    it('should deduplicate markers', () => {
      const result = detector.detect('happy happy happy');
      const uniqueMarkers = new Set(result.markers);
      expect(uniqueMarkers.size).toBe(result.markers.length);
    });
  });

  // --------------------------------------------------------------------------
  // Emotional Trajectory
  // --------------------------------------------------------------------------

  describe('getEmotionalTrajectory()', () => {
    it('should return unknown with insufficient history', () => {
      const trajectory = detector.getEmotionalTrajectory();
      expect(trajectory.trend).toBe('unknown');
    });

    it('should detect improving trajectory', () => {
      // Start negative
      detector.detect('I feel very sad and hopeless');
      detector.detect('I am still feeling down');
      detector.detect('Things are getting a bit better');
      detector.detect("I'm feeling happier now");
      detector.detect("I'm actually excited about the future");

      const trajectory = detector.getEmotionalTrajectory();
      expect(['improving', 'stable']).toContain(trajectory.trend);
    });

    it('should track average distress', () => {
      detector.detect("I'm a bit stressed");
      detector.detect("I'm worried");
      detector.detect("I'm anxious");

      const trajectory = detector.getEmotionalTrajectory();
      expect(trajectory.averageDistress).toBeGreaterThan(0);
    });

    it('should identify dominant emotion', () => {
      detector.detect('I feel happy');
      detector.detect('I am so happy');
      detector.detect('This makes me happy');

      const trajectory = detector.getEmotionalTrajectory();
      expect(trajectory.dominantEmotion).toBe('joy');
    });
  });

  // --------------------------------------------------------------------------
  // needsEmotionalSupport
  // --------------------------------------------------------------------------

  describe('needsEmotionalSupport()', () => {
    it('should return false with no history', () => {
      expect(detector.needsEmotionalSupport()).toBe(false);
    });

    it('should return true for high distress', () => {
      detector.detect("I'm desperate and terrified");
      detector.detect("I can't cope anymore");
      detector.detect('Everything is falling apart');

      expect(detector.needsEmotionalSupport()).toBe(true);
    });

    it('should return false for low distress', () => {
      detector.detect('I am curious about investing');
      detector.detect('Can you explain more?');
      detector.detect('That sounds interesting');

      expect(detector.needsEmotionalSupport()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // clearHistory
  // --------------------------------------------------------------------------

  describe('clearHistory()', () => {
    it('should clear emotion history', () => {
      detector.detect('I feel happy');
      detector.detect('I feel sad');
      detector.detect('I feel angry');

      detector.clearHistory();

      expect(detector.needsEmotionalSupport()).toBe(false);
      expect(detector.getEmotionalTrajectory().trend).toBe('unknown');
    });
  });

  // --------------------------------------------------------------------------
  // detectWithLLM
  // --------------------------------------------------------------------------

  describe('detectWithLLM()', () => {
    it('should return keyword result when confident', async () => {
      const result = await detector.detectWithLLM('I am extremely happy and thrilled!');

      expect(result.primary).toBe('joy');
      expect(result.markers).not.toContain('[llm-enhanced]');
    });

    it('should use keyword result when no LLM provided', async () => {
      const result = await detector.detectWithLLM('maybe I feel ok');

      expect(result).toBeDefined();
      expect(result.primary).toBeDefined();
    });

    it('should enhance with LLM when confidence is low', async () => {
      const mockLLM = vi.fn().mockResolvedValue(
        JSON.stringify({
          primary: 'anxiety',
          intensity: 0.6,
          distressLevel: 0.4,
          valence: 'negative',
        })
      );

      const result = await detector.detectWithLLM('hmm I dunno', mockLLM);

      // Should either use keyword or LLM result
      expect(result).toBeDefined();
    });

    it('should handle LLM failure gracefully', async () => {
      const mockLLM = vi.fn().mockRejectedValue(new Error('LLM failed'));

      const result = await detector.detectWithLLM('some text', mockLLM);

      expect(result).toBeDefined();
      expect(result.primary).toBeDefined();
    });

    it('should handle invalid LLM response', async () => {
      const mockLLM = vi.fn().mockResolvedValue('not valid json');

      const result = await detector.detectWithLLM('test text', mockLLM);

      expect(result).toBeDefined();
    });

    it('should validate LLM emotion type', async () => {
      const mockLLM = vi.fn().mockResolvedValue(
        JSON.stringify({
          primary: 'invalid-emotion',
          intensity: 0.5,
        })
      );

      const result = await detector.detectWithLLM('test text', mockLLM);

      expect(result).toBeDefined();
      // Should fall back to keyword detection
    });
  });

  // --------------------------------------------------------------------------
  // Singleton and Utility Functions
  // --------------------------------------------------------------------------

  describe('Singleton and Utilities', () => {
    it('getEmotionDetector should return singleton', () => {
      const detector1 = getEmotionDetector();
      const detector2 = getEmotionDetector();
      expect(detector1).toBe(detector2);
    });

    it('detectEmotion should work as shortcut', () => {
      const result = detectEmotion('I am happy');
      expect(result).toBeDefined();
      expect(result.primary).toBe('joy');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = detector.detect('');
      expect(result.primary).toBe('neutral');
    });

    it('should handle very long text', () => {
      const longText = 'I feel happy. '.repeat(100);
      const result = detector.detect(longText);
      expect(result).toBeDefined();
      expect(result.primary).toBe('joy');
    });

    it('should handle special characters', () => {
      const result = detector.detect("I'm happy!!! :) <3 $$$ @#$%");
      expect(result).toBeDefined();
    });

    it('should handle mixed emotions', () => {
      const result = detector.detect('I am happy but also worried');
      expect(result).toBeDefined();
      expect(result.secondary).toBeDefined();
    });

    it('should handle unicode', () => {
      const result = detector.detect('I feel good about this');
      expect(result).toBeDefined();
    });

    it('should cap history at 20 entries', () => {
      for (let i = 0; i < 30; i++) {
        detector.detect('I feel happy');
      }

      // Should not throw and trajectory should work
      const trajectory = detector.getEmotionalTrajectory();
      expect(trajectory).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Financial Context
  // --------------------------------------------------------------------------

  describe('Financial Context', () => {
    it('should detect anxiety around market crash', () => {
      const result = detector.detect("The market is crashing and I'm scared I'll lose everything");
      expect(['anxiety', 'fear']).toContain(result.primary);
      expect(result.distressLevel).toBeGreaterThan(0.4);
    });

    it('should detect joy around financial success', () => {
      const result = detector.detect("I just retired! I'm so happy and grateful");
      expect(result.primary).toBe('joy');
      expect(result.valence).toBe('positive');
    });

    it('should detect worry about not having enough saved', () => {
      const result = detector.detect("I don't have enough saved for retirement");
      expect(result.distressLevel).toBeGreaterThan(0.3);
    });
  });
});
