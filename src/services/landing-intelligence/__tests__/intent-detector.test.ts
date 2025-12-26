/**
 * Intent Detector Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted for mock that needs to be referenced
const { mockGenerateJSON } = vi.hoisted(() => ({
  mockGenerateJSON: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../gemini-client.js', () => ({
  generateJSON: mockGenerateJSON,
}));

import {
  detectVisitorIntent,
  aggregateIntentData,
  type BehaviorSignals,
  type VisitorIntent,
  type IntentDetectionResult,
} from '../intent-detector.js';

describe('IntentDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateJSON.mockResolvedValue(null); // Default to heuristic fallback
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createSignals(overrides: Partial<BehaviorSignals> = {}): BehaviorSignals {
    return {
      scrollPattern: 'reading',
      sectionsViewed: ['hero', 'pricing'],
      timePerSection: { hero: 10, pricing: 20 },
      scrollDepth: 50,
      timeOnPage: 60,
      clickCount: 2,
      sectionsHovered: ['team'],
      mousePattern: 'calm',
      ctaHoverWithoutClick: false,
      scrollReversals: 1,
      device: 'desktop',
      referrerType: 'search',
      ...overrides,
    };
  }

  describe('detectVisitorIntent', () => {
    it('should return intent detection result', async () => {
      const signals = createSignals();
      const result = await detectVisitorIntent(signals);

      expect(result.intent).toBeDefined();
      expect(result.signals).toBe(signals);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should use AI result when available', async () => {
      const aiIntent: VisitorIntent = {
        primaryConcern: 'anxiety',
        buyingStage: 'consideration',
        confidence: 0.85,
        emotionalState: 'hopeful',
        recommendedContent: ['two-am-demo'],
        suggestedAction: 'Show 2am presence demo',
        reasoning: 'User engaged with late night content',
      };
      mockGenerateJSON.mockResolvedValue(aiIntent);

      const result = await detectVisitorIntent(createSignals());

      expect(result.intent.primaryConcern).toBe('anxiety');
      expect(result.intent.confidence).toBe(0.85);
      expect(result.intent.reasoning).toBe('User engaged with late night content');
    });

    it('should fallback to heuristics when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('AI error'));

      const result = await detectVisitorIntent(createSignals());

      expect(result.intent).toBeDefined();
      expect(result.intent.reasoning).toBe('Heuristic analysis based on behavior patterns');
    });

    it('should fallback to heuristics when AI returns null', async () => {
      mockGenerateJSON.mockResolvedValue(null);

      const result = await detectVisitorIntent(createSignals());

      expect(result.intent.reasoning).toBe('Heuristic analysis based on behavior patterns');
    });
  });

  describe('Heuristic Analysis - Buying Stage', () => {
    it('should detect awareness stage for short visits', async () => {
      const signals = createSignals({ timeOnPage: 5 });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.buyingStage).toBe('awareness');
    });

    it('should detect decision stage for deep engagement', async () => {
      const signals = createSignals({
        scrollDepth: 80,
        timeOnPage: 120,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.buyingStage).toBe('decision');
    });

    it('should detect skeptical stage for CTA hover without click', async () => {
      const signals = createSignals({ ctaHoverWithoutClick: true });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.buyingStage).toBe('skeptical');
    });

    it('should detect skeptical stage for high scroll reversals', async () => {
      const signals = createSignals({ scrollReversals: 5 });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.buyingStage).toBe('skeptical');
    });

    it('should default to consideration stage', async () => {
      const signals = createSignals({
        timeOnPage: 30,
        scrollDepth: 40,
        ctaHoverWithoutClick: false,
        scrollReversals: 1,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.buyingStage).toBe('consideration');
    });
  });

  describe('Heuristic Analysis - Emotional State', () => {
    it('should detect anxious state from erratic mouse', async () => {
      const signals = createSignals({ mousePattern: 'erratic' });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.emotionalState).toBe('anxious');
    });

    it('should detect anxious state from bouncing scroll', async () => {
      const signals = createSignals({ scrollPattern: 'bouncing' });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.emotionalState).toBe('anxious');
    });

    it('should detect hopeful state from engaged reading', async () => {
      const signals = createSignals({
        scrollPattern: 'reading',
        timeOnPage: 180,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.emotionalState).toBe('hopeful');
    });

    it('should detect skeptical state from CTA hover without click', async () => {
      const signals = createSignals({
        ctaHoverWithoutClick: true,
        mousePattern: 'calm',
        scrollPattern: 'scanning',
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.emotionalState).toBe('skeptical');
    });
  });

  describe('Heuristic Analysis - Primary Concern', () => {
    it('should infer anxiety concern from two-am section', async () => {
      const signals = createSignals({
        timePerSection: { 'two-am': 30 },
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.primaryConcern).toBe('anxiety');
    });

    it('should infer loneliness concern from memory section', async () => {
      const signals = createSignals({
        timePerSection: { memory: 25 },
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.primaryConcern).toBe('loneliness');
    });

    it('should infer curiosity concern from team section', async () => {
      const signals = createSignals({
        timePerSection: { team: 40 },
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.primaryConcern).toBe('curiosity');
    });

    it('should infer self-improvement concern from use-cases', async () => {
      const signals = createSignals({
        timePerSection: { 'use-cases': 35 },
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.primaryConcern).toBe('self-improvement');
    });

    it('should use most engaged section for concern', async () => {
      const signals = createSignals({
        timePerSection: { hero: 5, 'two-am': 30, pricing: 10 },
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.primaryConcern).toBe('anxiety'); // two-am has most time
    });
  });

  describe('Default Content Recommendations', () => {
    it('should recommend awareness content for awareness stage', async () => {
      const signals = createSignals({ timeOnPage: 5 });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.recommendedContent).toContain('two-am-demo');
      expect(result.intent.recommendedContent).toContain('memory-showcase');
    });

    it('should recommend consideration content for consideration stage', async () => {
      const signals = createSignals({
        timeOnPage: 30,
        scrollDepth: 40,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.recommendedContent).toContain('team-intro');
    });

    it('should recommend decision content for decision stage', async () => {
      const signals = createSignals({
        scrollDepth: 85,
        timeOnPage: 150,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.recommendedContent).toContain('pricing-friendly');
      expect(result.intent.recommendedContent).toContain('proof-table');
    });

    it('should recommend skeptical content for skeptical stage', async () => {
      const signals = createSignals({
        ctaHoverWithoutClick: true,
      });
      const result = await detectVisitorIntent(signals);

      expect(result.intent.recommendedContent).toContain('proof-table');
      expect(result.intent.recommendedContent).toContain('faq-expanded');
    });
  });

  describe('aggregateIntentData', () => {
    const createResult = (
      concern: VisitorIntent['primaryConcern'],
      stage: VisitorIntent['buyingStage'],
      confidence: number,
      content: string[]
    ): IntentDetectionResult => ({
      intent: {
        primaryConcern: concern,
        buyingStage: stage,
        confidence,
        emotionalState: 'calm',
        recommendedContent: content,
        suggestedAction: 'test',
        reasoning: 'test',
      },
      signals: createSignals(),
      timestamp: new Date(),
    });

    it('should aggregate empty array', () => {
      const aggregated = aggregateIntentData([]);

      expect(aggregated.totalVisitors).toBe(0);
      expect(aggregated.averageConfidence).toBe(0);
    });

    it('should count total visitors', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.8, []),
        createResult('loneliness', 'consideration', 0.7, []),
        createResult('anxiety', 'decision', 0.9, []),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.totalVisitors).toBe(3);
    });

    it('should calculate concern distribution', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.8, []),
        createResult('anxiety', 'consideration', 0.7, []),
        createResult('loneliness', 'decision', 0.9, []),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.concernDistribution['anxiety']).toBe(2);
      expect(aggregated.concernDistribution['loneliness']).toBe(1);
    });

    it('should calculate stage distribution', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.8, []),
        createResult('anxiety', 'awareness', 0.7, []),
        createResult('loneliness', 'decision', 0.9, []),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.stageDistribution['awareness']).toBe(2);
      expect(aggregated.stageDistribution['decision']).toBe(1);
    });

    it('should calculate average confidence', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.6, []),
        createResult('anxiety', 'awareness', 0.8, []),
        createResult('loneliness', 'decision', 1.0, []),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.averageConfidence).toBeCloseTo(0.8);
    });

    it('should find top recommended content', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.8, ['two-am-demo', 'pricing-friendly']),
        createResult('anxiety', 'awareness', 0.7, ['two-am-demo', 'team-intro']),
        createResult('loneliness', 'decision', 0.9, ['two-am-demo']),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.topRecommendedContent[0]).toBe('two-am-demo');
    });

    it('should limit top content to 5 items', () => {
      const results = [
        createResult('anxiety', 'awareness', 0.8, ['a', 'b', 'c', 'd', 'e', 'f', 'g']),
      ];

      const aggregated = aggregateIntentData(results);

      expect(aggregated.topRecommendedContent.length).toBeLessThanOrEqual(5);
    });
  });
});
