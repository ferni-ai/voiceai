import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetLatestSynthesis, mockGenerate, mockGetLatestTrajectory, mockGenerateTrajectory } = vi.hoisted(() => ({
  mockGetLatestSynthesis: vi.fn(),
  mockGenerate: vi.fn(),
  mockGetLatestTrajectory: vi.fn(),
  mockGenerateTrajectory: vi.fn(),
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

vi.mock('../../../../services/superhuman/cross-domain-synthesis.js', () => ({
  crossDomainSynthesis: { getLatest: mockGetLatestSynthesis, generate: mockGenerate },
}));

vi.mock('../../../../services/superhuman/life-trajectory-engine.js', () => ({
  lifeTrajectoryEngine: { getLatest: mockGetLatestTrajectory, generate: mockGenerateTrajectory },
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

const MOCK_SYNTHESIS = {
  generatedAt: new Date().toISOString(),
  domains: [
    { name: 'health', currentScore: 75, trend: 'improving' },
    { name: 'career', currentScore: 60, trend: 'steady' },
  ],
  insights: [{ title: 'Sleep-productivity link', description: 'Better sleep correlates with output', ferniInsight: 'Your sleep is powering your best work', confidence: 0.9 }],
  riskAlerts: [{ riskLevel: 'high', title: 'Burnout risk', description: 'Working too many late nights' }],
  opportunities: [{ title: 'Exercise momentum', description: 'Your gym streak is building' }],
};

const MOCK_TRAJECTORY = {
  currentChapter: { title: 'Career Pivot', description: 'Transitioning into a new role' },
  lifeScore: { overall: 72, health: 80, career: 55, relationships: 75, growth: 70, meaning: 65 },
  projectedOutcomes: { realistic: { description: 'Steady progress with some volatility' } },
  suggestedPivots: [{ title: 'Upskill in AI', reasoning: 'High-growth field aligned with interests' }],
};

describe('Life Synthesis Tools', () => {
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
      expect(ids).toContain('synthesizeMyLife');
      expect(ids).toContain('getLifeTrajectory');
      expect(ids).toContain('getLifeScore');
    });
  });

  describe('synthesizeMyLife', () => {
    it('should return synthesis with domains, insights, risks, and opportunities', async () => {
      mockGetLatestSynthesis.mockResolvedValue(MOCK_SYNTHESIS);
      const tool = toolDefs.find((t) => t.id === 'synthesizeMyLife')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('health: 75/100');
      expect(result).toContain('career: 60/100');
      expect(result).toContain('Sleep-productivity link');
      expect(result).toContain('Burnout risk');
      expect(result).toContain('Exercise momentum');
    });

    it('should generate fresh synthesis when stale', async () => {
      mockGetLatestSynthesis.mockResolvedValue({ ...MOCK_SYNTHESIS, generatedAt: new Date(Date.now() - 8 * 86400000).toISOString() });
      mockGenerate.mockResolvedValue(MOCK_SYNTHESIS);
      const tool = toolDefs.find((t) => t.id === 'synthesizeMyLife')!.create(ctx);
      await tool.execute({});
      expect(mockGenerate).toHaveBeenCalledWith('test-user-123');
    });

    it('should handle errors gracefully', async () => {
      mockGetLatestSynthesis.mockRejectedValue(new Error('DB error'));
      const tool = toolDefs.find((t) => t.id === 'synthesizeMyLife')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("couldn't pull together your life synthesis");
    });
  });

  describe('getLifeTrajectory', () => {
    it('should return trajectory with chapter, score, and pivots', async () => {
      mockGetLatestTrajectory.mockResolvedValue(MOCK_TRAJECTORY);
      const tool = toolDefs.find((t) => t.id === 'getLifeTrajectory')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Career Pivot');
      expect(result).toContain('72/100');
      expect(result).toContain('career (55)');
      expect(result).toContain('Upskill in AI');
    });

    it('should generate trajectory when none exists', async () => {
      mockGetLatestTrajectory.mockResolvedValue(null);
      mockGenerateTrajectory.mockResolvedValue(MOCK_TRAJECTORY);
      const tool = toolDefs.find((t) => t.id === 'getLifeTrajectory')!.create(ctx);
      const result = await tool.execute({});
      expect(mockGenerateTrajectory).toHaveBeenCalledWith('test-user-123');
      expect(result).toContain('Career Pivot');
    });

    it('should handle errors gracefully', async () => {
      mockGetLatestTrajectory.mockRejectedValue(new Error('timeout'));
      const tool = toolDefs.find((t) => t.id === 'getLifeTrajectory')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("couldn't generate your life trajectory");
    });
  });

  describe('getLifeScore', () => {
    it('should return life score across all dimensions', async () => {
      mockGetLatestTrajectory.mockResolvedValue(MOCK_TRAJECTORY);
      const tool = toolDefs.find((t) => t.id === 'getLifeScore')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('72/100');
      expect(result).toContain('Health: 80/100');
      expect(result).toContain('Career: 55/100');
      expect(result).toContain('Relationships: 75/100');
    });

    it('should return not-enough-data message when no trajectory exists', async () => {
      mockGetLatestTrajectory.mockResolvedValue(null);
      const tool = toolDefs.find((t) => t.id === 'getLifeScore')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("don't have enough data");
    });

    it('should handle errors gracefully', async () => {
      mockGetLatestTrajectory.mockRejectedValue(new Error('err'));
      const tool = toolDefs.find((t) => t.id === 'getLifeScore')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("Couldn't pull up your life score");
    });
  });
});
