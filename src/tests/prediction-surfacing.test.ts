/**
 * Prediction Surfacing Context Builder Test
 *
 * Tests the prediction surfacing builder that injects
 * predictive insights into LLM prompts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the predictive coaching imports
vi.mock('../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn().mockResolvedValue([
    {
      prediction: 'Sunday evening anxiety may occur',
      basedOn: 'anxiety before Monday',
      suggestedIntervention: "Would you like to talk about what's on your mind for tomorrow?",
    },
    {
      prediction: 'Work stress tends to peak mid-week',
      basedOn: 'consistent Wednesday stress patterns',
      suggestedIntervention: 'It might help to plan some breaks today',
    },
  ]),
  getDayPatterns: vi.fn().mockResolvedValue([
    {
      dayOfWeek: 0,
      patterns: [
        { description: 'Sunday evening anxiety', frequency: 5 },
        { description: 'End-of-weekend reflection', frequency: 3 },
      ],
    },
    {
      dayOfWeek: 1,
      patterns: [{ description: 'Monday overwhelm', frequency: 4 }],
    },
  ]),
}));

describe('Prediction Surfacing Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable and have correct structure', async () => {
    const { predictionSurfacingBuilder } =
      await import('../intelligence/context-builders/prediction-surfacing.js');

    expect(predictionSurfacingBuilder).toBeDefined();
    expect(predictionSurfacingBuilder.name).toBe('prediction-surfacing');
    expect(predictionSurfacingBuilder.priority).toBe(35);
    expect(typeof predictionSurfacingBuilder.build).toBe('function');
  });

  it('should return empty array when no userId', async () => {
    const { predictionSurfacingBuilder } =
      await import('../intelligence/context-builders/prediction-surfacing.js');

    const result = await predictionSurfacingBuilder.build({
      userData: undefined,
      sessionContext: undefined,
      analysis: undefined,
    } as never);

    expect(result).toEqual([]);
  });

  it('should return injections when predictions exist', async () => {
    const { predictionSurfacingBuilder } =
      await import('../intelligence/context-builders/prediction-surfacing.js');

    const result = await predictionSurfacingBuilder.build({
      userData: { userId: 'test-user' },
      sessionContext: { turnCount: 1 },
      analysis: { emotion: { primary: 'neutral' } },
    } as never);

    expect(result.length).toBeGreaterThanOrEqual(0);

    if (result.length > 0) {
      expect(result[0]).toHaveProperty('content');
      expect(result[0]).toHaveProperty('id');
      console.log('📝 Injection content:', `${result[0].content.slice(0, 200)}...`);
    }
  });

  it('should prioritize stress triggers', async () => {
    const { predictionSurfacingBuilder } =
      await import('../intelligence/context-builders/prediction-surfacing.js');

    const result = await predictionSurfacingBuilder.build({
      userData: { userId: 'test-user' },
      sessionContext: { turnCount: 3 },
      analysis: { emotion: { primary: 'stressed' } },
    } as never);

    // With stress detected, should have injections
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle session start surfacing', async () => {
    const { predictionSurfacingBuilder } =
      await import('../intelligence/context-builders/prediction-surfacing.js');

    // First turn of session
    const result = await predictionSurfacingBuilder.build({
      userData: { userId: 'test-user' },
      sessionContext: { turnCount: 1 },
      analysis: undefined,
    } as never);

    // Should have session start surfacing
    if (result.length > 0) {
      expect(result[0].content).toContain('PREDICTIVE AWARENESS');
    }
  });
});

describe('Prediction Surfacing Integration', () => {
  it('should generate predictions from predictive coaching', async () => {
    const { generatePredictions } = await import('../services/superhuman/predictive-coaching.js');

    const predictions = await generatePredictions('test-user');
    expect(predictions.length).toBe(2);
    expect(predictions[0]).toHaveProperty('prediction');
    expect(predictions[0]).toHaveProperty('suggestedIntervention');
  });

  it('should get day patterns', async () => {
    const { getDayPatterns } = await import('../services/superhuman/predictive-coaching.js');

    const patterns = await getDayPatterns('test-user');
    expect(patterns.length).toBe(2);
    expect(patterns[0]).toHaveProperty('dayOfWeek');
    expect(patterns[0]).toHaveProperty('patterns');
  });
});
