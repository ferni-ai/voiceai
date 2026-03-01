import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadDreams, mockFindDormant, mockRecordMention } = vi.hoisted(() => ({
  mockLoadDreams: vi.fn(),
  mockFindDormant: vi.fn(),
  mockRecordMention: vi.fn(),
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

vi.mock('../../../../services/superhuman/dream-keeper.js', () => ({
  dreamKeeper: { loadDreams: mockLoadDreams, findDormant: mockFindDormant, recordMention: mockRecordMention },
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

describe('Dream Tracking Tools', () => {
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
      expect(ids).toContain('checkDreams');
      expect(ids).toContain('findDormantDreams');
      expect(ids).toContain('recordDream');
    });
  });

  describe('checkDreams', () => {
    it('should return dream list with status and time', async () => {
      mockLoadDreams.mockResolvedValue([
        { statement: 'Write a novel', type: 'creative', status: 'alive', firstMentioned: Date.now() - 60 * 86400000 },
        { statement: 'Visit Japan', type: 'adventure', status: 'dormant', firstMentioned: Date.now() - 365 * 86400000 },
      ]);
      const tool = toolDefs.find((t) => t.id === 'checkDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Write a novel');
      expect(result).toContain('Visit Japan');
      expect(result).toContain('creative');
      expect(result).toContain('adventure');
    });

    it('should return friendly message when no dreams exist', async () => {
      mockLoadDreams.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'checkDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("haven't shared any dreams");
    });

    it('should handle errors gracefully', async () => {
      mockLoadDreams.mockRejectedValue(new Error('DB error'));
      const tool = toolDefs.find((t) => t.id === 'checkDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("couldn't retrieve your dreams");
    });
  });

  describe('findDormantDreams', () => {
    it('should return dormant dream reminders', async () => {
      mockFindDormant.mockResolvedValue([
        { dreamTitle: 'Learn guitar', daysDormant: 90, message: 'You mentioned this 3 months ago' },
      ]);
      const tool = toolDefs.find((t) => t.id === 'findDormantDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('Learn guitar');
      expect(result).toContain('90 days');
      expect(result).toContain('gentle nudge');
    });

    it('should return all-clear message when no dormant dreams', async () => {
      mockFindDormant.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'findDormantDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('alive and well');
    });

    it('should handle errors gracefully', async () => {
      mockFindDormant.mockRejectedValue(new Error('timeout'));
      const tool = toolDefs.find((t) => t.id === 'findDormantDreams')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("couldn't check on dormant dreams");
    });
  });

  describe('recordDream', () => {
    it('should record dream and return confirmation', async () => {
      mockRecordMention.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'recordDream')!.create(ctx);
      const result = await tool.execute({ statement: 'Start a podcast', type: 'creative' });
      expect(result).toContain('Start a podcast');
      expect(result).toContain("won't let you forget");
      expect(mockRecordMention).toHaveBeenCalledWith('test-user-123', {
        type: 'creative', statement: 'Start a podcast', confidence: 0.85,
      });
    });

    it('should handle errors gracefully', async () => {
      mockRecordMention.mockRejectedValue(new Error('write failed'));
      const tool = toolDefs.find((t) => t.id === 'recordDream')!.create(ctx);
      const result = await tool.execute({ statement: 'Climb Everest', type: 'adventure' });
      expect(result).toContain("couldn't save that dream");
    });
  });
});
