/**
 * Tests for Context-Aware BTH Detection Functions
 *
 * These tests validate the "Better Than Human" detection improvements that
 * filter out false positives through contextual analysis.
 *
 * @module tests/context-aware-detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectUserDelightWithContext,
  detectVulnerabilityWithContext,
  type DelightDetectionResult,
  type VulnerabilityDetectionResult,
} from '../agents/realtime/emotion-event-dispatcher.js';

describe('detectUserDelightWithContext', () => {
  describe('sarcasm filtering', () => {
    it('should reject "oh great, so" patterns', () => {
      const result = detectUserDelightWithContext('Oh great, so now I have more work');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('sarcasm');
    });

    it('should reject "just great" patterns', () => {
      const result = detectUserDelightWithContext('Just great. Another problem.');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('sarcasm');
    });

    it('should reject "great, another" patterns', () => {
      const result = detectUserDelightWithContext("Great, another meeting I didn't need");
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('sarcasm');
    });

    it('should reject "yeah, that\'s great" patterns', () => {
      const result = detectUserDelightWithContext("Yeah, that's great");
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('sarcasm');
    });
  });

  describe('third-person filtering', () => {
    it('should reject news about others ("she got promoted")', () => {
      const result = detectUserDelightWithContext('She got a promotion at work!');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('third_person');
    });

    it('should reject "my friend got" patterns', () => {
      const result = detectUserDelightWithContext('My friend got the job!');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('third_person');
    });

    it('should reject "he passed" patterns', () => {
      const result = detectUserDelightWithContext('He passed the exam!');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('third_person');
    });

    it('should reject "her promotion" patterns', () => {
      const result = detectUserDelightWithContext('Her promotion was well-deserved!');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('third_person');
    });

    it('should reject "did you hear about" patterns', () => {
      const result = detectUserDelightWithContext("Did you hear about John's promotion?");
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('third_person');
    });
  });

  describe('negative context filtering', () => {
    it('should reject with negative emotional context above 0.6', () => {
      const result = detectUserDelightWithContext('I got the job', {
        sentiment: 'negative',
        intensity: 0.7,
      });
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('negative_context');
    });

    it('should reject with high-intensity negative context', () => {
      const result = detectUserDelightWithContext('I got a raise!', {
        sentiment: 'negative',
        intensity: 0.8,
      });
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('negative_context');
    });

    it('should accept with low-intensity negative context (below 0.6)', () => {
      const result = detectUserDelightWithContext('I got the promotion!', {
        sentiment: 'negative',
        intensity: 0.5, // Below 0.6 threshold
      });
      // Should detect since negative intensity is below threshold
      expect(result.detected).toBe(true);
    });
  });

  describe('true delight detection', () => {
    it('should detect "I got the job" pattern', () => {
      const result = detectUserDelightWithContext('I got the job!');
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect "I got a promotion" pattern', () => {
      const result = detectUserDelightWithContext('I got a promotion!');
      expect(result.detected).toBe(true);
    });

    it('should detect "I passed the exam" pattern', () => {
      const result = detectUserDelightWithContext('I passed the exam!');
      expect(result.detected).toBe(true);
    });

    it('should detect "we\'re pregnant" pattern', () => {
      const result = detectUserDelightWithContext("We're pregnant!");
      expect(result.detected).toBe(true);
    });

    it('should detect "I\'m so happy" pattern', () => {
      const result = detectUserDelightWithContext("I'm so happy right now!");
      expect(result.detected).toBe(true);
    });

    it('should detect "great news" pattern', () => {
      const result = detectUserDelightWithContext('Great news - we won the contract!');
      expect(result.detected).toBe(true);
    });

    it('should have higher confidence with positive context', () => {
      const withoutContext = detectUserDelightWithContext('I got a raise!');
      const withContext = detectUserDelightWithContext('I got a raise!', {
        sentiment: 'positive',
        intensity: 0.8,
      });

      expect(withContext.confidence).toBeGreaterThanOrEqual(withoutContext.confidence);
    });

    it('should return no_match for neutral messages', () => {
      const result = detectUserDelightWithContext('The weather is okay today.');
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('no_match');
    });
  });
});

describe('detectVulnerabilityWithContext', () => {
  describe('technical context filtering', () => {
    it('should not trigger for API uncertainty', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not entirely sure about the API rate limits. Let me check the documentation.",
        'api integration'
      );
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('technical_context');
    });

    it('should not trigger for code uncertainty', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not sure if this code pattern is optimal, but it works.",
        'code review'
      );
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('technical_context');
    });

    it('should not trigger for config uncertainty', () => {
      const result = detectVulnerabilityWithContext(
        "I don't know the exact config value off the top of my head.",
        'setup'
      );
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('technical_context');
    });

    it('should not trigger for deployment questions', () => {
      const result = detectVulnerabilityWithContext(
        "I'm uncertain about the deployment process for this region.",
        'deploy'
      );
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('technical_context');
    });
  });

  describe('emotional vulnerability detection', () => {
    it('should detect "I\'m not sure how to help you" pattern', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not sure how to help you with this. It's a complex situation."
      );
      expect(result.detected).toBe(true);
      expect(result.isEmotional).toBe(true);
    });

    it('should detect "I don\'t have all the answers about feelings" pattern', () => {
      const result = detectVulnerabilityWithContext(
        "I don't have all the answers when it comes to feelings. This is hard."
      );
      expect(result.detected).toBe(true);
      expect(result.isEmotional).toBe(true);
    });

    it('should detect "honestly, I\'m unsure" pattern', () => {
      const result = detectVulnerabilityWithContext(
        "Honestly, I'm unsure what you should do here."
      );
      expect(result.detected).toBe(true);
    });

    it('should detect "I might be wrong about this" pattern', () => {
      const result = detectVulnerabilityWithContext(
        'I might be wrong about this, but I think taking a break could help.'
      );
      expect(result.detected).toBe(true);
    });

    it('should detect "I realize I don\'t fully understand" pattern', () => {
      const result = detectVulnerabilityWithContext(
        "I realize I don't fully understand what you're going through."
      );
      expect(result.detected).toBe(true);
    });

    it('should detect emotional vulnerability even in technical context', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not sure how to help you with this. It's a question about feelings and I want to be honest.",
        'api integration'
      );
      // Should still detect because the emotional pattern is present
      expect(result.isEmotional).toBe(true);
    });
  });

  describe('non-vulnerable responses', () => {
    it('should not detect confident factual responses', () => {
      const result = detectVulnerabilityWithContext(
        'The capital of France is Paris. It has a population of about 2 million.'
      );
      expect(result.detected).toBe(false);
      expect(result.rejectionReason).toBe('no_match');
    });

    it('should not detect simple instructions', () => {
      const result = detectVulnerabilityWithContext(
        'To complete this task, first click the button, then enter your details.'
      );
      expect(result.detected).toBe(false);
    });

    it('should not detect casual conversation', () => {
      const result = detectVulnerabilityWithContext(
        'That sounds like a fun weekend! Tell me more about the hiking trail.'
      );
      expect(result.detected).toBe(false);
    });

    it('should not detect technical uncertainty as emotional', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not sure about the exact syntax. Let me look that up.",
        'code syntax'
      );
      expect(result.detected).toBe(false);
      expect(result.isEmotional).toBe(false);
    });
  });

  describe('confidence and categorization', () => {
    it('should return high confidence for explicit vulnerability patterns', () => {
      const result = detectVulnerabilityWithContext(
        "I'm not sure what to do to help you here. I don't have all the answers about feelings."
      );
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should categorize vulnerability types correctly', () => {
      const result = detectVulnerabilityWithContext(
        'I might be wrong about this, but I think you should talk to someone.'
      );
      expect(result.detected).toBe(true);
      // The type should be one of the valid vulnerability types
      expect(['uncertainty', 'admission', 'reflection', 'growth']).toContain(result.type);
    });
  });
});
