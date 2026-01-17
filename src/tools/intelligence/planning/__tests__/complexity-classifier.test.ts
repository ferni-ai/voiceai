/**
 * Complexity Classifier Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ComplexityClassifier,
  getComplexityClassifier,
  resetComplexityClassifier,
  classifyComplexity,
} from '../complexity-classifier.js';
import type { RouterOutput } from '../../router/inference/types.js';

describe('ComplexityClassifier', () => {
  let classifier: ComplexityClassifier;

  beforeEach(() => {
    resetComplexityClassifier();
    classifier = new ComplexityClassifier();
  });

  describe('classify', () => {
    it('should classify simple queries with high router confidence', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.95, rank: 1 }],
        topConfidence: 0.95,
        skipLLM: true,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const result = classifier.classify({ query: 'weather', routerOutput });

      expect(result.complexity).toBe('simple');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.suggestedApproach).toBe('direct');
      expect(result.estimatedTools).toBe(1);
    });

    it('should classify medium complexity queries', () => {
      const routerOutput: RouterOutput = {
        predictions: [
          { toolId: 'calendar_list', confidence: 0.7, rank: 1 },
          { toolId: 'tasks_list', confidence: 0.65, rank: 2 },
        ],
        topConfidence: 0.7,
        skipLLM: false,
        latencyMs: 15,
        modelVersion: 'test',
      };

      const result = classifier.classify({
        query: 'what do I have scheduled today',
        routerOutput,
      });

      expect(result.complexity).toBe('medium');
      expect(result.suggestedApproach).toBe('sequence');
    });

    it('should classify complex queries with planning keywords', () => {
      const result = classifier.classify({
        query:
          'help me think through and compare different options for my morning routine strategy',
      });

      expect(result.complexity).toBe('complex');
      expect(result.suggestedApproach).toBe('mcts');
      expect(result.estimatedTools).toBeGreaterThanOrEqual(3);
    });

    it('should detect multi-step queries', () => {
      const result = classifier.classify({
        query: 'first check the weather then look at my calendar and also play some music',
      });

      expect(['medium', 'complex']).toContain(result.complexity);
      expect(result.estimatedTools).toBeGreaterThanOrEqual(2);
    });

    it('should consider query length', () => {
      const shortResult = classifier.classify({ query: 'weather' });
      const longResult = classifier.classify({
        query:
          'I want you to help me plan out my entire week including reviewing all my goals and checking on my habits and looking at my calendar and making sure I have time for exercise and also checking if there are any important events coming up that I need to prepare for',
      });

      expect(longResult.complexity).not.toBe('simple');
      expect(longResult.estimatedTools).toBeGreaterThan(shortResult.estimatedTools);
    });

    it('should detect multiple questions', () => {
      const result = classifier.classify({
        query: 'What is the weather? What do I have today? What are my goals?',
      });

      expect(['medium', 'complex']).toContain(result.complexity);
      expect(result.estimatedTools).toBeGreaterThanOrEqual(3);
    });

    it('should consider session history', () => {
      const result = classifier.classify({
        query: 'what else should I do',
        previousToolCount: 5,
      });

      expect(result.complexity).not.toBe('simple');
      expect(result.reasons.some((r) => r.includes('Active session'))).toBe(true);
    });
  });

  describe('isSimple', () => {
    it('should return true for simple tasks', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather', confidence: 0.95, rank: 1 }],
        topConfidence: 0.95,
        skipLLM: true,
        latencyMs: 5,
        modelVersion: 'test',
      };

      expect(classifier.isSimple({ query: 'weather', routerOutput })).toBe(true);
    });

    it('should return false for complex tasks', () => {
      expect(
        classifier.isSimple({
          query: 'plan my entire week with comprehensive analysis',
        })
      ).toBe(false);
    });
  });

  describe('needsMCTS', () => {
    it('should return true for complex planning queries', () => {
      expect(
        classifier.needsMCTS({
          query: 'help me think through multiple different options and compare their trade-offs',
        })
      ).toBe(true);
    });

    it('should return false for simple queries', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather', confidence: 0.9, rank: 1 }],
        topConfidence: 0.9,
        skipLLM: true,
        latencyMs: 5,
        modelVersion: 'test',
      };

      expect(classifier.needsMCTS({ query: 'weather', routerOutput })).toBe(false);
    });
  });

  describe('classifyFromRouter', () => {
    it('should return simple for high confidence + skipLLM', () => {
      const routerOutput: RouterOutput = {
        predictions: [],
        topConfidence: 0.95,
        skipLLM: true,
        latencyMs: 5,
        modelVersion: 'test',
      };

      expect(classifier.classifyFromRouter(routerOutput)).toBe('simple');
    });

    it('should return complex for low confidence', () => {
      const routerOutput: RouterOutput = {
        predictions: [],
        topConfidence: 0.3,
        skipLLM: false,
        latencyMs: 10,
        modelVersion: 'test',
      };

      expect(classifier.classifyFromRouter(routerOutput)).toBe('complex');
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getComplexityClassifier();
      const b = getComplexityClassifier();
      expect(a).toBe(b);
    });

    it('should reset instance', () => {
      const a = getComplexityClassifier();
      resetComplexityClassifier();
      const b = getComplexityClassifier();
      expect(a).not.toBe(b);
    });
  });

  describe('convenience function', () => {
    it('should work without router output', () => {
      const result = classifyComplexity('check the weather');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('suggestedApproach');
    });
  });
});
