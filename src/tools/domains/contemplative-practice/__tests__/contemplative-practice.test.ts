import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssessMindfulness, mockRecommendPractices, mockGetDefusion, mockRecordPractice } = vi.hoisted(() => ({
  mockAssessMindfulness: vi.fn(),
  mockRecommendPractices: vi.fn(),
  mockGetDefusion: vi.fn(),
  mockRecordPractice: vi.fn(),
}));

vi.mock('../../../../utils/safe-logger.js', () => {
  const noop = () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  });
  return { getLogger: noop, createLogger: noop, isFullLoggingEnabled: () => false, truncateForLog: (t: string) => t, logPreview: () => '', serializeError: (e: unknown) => String(e), default: noop };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { description: string; parameters: unknown; execute: unknown }) => ({
      description: config.description, parameters: config.parameters, execute: config.execute,
    })),
  },
}));

vi.mock('../../../../services/superhuman/contemplative-intelligence.js', () => ({
  contemplativeIntelligence: {
    assessMindfulness: mockAssessMindfulness,
    recommendMindfulnessPractices: mockRecommendPractices,
    getDefusionTechnique: mockGetDefusion,
    recordPractice: mockRecordPractice,
  },
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: { has: () => false, get: () => { throw new Error('Not available'); }, getOptional: () => undefined },
  };
}

describe('Contemplative Practice Tools', () => {
  let toolDefs: ToolDefinition[];
  let ctx: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefs = await getToolDefinitions();
    ctx = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all 3 tool definitions', () => {
      expect(toolDefs).toHaveLength(3);
      const ids = toolDefs.map((t) => t.id);
      expect(ids).toContain('assessMindfulness');
      expect(ids).toContain('getDefusionTechnique');
      expect(ids).toContain('recordContemplativePractice');
    });
  });

  describe('assessMindfulness', () => {
    it('should return mindfulness assessment with recommendations', async () => {
      mockAssessMindfulness.mockReturnValue({
        overallScore: 3.5, primaryStrength: 'emotional_awareness', areaForGrowth: 'non_reactivity',
      });
      mockRecommendPractices.mockReturnValue({
        primaryRecommendation: { practice: 'Body scan meditation', rationale: 'Builds non-reactivity', duration: '10 minutes' },
        warning: undefined,
        secondaryRecommendations: [{ practice: 'Walking meditation', rationale: 'Integrates presence into movement' }],
      });
      const tool = toolDefs.find((t) => t.id === 'assessMindfulness')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('3.5');
      expect(result).toContain('Emotional Awareness');
      expect(result).toContain('Non Reactivity');
      expect(result).toContain('Body scan meditation');
      expect(result).toContain('Walking meditation');
    });

    it('should include warning when present', async () => {
      mockAssessMindfulness.mockReturnValue({ overallScore: 1.5, primaryStrength: 'observing', areaForGrowth: 'describing' });
      mockRecommendPractices.mockReturnValue({
        primaryRecommendation: { practice: 'Guided meditation', rationale: 'Foundation building', duration: '5 minutes' },
        warning: 'Start gently — your scores suggest high stress.',
        secondaryRecommendations: [],
      });
      const tool = toolDefs.find((t) => t.id === 'assessMindfulness')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Start gently');
    });

    it('should handle errors gracefully', async () => {
      mockAssessMindfulness.mockImplementation(() => { throw new Error('fail'); });
      const tool = toolDefs.find((t) => t.id === 'assessMindfulness')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("couldn't complete the mindfulness assessment");
    });
  });

  describe('getDefusionTechnique', () => {
    it('should return a defusion technique with instructions', async () => {
      mockGetDefusion.mockReturnValue({
        technique: 'Leaves on a Stream',
        instruction: 'Place each thought on a leaf and watch it float away.',
        example: 'Notice the thought "I\'m not good enough" — place it on a leaf.',
      });
      const tool = toolDefs.find((t) => t.id === 'getDefusionTechnique')!.create(ctx);
      const result = await tool.execute({ thoughtPattern: "I'm not good enough" });
      expect(result).toContain('Leaves on a Stream');
      expect(result).toContain('leaf');
      expect(result).toContain('Acceptance and Commitment Therapy');
    });

    it('should handle errors gracefully', async () => {
      mockGetDefusion.mockImplementation(() => { throw new Error('fail'); });
      const tool = toolDefs.find((t) => t.id === 'getDefusionTechnique')!.create(ctx);
      const result = await tool.execute({ thoughtPattern: 'stuck thought' });
      expect(result).toContain("couldn't find a technique");
    });
  });

  describe('recordContemplativePractice', () => {
    it('should record practice and return quality-specific message', async () => {
      mockRecordPractice.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'recordContemplativePractice')!.create(ctx);
      const result = await tool.execute({ type: 'meditation', durationMinutes: 20, quality: 'deep' });
      expect(result).toContain('20 minutes of meditation');
      expect(result).toContain('deep practice');
      expect(mockRecordPractice).toHaveBeenCalledWith('test-user-123', { type: 'meditation', duration: 20, quality: 0.9, insights: undefined });
    });

    it('should pass insights when provided', async () => {
      mockRecordPractice.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'recordContemplativePractice')!.create(ctx);
      await tool.execute({ type: 'breathwork', durationMinutes: 10, quality: 'struggled', insights: 'Mind was racing' });
      expect(mockRecordPractice).toHaveBeenCalledWith('test-user-123', expect.objectContaining({ insights: 'Mind was racing', quality: 0.2 }));
    });

    it('should handle errors gracefully', async () => {
      mockRecordPractice.mockRejectedValue(new Error('write failed'));
      const tool = toolDefs.find((t) => t.id === 'recordContemplativePractice')!.create(ctx);
      const result = await tool.execute({ type: 'body-scan', durationMinutes: 15, quality: 'good' });
      expect(result).toContain("couldn't log that practice");
    });
  });
});
