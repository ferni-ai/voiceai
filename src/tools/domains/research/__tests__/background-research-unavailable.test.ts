/**
 * backgroundResearch has no research source behind it. It must say so, queue
 * nothing, and its descriptions must not promise findings later.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger()),
  });
  return { getLogger: logger, createLogger: logger, safeLog: logger };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const queueResearchTask = vi.hoisted(() => vi.fn(async () => 'research_1_abcdef'));
vi.mock('../../../../services/background-agents/index.js', () => ({ queueResearchTask }));

import type { ToolContext } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

const ctx = {
  userId: 'u1',
  agentId: 'peter',
  agentDisplayName: 'Peter',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;

async function backgroundResearch() {
  const def = (await getToolDefinitions()).find((d) => d.id === 'backgroundResearch');
  if (!def) throw new Error('backgroundResearch is not registered');
  return {
    def,
    tool: def.create(ctx) as { description: string; execute: (a: unknown) => unknown },
  };
}

describe('backgroundResearch: no research source', () => {
  it('says it cannot research in the background and queues nothing', async () => {
    const { tool } = await backgroundResearch();

    const text = String(
      await tool.execute({ query: 'NVDA', researchType: 'stock_analysis', depth: 'comprehensive' })
    );

    expect(text).toMatch(/can't research/i);
    expect(text).toMatch(/won't have findings/i);
    expect(text).not.toMatch(/Research Started|I'm on it|Task ID|findings ready to share/);
    expect(queueResearchTask).not.toHaveBeenCalled();
  });

  it('does not promise results later in either description', async () => {
    const { def, tool } = await backgroundResearch();

    for (const description of [def.description, tool.description]) {
      expect(description).toMatch(/not connected/);
      expect(description).not.toMatch(/delivered|continues even when/i);
    }
  });
});
