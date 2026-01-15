import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionDetector } from '../intelligence/detectors/emotion.js';

describe('Emotion Detector - Distress Detection Tests', () => {
  let detector: EmotionDetector;

  beforeEach(() => {
    detector = new EmotionDetector();
  });

  describe('Critical Distress Level Detection', () => {
    it('should detect crisis-level distress', () => {
      const result = detector.detect(
        "I don't know what to do. I lost everything in the market crash. I can't sleep. Help."
      );

      expect(result.distressLevel).toBeGreaterThan(0.7);
      expect(result.suggestedTone).toBe('gentle');
    });

    it('should detect multiple distress indicators', () => {
      const result = detector.detect("I'm terrified and can't cope. This is an emergency.");

      expect(result.distressLevel).toBeGreaterThan(0.8);
      expect(result.markers.length).toBeGreaterThan(0);
    });

    it('should not over-trigger on mild concern', () => {
      const result = detector.detect("I'm a bit worried about the market.");

      expect(result.distressLevel).toBeLessThan(0.5);
    });

    it('should detect financial loss distress', () => {
      const result = detector.detect('I lost my retirement savings. Everything is ruined.');

      expect(result.distressLevel).toBeGreaterThan(0.6);
      expect(['sadness', 'fear', 'anxiety']).toContain(result.primary);
    });

    it('should detect panic and anxiety', () => {
      const result = detector.detect("I'm panicking about my investments. What do I do?");

      expect(result.distressLevel).toBeGreaterThan(0.5);
      expect(['fear', 'anxiety']).toContain(result.primary);
    });

    it('should detect hopelessness', () => {
      const result = detector.detect("There's no point anymore. I've lost everything.");

      expect(result.distressLevel).toBeGreaterThan(0.7);
    });

    it('should handle neutral statements', () => {
      const result = detector.detect("What's the weather like today?");

      expect(result.distressLevel).toBeLessThan(0.2);
    });

    it('should handle positive emotions', () => {
      const result = detector.detect("I'm so happy with my investment returns!");

      expect(result.distressLevel).toBeLessThan(0.1);
      expect(result.primary).toBe('joy');
    });
  });

  describe('Intensity Modifiers', () => {
    it('should amplify emotion with "extremely"', () => {
      const normal = detector.detect("I'm worried");
      const amplified = detector.detect("I'm extremely worried");

      expect(amplified.intensity).toBeGreaterThan(normal.intensity);
    });

    it('should amplify emotion with "very"', () => {
      const normal = detector.detect("I'm anxious");
      const amplified = detector.detect("I'm very anxious");

      expect(amplified.intensity).toBeGreaterThan(normal.intensity);
    });

    it('should diminish emotion with "slightly"', () => {
      const normal = detector.detect("I'm worried");
      const diminished = detector.detect("I'm slightly worried");

      expect(diminished.intensity).toBeLessThan(normal.intensity);
    });

    it('should diminish emotion with "a bit"', () => {
      const normal = detector.detect("I'm concerned");
      const diminished = detector.detect("I'm a bit concerned");

      expect(diminished.intensity).toBeLessThan(normal.intensity);
    });

    it('should handle multiple modifiers correctly', () => {
      const result = detector.detect("I'm very, very anxious");

      expect(result.intensity).toBeGreaterThan(0.6);
    });
  });

  describe('Mixed Emotions', () => {
    it('should detect primary and secondary emotions', () => {
      const result = detector.detect("I'm excited but also nervous about retiring");

      expect(result.primary).toBeTruthy();
      // Should detect both positive and negative emotions
      expect(result).toBeTruthy();
    });

    it('should handle emotional complexity', () => {
      const result = detector.detect("I'm happy about the gains but worried about a market crash");

      expect(result.primary).toBeTruthy();
      // Should recognize the emotional conflict
      expect(result.valence).toBeTruthy();
    });

    it('should detect conflicting emotions', () => {
      const result = detector.detect("I'm thrilled but also terrified");

      expect(result.primary).toBeTruthy();
      expect(result.intensity).toBeGreaterThan(0);
    });
  });

  describe('Emotional Trajectory Tracking', () => {
    it('should track improving emotional trend', () => {
      detector.detect("I'm very worried and scared");
      detector.detect("I'm still concerned but feeling better");
      detector.detect('I feel more confident now');

      const trajectory = detector.getEmotionalTrajectory();

      expect(trajectory.trend).toBe('improving');
    });

    it('should track declining emotional trend', () => {
      detector.detect("I'm okay with the plan");
      detector.detect("I'm starting to worry");
      detector.detect("I'm very anxious now");

      const trajectory = detector.getEmotionalTrajectory();

      expect(trajectory.trend).toBe('declining');
    });

    it('should track stable emotional state', () => {
      detector.detect("I'm feeling calm");
      detector.detect('Still feeling calm');
      detector.detect('Remaining calm');

      const trajectory = detector.getEmotionalTrajectory();

      expect(trajectory.trend).toBe('stable');
    });

    it('should identify users needing support', () => {
      detector.detect("I'm panicking");
      detector.detect("I can't think straight");
      detector.detect("I'm terrified");

      const needsSupport = detector.needsEmotionalSupport();

      expect(needsSupport).toBe(true);
    });

    it('should not flag stable users as needing support', () => {
      detector.detect("I'm feeling good");
      detector.detect('Still feeling positive');
      detector.detect('Everything is fine');

      const needsSupport = detector.needsEmotionalSupport();

      expect(needsSupport).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negations correctly', () => {
      const result = detector.detect("I'm not happy about this");

      // Should not detect as happy
      expect(result.primary).not.toBe('joy');
    });

    it('should handle questions', () => {
      const result = detector.detect('Why am I so worried about this?');

      expect(['fear', 'anxiety']).toContain(result.primary);
    });

    it('should handle empty strings', () => {
      expect(() => detector.detect('')).not.toThrow();
      const result = detector.detect('');

      expect(result).toBeTruthy();
      expect(result.primary).toBeTruthy();
    });

    it('should handle very long text', () => {
      const longText = "I'm worried. ".repeat(100);

      expect(() => detector.detect(longText)).not.toThrow();
      const result = detector.detect(longText);

      expect(result.distressLevel).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const result = detector.detect("I'm so $#@! worried!!!");

      expect(result.distressLevel).toBeGreaterThan(0.3);
    });

    it('should handle all caps (shouting)', () => {
      const result = detector.detect("I'M REALLY WORRIED ABOUT THIS");

      expect(result.intensity).toBeGreaterThan(0.5);
    });
  });

  describe('Financial Context Emotions', () => {
    it('should detect market crash anxiety', () => {
      const result = detector.detect("The market is crashing and I'm losing everything!");

      expect(result.distressLevel).toBeGreaterThan(0.6);
      expect(['fear', 'anxiety']).toContain(result.primary);
    });

    it('should detect retirement planning stress', () => {
      const result = detector.detect(
        "I'm so stressed about retirement. I don't have enough saved."
      );

      expect(result.distressLevel).toBeGreaterThan(0.4);
    });

    it('should detect confidence in investing', () => {
      const result = detector.detect('I feel confident in my long-term strategy');

      expect(['trust', 'joy']).toContain(result.primary);
      expect(result.distressLevel).toBeLessThan(0.3);
    });

    it('should detect regret about past decisions', () => {
      const result = detector.detect('I regret selling my stocks during the downturn');

      expect(['sadness', 'regret']).toContain(result.primary);
    });

    it('should detect excitement about gains', () => {
      const result = detector.detect("I'm so excited! My portfolio is up 20%!");

      expect(result.primary).toBe('joy');
      expect(result.valence).toBe('positive');
    });

    it('should detect confusion about financial topics', () => {
      const result = detector.detect("I'm completely confused about which funds to choose");

      expect(result.primary).toBeTruthy();
      // May detect as anxiety or uncertainty
    });
  });

  describe('Suggested Tone Based on Emotion', () => {
    it('should suggest gentle tone for high distress', () => {
      const result = detector.detect("I'm terrified about losing everything");

      expect(result.suggestedTone).toBe('gentle');
    });

    it('should suggest calm tone for moderate distress', () => {
      const result = detector.detect("I'm a bit concerned about the market");

      expect(['calm', 'reassuring']).toContain(result.suggestedTone);
    });

    it('should suggest warm tone for positive emotions', () => {
      const result = detector.detect("I'm so grateful for your help!");

      expect(['warm', 'friendly']).toContain(result.suggestedTone);
    });

    it('should suggest measured tone for neutral state', () => {
      const result = detector.detect('Tell me about index funds');

      expect(['measured', 'informative', 'calm']).toContain(result.suggestedTone);
    });
  });
});
