/**
 * Pattern Analytics Domain Tests
 *
 * Tests the "Better Than Human" analytics capabilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services BEFORE importing the module
vi.mock('../../../../services/superhuman/pattern-analytics-services.js', () => ({
  recordBlindSpot: vi.fn(),
  getBlindSpots: vi.fn().mockResolvedValue([]),
  recordCounterfactual: vi.fn(),
  getCounterfactuals: vi.fn().mockResolvedValue([]),
  recordPatternPrediction: vi.fn(),
  getPatternPredictions: vi.fn().mockResolvedValue([]),
  recordDecisionScore: vi.fn(),
  getDecisionScores: vi.fn().mockResolvedValue([]),
  recordCorrelation: vi.fn(),
  getCorrelations: vi.fn().mockResolvedValue([]),
  recordAnomaly: vi.fn(),
  getAnomalies: vi.fn().mockResolvedValue([]),
  recordInsight: vi.fn(),
  getInsights: vi.fn().mockResolvedValue([]),
}));

// Import directly from the module
import { definitions, domain } from '../index.js';

describe('pattern-analytics domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export domain as pattern-analytics', () => {
    expect(domain).toBe('pattern-analytics');
  });

  it('should have tool definitions array', () => {
    expect(Array.isArray(definitions)).toBe(true);
    expect(definitions.length).toBe(7);
  });

  it('should include all superhuman analytics tools', () => {
    const toolIds = definitions.map((t) => t.id);

    expect(toolIds).toContain('revealBlindSpot');
    expect(toolIds).toContain('simulateCounterfactual');
    expect(toolIds).toContain('predictPattern');
    expect(toolIds).toContain('scoreDecision');
    expect(toolIds).toContain('findCorrelation');
    expect(toolIds).toContain('detectAnomaly');
    expect(toolIds).toContain('archiveInsight');
  });

  it('should have all tools in pattern-analytics domain', () => {
    for (const tool of definitions) {
      expect(tool.domain).toBe('pattern-analytics');
    }
  });

  it('should have superhuman-analytics tag on all tools', () => {
    for (const tool of definitions) {
      expect(tool.tags).toContain('superhuman-analytics');
    }
  });

  describe('individual tools', () => {
    it('revealBlindSpot should have correct structure', () => {
      const tool = definitions.find((t) => t.id === 'revealBlindSpot');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('Reveal Blind Spot');
      expect(tool?.description).toContain('pattern');
    });

    it('simulateCounterfactual should have correct structure', () => {
      const tool = definitions.find((t) => t.id === 'simulateCounterfactual');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('Simulate Counterfactual');
      expect(tool?.description).toContain('what if');
    });

    it('findCorrelation should have correct structure', () => {
      const tool = definitions.find((t) => t.id === 'findCorrelation');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('Find Correlation');
      expect(tool?.description).toContain('correlation');
    });
  });
});
