import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssessRisk, mockRecordReading, mockLoadInteractions, mockAnalyze, mockGetRecommendation } = vi.hoisted(() => ({
  mockAssessRisk: vi.fn(),
  mockRecordReading: vi.fn(),
  mockLoadInteractions: vi.fn(),
  mockAnalyze: vi.fn(),
  mockGetRecommendation: vi.fn(),
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

vi.mock('../../../../services/superhuman/capacity-guardian.js', () => ({
  capacityGuardian: { assessRisk: mockAssessRisk, recordReading: mockRecordReading },
}));

vi.mock('../../../../services/superhuman/energy-wave-mapping.js', () => ({
  energyWaveMapping: { load: mockLoadInteractions, analyze: mockAnalyze, getRecommendation: mockGetRecommendation },
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

describe('Capacity Monitoring Tools', () => {
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
      expect(ids).toContain('checkBurnoutRisk');
      expect(ids).toContain('logEnergy');
      expect(ids).toContain('checkEnergyPatterns');
    });
  });

  describe('checkBurnoutRisk', () => {
    it('should return burnout assessment with factors and recommendations', async () => {
      mockAssessRisk.mockResolvedValue({
        risk: 'moderate', riskScore: 55,
        factors: [{ factor: 'Sleep deficit', weight: 0.8, description: 'Averaging 5 hours' }],
        recommendations: ['Take a rest day', 'Set a sleep alarm'],
      });
      const tool = toolDefs.find((t) => t.id === 'checkBurnoutRisk')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('MODERATE');
      expect(result).toContain('55/100');
      expect(result).toContain('Sleep deficit');
      expect(result).toContain('Take a rest day');
    });

    it('should include urgency message for high risk', async () => {
      mockAssessRisk.mockResolvedValue({ risk: 'high', riskScore: 85, factors: [], recommendations: [] });
      const tool = toolDefs.find((t) => t.id === 'checkBurnoutRisk')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('wellbeing matters');
    });

    it('should handle errors gracefully', async () => {
      mockAssessRisk.mockRejectedValue(new Error('service down'));
      const tool = toolDefs.find((t) => t.id === 'checkBurnoutRisk')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('trouble checking your burnout risk');
    });
  });

  describe('logEnergy', () => {
    it('should log energy and return level-specific message', async () => {
      mockRecordReading.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'logEnergy')!.create(ctx);
      const result = await tool.execute({ energyLevel: 'high' });
      expect(result).toContain('energized');
      expect(mockRecordReading).toHaveBeenCalledWith('test-user-123', {
        energyLevel: 'high', energyScore: 90, detectedFrom: ['explicit'], indicators: [],
      });
    });

    it('should pass factors when provided', async () => {
      mockRecordReading.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'logEnergy')!.create(ctx);
      await tool.execute({ energyLevel: 'low', factors: ['poor sleep'] });
      expect(mockRecordReading).toHaveBeenCalledWith('test-user-123', expect.objectContaining({ indicators: ['poor sleep'] }));
    });

    it('should handle errors gracefully', async () => {
      mockRecordReading.mockRejectedValue(new Error('write failed'));
      const tool = toolDefs.find((t) => t.id === 'logEnergy')!.create(ctx);
      const result = await tool.execute({ energyLevel: 'moderate' });
      expect(result).toContain('trouble logging your energy');
    });
  });

  describe('checkEnergyPatterns', () => {
    it('should return energy patterns with peaks and recommendations', async () => {
      mockLoadInteractions.mockResolvedValue(new Array(15).fill({ ts: Date.now() }));
      mockAnalyze.mockReturnValue({
        dailyPattern: { peakHours: [10, 14], lowHours: [6] },
        weeklyPattern: { lowEnergyDays: [0], highEnergyDays: [2, 4] },
      });
      mockGetRecommendation.mockReturnValue({ betterTimes: ['10am-12pm'] });
      const tool = toolDefs.find((t) => t.id === 'checkEnergyPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('10:00');
      expect(result).toContain('14:00');
      expect(result).toContain('Sunday');
      expect(result).toContain('Tuesday');
    });

    it('should return insufficient data message when too few interactions', async () => {
      mockLoadInteractions.mockResolvedValue(new Array(5).fill({}));
      const tool = toolDefs.find((t) => t.id === 'checkEnergyPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('need more data');
      expect(result).toContain('5 interactions');
    });

    it('should handle errors gracefully', async () => {
      mockLoadInteractions.mockRejectedValue(new Error('read failed'));
      const tool = toolDefs.find((t) => t.id === 'checkEnergyPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('trouble analyzing your energy patterns');
    });
  });
});
