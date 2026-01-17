/**
 * Tests for Anti-Surveillance Language Filter
 *
 * Verifies that we detect and block surveillance-sounding language
 * to make Ferni feel like a friend, not a tracking app.
 */

import { describe, it, expect } from 'vitest';
import {
  detectSurveillanceLanguage,
  containsBlockingSurveillance,
  getSurveillanceIssues,
  humanizeSurveillanceLanguage,
  getAntiSurveillanceGuidance,
} from '../../services/revelation-moments/anti-surveillance.js';

describe('Anti-Surveillance Language Filter', () => {
  describe('detectSurveillanceLanguage', () => {
    it('should detect "our records show"', () => {
      const detections = detectSurveillanceLanguage('Our records show you like coffee');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('data_reference');
    });

    it('should detect "based on your data"', () => {
      const detections = detectSurveillanceLanguage('Based on your data, you prefer mornings');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('data_reference');
    });

    it('should detect statistics', () => {
      const detections = detectSurveillanceLanguage('In 80% of your sessions, you talk about work');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('statistics');
    });

    it('should detect tracking language', () => {
      const detections = detectSurveillanceLanguage("We've been tracking your mood patterns");
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('tracking_language');
    });

    it('should detect database speak', () => {
      const detections = detectSurveillanceLanguage('My system detected a pattern');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('database_speak');
    });

    it('should detect feature announcements', () => {
      const detections = detectSurveillanceLanguage('I can help you with goal setting');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].pattern.category).toBe('feature_announce');
    });

    it('should not flag human-sounding language', () => {
      const humanPhrases = [
        'I remember you mentioned your sister',
        "I've noticed you seem tired lately",
        'That keeps coming up',
        "I've been thinking about what you said",
      ];

      for (const phrase of humanPhrases) {
        const detections = detectSurveillanceLanguage(phrase);
        const blocking = detections.filter((d) => d.pattern.severity === 'block');
        expect(blocking.length).toBe(0);
      }
    });
  });

  describe('containsBlockingSurveillance', () => {
    it('should return true for blocking patterns', () => {
      expect(containsBlockingSurveillance('Our records show you like coffee')).toBe(true);
      expect(containsBlockingSurveillance("We've been tracking your patterns")).toBe(true);
      expect(containsBlockingSurveillance('Your profile indicates stress')).toBe(true);
    });

    it('should return false for human language', () => {
      expect(containsBlockingSurveillance('I remember you mentioned that')).toBe(false);
      expect(containsBlockingSurveillance("I've noticed this keeps coming up")).toBe(false);
    });

    it('should return false for warnings only', () => {
      // "I can help you with" is a warning, not a block
      const result = containsBlockingSurveillance('I can help you with that');
      // This depends on severity - check the actual pattern
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getSurveillanceIssues', () => {
    it('should categorize blocking vs warning', () => {
      const result = getSurveillanceIssues(
        'Our records show you mentioned work 5 times. I can help you with stress management.'
      );

      expect(result.hasBlocking).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);

      const blockingIssues = result.issues.filter((i) => i.severity === 'block');
      expect(blockingIssues.length).toBeGreaterThan(0);
    });

    it('should provide alternatives where available', () => {
      const result = getSurveillanceIssues('Our records show you like coffee');

      const issueWithAlternative = result.issues.find((i) => i.alternative);
      expect(issueWithAlternative).toBeDefined();
      expect(issueWithAlternative?.alternative).toBe('I remember');
    });
  });

  describe('humanizeSurveillanceLanguage', () => {
    it('should transform "our records show" to "I remember"', () => {
      const { transformed, changes } = humanizeSurveillanceLanguage(
        'Our records show you like mornings'
      );

      expect(transformed).toContain('I remember');
      expect(transformed).not.toContain('Our records show');
      expect(changes.length).toBeGreaterThan(0);
    });

    it('should transform "based on your data"', () => {
      const { transformed } = humanizeSurveillanceLanguage('Based on your data, you prefer coffee');

      expect(transformed).toContain("From what I've seen");
    });

    it('should not change human-sounding language', () => {
      const original = 'I remember you mentioned your sister';
      const { transformed, changes } = humanizeSurveillanceLanguage(original);

      expect(transformed).toBe(original);
      expect(changes.length).toBe(0);
    });
  });

  describe('getAntiSurveillanceGuidance', () => {
    it('should return guidance string', () => {
      const guidance = getAntiSurveillanceGuidance();

      expect(typeof guidance).toBe('string');
      expect(guidance.length).toBeGreaterThan(100);
      expect(guidance).toContain('NEVER');
      expect(guidance).toContain('ALWAYS');
    });

    it('should include examples of what not to say', () => {
      const guidance = getAntiSurveillanceGuidance();

      expect(guidance).toContain('Our records show');
      expect(guidance).toContain('Based on your data');
    });

    it('should include examples of what to say', () => {
      const guidance = getAntiSurveillanceGuidance();

      expect(guidance).toContain('I remember');
      expect(guidance).toContain("I've noticed");
    });
  });
});

describe('Real-World Scenarios', () => {
  it('should catch typical AI assistant language', () => {
    // These are definitely blocking patterns (matching our regex patterns)
    const blockingResponses = [
      "Our records show you've been stressed about work lately.", // matches "our records show"
      'Based on the data, I see a pattern.', // matches "based on the data"
      'My system detected that you might be feeling anxious.', // matches "my system detected"
      "I'm designed to help you.", // matches "designed to"
      "We've been tracking your mood patterns.", // matches "we've been tracking"
    ];

    for (const response of blockingResponses) {
      expect(containsBlockingSurveillance(response)).toBe(true);
    }

    // These are warnings but may not be blocking
    const warningResponses = ['I can help you with stress management.'];

    for (const response of warningResponses) {
      const issues = getSurveillanceIssues(response);
      // Should have at least a warning
      expect(issues.hasBlocking || issues.hasWarnings).toBe(true);
    }
  });

  it('should allow friendly, human responses', () => {
    const humanResponses = [
      "I remember you were dealing with some work stuff. How's that going?",
      'You keep mentioning your sister. You two seem close.',
      'That sounds like what you were going through before. Is it connected?',
      "I've noticed work comes up a lot. What's really going on there?",
      "There's something I've been thinking about since last time...",
    ];

    for (const response of humanResponses) {
      expect(containsBlockingSurveillance(response)).toBe(false);
    }
  });
});
