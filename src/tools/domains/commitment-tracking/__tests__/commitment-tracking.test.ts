import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoad, mockGetFollowUps, mockUpdateStatus } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockGetFollowUps: vi.fn(),
  mockUpdateStatus: vi.fn(),
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

vi.mock('../../../../services/superhuman/commitment-keeper.js', () => ({
  commitmentKeeper: { load: mockLoad, getFollowUps: mockGetFollowUps, updateStatus: mockUpdateStatus },
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

describe('Commitment Tracking Tools', () => {
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
      expect(ids).toContain('checkCommitments');
      expect(ids).toContain('commitmentFollowUp');
      expect(ids).toContain('updateCommitment');
    });
  });

  describe('checkCommitments', () => {
    it('should return commitments with age labels', async () => {
      mockLoad.mockResolvedValue([
        { summary: 'Exercise daily', type: 'goal', createdAt: Date.now() - 2 * 86400000 },
        { summary: 'Call mom', type: 'promise', createdAt: Date.now() },
      ]);
      const tool = toolDefs.find((t) => t.id === 'checkCommitments')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('2 active commitments');
      expect(result).toContain('Exercise daily');
      expect(result).toContain('Call mom');
    });

    it('should return friendly message when no commitments', async () => {
      mockLoad.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'checkCommitments')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain("don't have any tracked commitments");
    });

    it('should handle errors gracefully', async () => {
      mockLoad.mockRejectedValue(new Error('DB down'));
      const tool = toolDefs.find((t) => t.id === 'checkCommitments')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('trouble loading your commitments');
    });
  });

  describe('commitmentFollowUp', () => {
    it('should return follow-up messages', async () => {
      mockGetFollowUps.mockResolvedValue([
        { tone: 'gentle', urgency: 'low', message: 'How is the gym going?' },
        { tone: 'direct', urgency: 'high', message: 'You said this was important' },
      ]);
      const tool = toolDefs.find((t) => t.id === 'commitmentFollowUp')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('commitment check-ins');
      expect(result).toContain('How is the gym going?');
      expect(result).toContain('[important]');
    });

    it('should return on-track message when no follow-ups needed', async () => {
      mockGetFollowUps.mockResolvedValue([]);
      const tool = toolDefs.find((t) => t.id === 'commitmentFollowUp')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('No follow-ups needed');
    });

    it('should handle errors gracefully', async () => {
      mockGetFollowUps.mockRejectedValue(new Error('timeout'));
      const tool = toolDefs.find((t) => t.id === 'commitmentFollowUp')!.create(ctx);
      const result = await tool.execute({});
      expect(result).toContain('trouble checking on your commitments');
    });
  });

  describe('updateCommitment', () => {
    it('should return celebratory message on completion', async () => {
      mockUpdateStatus.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'updateCommitment')!.create(ctx);
      const result = await tool.execute({ commitmentId: 'c1', newStatus: 'completed' });
      expect(result).toContain('amazing');
      expect(result).toContain('completed');
    });

    it('should return supportive message on abandonment', async () => {
      mockUpdateStatus.mockResolvedValue(undefined);
      const tool = toolDefs.find((t) => t.id === 'updateCommitment')!.create(ctx);
      const result = await tool.execute({ commitmentId: 'c1', newStatus: 'abandoned' });
      expect(result).toContain('let that one go');
    });

    it('should handle errors gracefully', async () => {
      mockUpdateStatus.mockRejectedValue(new Error('not found'));
      const tool = toolDefs.find((t) => t.id === 'updateCommitment')!.create(ctx);
      const result = await tool.execute({ commitmentId: 'c1', newStatus: 'completed' });
      expect(result).toContain('trouble updating');
    });
  });
});
