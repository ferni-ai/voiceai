import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadObservations, mockFindUpcoming, mockSuggestOptimalTiming } = vi.hoisted(() => ({
  mockLoadObservations: vi.fn(),
  mockFindUpcoming: vi.fn(),
  mockSuggestOptimalTiming: vi.fn(),
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

vi.mock('../../../../services/superhuman/seasonal-awareness.js', () => ({
  seasonalAwareness: { loadObservations: mockLoadObservations, findUpcoming: mockFindUpcoming },
}));

vi.mock('../../../../services/superhuman/seasonal-planning-intelligence.js', () => ({
  seasonalPlanningIntelligence: { suggestOptimalTiming: mockSuggestOptimalTiming },
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

describe('Seasonal Awareness Tools', () => {
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
      expect(ids).toContain('checkSeasonalPatterns');
      expect(ids).toContain('upcomingDates');
      expect(ids).toContain('suggestEventTiming');
    });
  });

  describe('checkSeasonalPatterns', () => {
    it('should return observations grouped by season', async () => {
      mockLoadObservations.mockResolvedValue([
        { season: 'winter', type: 'energy_dip', observation: 'Energy drops after holidays', sentiment: 'negative' },
        { season: 'summer', type: 'mood_boost', observation: 'Outdoor time lifts mood', sentiment: 'positive' },
      ]);
      const tool = toolDefs.find((t) => t.id === 'checkSeasonalPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Winter');
      expect(result).toContain('Summer');
      expect(result).toContain('Energy drops');
      expect(result).toContain('(good energy)');
      expect(result).toContain('(tough time)');
    });

    it('should return no-patterns message when empty', async () => {
      mockLoadObservations.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'checkSeasonalPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("haven't noticed seasonal patterns");
    });

    it('should handle errors gracefully', async () => {
      mockLoadObservations.mockRejectedValue(new Error('DB err'));
      const tool = toolDefs.find((t) => t.id === 'checkSeasonalPatterns')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("Couldn't pull up your seasonal patterns");
    });
  });

  describe('upcomingDates', () => {
    it('should return upcoming dates with sentiment markers', async () => {
      mockFindUpcoming.mockResolvedValue([
        { date: { name: 'Mom birthday', type: 'celebration', sentiment: 'positive' }, daysUntil: 5 },
        { date: { name: 'Dad memorial', type: 'memorial', sentiment: 'bittersweet' }, daysUntil: 12 },
      ]);
      const tool = toolDefs.find((t) => t.id === 'upcomingDates')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Mom birthday');
      expect(result).toContain('In 5 days');
      expect(result).toContain('Dad memorial');
      expect(result).toContain('(bittersweet)');
    });

    it('should return no-dates message when empty', async () => {
      mockFindUpcoming.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'upcomingDates')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('No important dates');
    });

    it('should handle errors gracefully', async () => {
      mockFindUpcoming.mockRejectedValue(new Error('fail'));
      const tool = toolDefs.find((t) => t.id === 'upcomingDates')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("Couldn't check upcoming dates");
    });
  });

  describe('suggestEventTiming', () => {
    it('should return timing recommendations with scores and reasons', async () => {
      mockSuggestOptimalTiming.mockResolvedValue([{
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
        score: 85,
        reasons: ['High energy period', 'Good weather'],
        warnings: ['Busy season at work'],
        culturalNotes: ['Summer solstice nearby'],
      }]);
      const tool = toolDefs.find((t) => t.id === 'suggestEventTiming')!.create(ctx);
      const result = await tool.execute({ eventType: 'vacation' });
      expect(result).toContain('vacation');
      expect(result).toContain('85/100');
      expect(result).toContain('High energy period');
      expect(result).toContain('Busy season at work');
    });

    it('should return not-enough-data message when no recommendations', async () => {
      mockSuggestOptimalTiming.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'suggestEventTiming')!.create(ctx);
      const result = await tool.execute({ eventType: 'wedding' });
      expect(result).toContain("don't have enough data");
      expect(result).toContain('wedding');
    });

    it('should handle errors gracefully', async () => {
      mockSuggestOptimalTiming.mockRejectedValue(new Error('fail'));
      const tool = toolDefs.find((t) => t.id === 'suggestEventTiming')!.create(ctx);
      const result = await tool.execute({ eventType: 'party' });
      expect(result).toContain("Couldn't suggest timing");
    });
  });
});
