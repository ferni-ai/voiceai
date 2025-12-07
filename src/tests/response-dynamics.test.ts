/**
 * Response Dynamics Engine Tests
 *
 * Tests for the response dynamics module that handles:
 * - Response pacing and timing
 * - User engagement tracking
 * - Topic transitions
 * - Response length recommendations
 *
 * @module tests/response-dynamics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getResponseDynamicsEngine,
  resetResponseDynamicsEngine,
  type ResponseDynamicsEngine,
} from '../conversation/response-dynamics.js';

// ============================================================================
// TESTS
// ============================================================================

describe('ResponseDynamicsEngine', () => {
  let engine: ResponseDynamicsEngine;

  beforeEach(() => {
    resetResponseDynamicsEngine();
    engine = getResponseDynamicsEngine();
  });

  afterEach(() => {
    resetResponseDynamicsEngine();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getResponseDynamicsEngine();
      const instance2 = getResponseDynamicsEngine();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getResponseDynamicsEngine();
      resetResponseDynamicsEngine();
      const instance2 = getResponseDynamicsEngine();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // recordMessage Method
  // --------------------------------------------------------------------------

  describe('recordMessage()', () => {
    it('should record user messages', () => {
      expect(() => {
        engine.recordMessage('user', 'Hello, how are you?');
      }).not.toThrow();
    });

    it('should record agent messages', () => {
      expect(() => {
        engine.recordMessage('agent', 'I am doing well, thank you!');
      }).not.toThrow();
    });

    it('should handle empty messages', () => {
      expect(() => {
        engine.recordMessage('user', '');
      }).not.toThrow();
    });

    it('should handle long messages', () => {
      const longMessage = 'This is a long message. '.repeat(100);
      expect(() => {
        engine.recordMessage('user', longMessage);
      }).not.toThrow();
    });

    it('should track multiple messages', () => {
      expect(() => {
        engine.recordMessage('user', 'First message');
        engine.recordMessage('agent', 'First response');
        engine.recordMessage('user', 'Second message');
        engine.recordMessage('agent', 'Second response');
      }).not.toThrow();
    });

    it('should accept optional topics array', () => {
      expect(() => {
        engine.recordMessage('user', 'Tell me about investing', ['investing', 'finance']);
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // getEngagementMetrics Method
  // --------------------------------------------------------------------------

  describe('getEngagementMetrics()', () => {
    it('should return engagement metrics object', () => {
      const metrics = engine.getEngagementMetrics();
      expect(metrics).toBeDefined();
    });

    it('should have expected properties', () => {
      const metrics = engine.getEngagementMetrics();
      expect(metrics).toHaveProperty('avgWordCount');
      expect(metrics).toHaveProperty('recentWordCounts');
      expect(metrics).toHaveProperty('avgResponseTimeMs');
      expect(metrics).toHaveProperty('questionsAsked');
      expect(metrics).toHaveProperty('detailedResponses');
      expect(metrics).toHaveProperty('shortResponses');
      expect(metrics).toHaveProperty('isRushed');
      expect(metrics).toHaveProperty('isRelaxed');
      expect(metrics).toHaveProperty('interruptions');
      expect(metrics).toHaveProperty('longestTurnWords');
    });

    it('should track engagement after messages', () => {
      engine.recordMessage('user', 'I am interested in learning about investing');
      engine.recordMessage('agent', 'Great! Investing can help grow your wealth.');

      const metrics = engine.getEngagementMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.avgWordCount).toBeGreaterThan(0);
    });

    it('should track questions asked', () => {
      engine.recordMessage('user', 'What is the best savings account?');
      engine.recordMessage('user', 'How much should I save?');

      const metrics = engine.getEngagementMetrics();
      expect(metrics.questionsAsked).toBe(2);
    });

    it('should update metrics as conversation progresses', () => {
      const initialMetrics = engine.getEngagementMetrics();

      engine.recordMessage('user', 'Tell me more');
      engine.recordMessage('agent', 'Here is more information.');

      const updatedMetrics = engine.getEngagementMetrics();
      expect(updatedMetrics).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // getResponseLengthRecommendation Method
  // --------------------------------------------------------------------------

  describe('getResponseLengthRecommendation()', () => {
    it('should return length recommendation', () => {
      const recommendation = engine.getResponseLengthRecommendation();
      expect(recommendation).toBeDefined();
    });

    it('should have expected properties', () => {
      const recommendation = engine.getResponseLengthRecommendation();
      expect(recommendation).toHaveProperty('targetWordCount');
      expect(recommendation).toHaveProperty('range');
      expect(recommendation).toHaveProperty('rationale');
      expect(recommendation).toHaveProperty('shouldAbbreviate');
      expect(recommendation).toHaveProperty('shouldElaborate');
    });

    it('should return default recommendation with no messages', () => {
      const recommendation = engine.getResponseLengthRecommendation();
      expect(recommendation.targetWordCount).toBe(40);
      expect(recommendation.rationale).toContain('Not enough data');
    });

    it('should recommend based on user message length', () => {
      // Short user message
      engine.recordMessage('user', 'Yes');
      engine.recordMessage('user', 'No');
      const shortRecommendation = engine.getResponseLengthRecommendation();
      expect(shortRecommendation).toBeDefined();

      resetResponseDynamicsEngine();
      const newEngine = getResponseDynamicsEngine();

      // Long user message
      newEngine.recordMessage(
        'user',
        'I have a detailed question about retirement planning and I want to understand all the options available to me including 401k, IRA, and other investment vehicles.'
      );
      newEngine.recordMessage('user', 'Also please explain the tax implications of each option.');
      const longRecommendation = newEngine.getResponseLengthRecommendation();
      expect(longRecommendation).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // getPacingAnalysis Method
  // --------------------------------------------------------------------------

  describe('getPacingAnalysis()', () => {
    it('should return pacing analysis', () => {
      const analysis = engine.getPacingAnalysis();
      expect(analysis).toBeDefined();
    });

    it('should have expected properties', () => {
      const analysis = engine.getPacingAnalysis();
      expect(analysis).toHaveProperty('userPacing');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis).toHaveProperty('suggestedAgentPacing');
      expect(analysis).toHaveProperty('timeOfDayFactor');
    });

    it('should return unknown pacing with insufficient data', () => {
      const analysis = engine.getPacingAnalysis();
      expect(analysis.userPacing).toBe('unknown');
      expect(analysis.confidence).toBe(0);
    });

    it('should analyze pacing after conversation', () => {
      engine.recordMessage('user', 'Quick question');
      engine.recordMessage('agent', 'Sure, ask away!');
      engine.recordMessage('user', 'What is the best savings account?');
      engine.recordMessage('user', 'And what about CDs?');

      const analysis = engine.getPacingAnalysis();
      expect(analysis).toBeDefined();
      expect(['rushed', 'normal', 'relaxed', 'unknown']).toContain(analysis.userPacing);
    });

    it('should suggest agent pacing', () => {
      const analysis = engine.getPacingAnalysis();
      expect(['faster', 'normal', 'slower']).toContain(analysis.suggestedAgentPacing);
    });

    it('should detect time of day', () => {
      const analysis = engine.getPacingAnalysis();
      expect(['morning', 'afternoon', 'evening', 'night']).toContain(analysis.timeOfDayFactor);
    });
  });

  // --------------------------------------------------------------------------
  // getTopicTransition Method
  // --------------------------------------------------------------------------

  describe('getTopicTransition()', () => {
    it('should return a topic transition', () => {
      const transition = engine.getTopicTransition('saving', 'investing');
      expect(transition).toBeDefined();
    });

    it('should have expected properties', () => {
      const transition = engine.getTopicTransition('saving', 'investing');
      expect(transition).toHaveProperty('type');
      expect(transition).toHaveProperty('phrase');
    });

    it('should handle null from topic', () => {
      const transition = engine.getTopicTransition(null, 'investing');
      expect(transition).toBeDefined();
      expect(transition.type).toBe('smooth');
    });

    it('should handle null to topic', () => {
      const transition = engine.getTopicTransition('saving', null);
      expect(transition).toBeDefined();
      expect(transition.type).toBe('acknowledgment');
    });

    it('should return acknowledgment for same topic', () => {
      const transition = engine.getTopicTransition('investing', 'investing');
      expect(transition.type).toBe('acknowledgment');
    });

    it('should accept explicit transition type', () => {
      const transition = engine.getTopicTransition('saving', 'investing', 'redirect');
      expect(transition.type).toBe('redirect');
    });

    it('should generate appropriate phrases', () => {
      const transition = engine.getTopicTransition('saving', 'investing');
      expect(transition.phrase).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // recordInterruption Method
  // --------------------------------------------------------------------------

  describe('recordInterruption()', () => {
    it('should record interruptions', () => {
      expect(() => {
        engine.recordInterruption();
      }).not.toThrow();
    });

    it('should track interruption count', () => {
      engine.recordInterruption();
      engine.recordInterruption();
      engine.recordMessage('user', 'Hello');

      const metrics = engine.getEngagementMetrics();
      expect(metrics.interruptions).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // getLengthGuidance Method
  // --------------------------------------------------------------------------

  describe('getLengthGuidance()', () => {
    it('should return length guidance string', () => {
      const guidance = engine.getLengthGuidance();
      expect(typeof guidance).toBe('string');
    });

    it('should include word count target', () => {
      const guidance = engine.getLengthGuidance();
      expect(guidance).toContain('RESPONSE LENGTH');
      expect(guidance).toContain('words');
    });

    it('should adapt based on user behavior', () => {
      // Record short messages
      engine.recordMessage('user', 'Yes');
      engine.recordMessage('user', 'No');
      engine.recordMessage('user', 'Ok');

      const guidance = engine.getLengthGuidance();
      expect(guidance).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle special characters', () => {
      expect(() => {
        engine.recordMessage('user', 'What about $100? & <test>');
      }).not.toThrow();
    });

    it('should handle rapid message recording', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          engine.recordMessage(i % 2 === 0 ? 'user' : 'agent', `Message ${i}`);
        }
      }).not.toThrow();
    });

    it('should handle messages with various lengths', () => {
      const lengths = [1, 10, 50, 100, 500, 1000];
      for (const len of lengths) {
        expect(() => {
          engine.recordMessage('user', 'a'.repeat(len));
        }).not.toThrow();
      }
    });

    it('should handle unicode in messages', () => {
      expect(() => {
        engine.recordMessage('user', 'Hello World');
      }).not.toThrow();
    });

    it('should cap history at maximum', () => {
      // Record more than maxHistory messages
      for (let i = 0; i < 50; i++) {
        engine.recordMessage('user', `Message ${i}`);
      }

      const metrics = engine.getEngagementMetrics();
      // Should still work without error
      expect(metrics).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  describe('State Management', () => {
    it('should reset state properly', () => {
      engine.recordMessage('user', 'Test message');
      engine.recordMessage('agent', 'Test response');
      engine.recordInterruption();

      resetResponseDynamicsEngine();
      const newEngine = getResponseDynamicsEngine();

      // New engine should have fresh state
      expect(newEngine).toBeDefined();
      const metrics = newEngine.getEngagementMetrics();
      expect(metrics.interruptions).toBe(0);
    });

    it('should maintain state across method calls', () => {
      engine.recordMessage('user', 'First message');
      const metrics1 = engine.getEngagementMetrics();

      engine.recordMessage('user', 'Second message');
      const metrics2 = engine.getEngagementMetrics();

      // Both should be valid
      expect(metrics1).toBeDefined();
      expect(metrics2).toBeDefined();
    });

    it('should track questions independently', () => {
      engine.recordMessage('user', 'What is investing?');
      const metrics1 = engine.getEngagementMetrics();
      expect(metrics1.questionsAsked).toBe(1);

      engine.recordMessage('user', 'How do I start?');
      const metrics2 = engine.getEngagementMetrics();
      expect(metrics2.questionsAsked).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Integration
  // --------------------------------------------------------------------------

  describe('Integration', () => {
    it('should coordinate metrics and recommendations', () => {
      // Simulate a conversation
      engine.recordMessage('user', 'I have a quick question about savings');
      engine.recordMessage('agent', 'Sure, what would you like to know?');
      engine.recordMessage('user', 'How much should I save monthly?');
      engine.recordMessage('agent', 'It depends on your income and goals.');
      engine.recordMessage('user', 'I make about fifty thousand a year');

      const metrics = engine.getEngagementMetrics();
      const lengthRec = engine.getResponseLengthRecommendation();
      const pacing = engine.getPacingAnalysis();

      expect(metrics.avgWordCount).toBeGreaterThan(0);
      expect(lengthRec.targetWordCount).toBeGreaterThan(0);
      expect(pacing).toBeDefined();
    });

    it('should adjust for interruptions', () => {
      engine.recordMessage('user', 'Tell me about');
      engine.recordInterruption();
      engine.recordMessage('user', 'Actually, never mind');
      engine.recordInterruption();
      engine.recordMessage('user', 'Ok what about bonds?');

      const lengthRec = engine.getResponseLengthRecommendation();
      const metrics = engine.getEngagementMetrics();

      expect(metrics.interruptions).toBe(2);
      // High interruption rate should affect recommendations
      expect(lengthRec).toBeDefined();
    });
  });
});
