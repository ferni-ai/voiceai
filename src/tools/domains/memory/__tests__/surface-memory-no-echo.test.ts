/**
 * surfaceRelevantMemory must never hand the model's own guess back as a
 * memory: when the search and this call's key moments find nothing, it says
 * nothing matched (read-path audit 2026-10-29).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ execute: config.execute })) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: vi.fn(() => ({ search, recordFeedback: vi.fn() })),
}));

import type { ToolContext } from '../../../registry/types.js';
import { surfaceRelevantMemoryUnifiedDef } from '../tools-unified.js';

type Exec = (args: Record<string, string>, opts: { ctx: unknown }) => Promise<string>;

const GUESS = 'Sam said his sister moved to Lisbon';
const args = { context: 'talking about travel', memoryToSurface: GUESS, connectionReason: 'travel' };

function run(userData: Record<string, unknown>): Promise<string> {
  const tool = surfaceRelevantMemoryUnifiedDef.create({ agentId: 'ferni' } as ToolContext) as unknown as {
    execute: Exec;
  };
  return tool.execute(args, { ctx: { userData } });
}

describe('surfaceRelevantMemory', () => {
  beforeEach(() => search.mockReset());

  it('returns the stored memory when the search finds one', async () => {
    search.mockResolvedValue('Sam mentioned a trip to Porto last spring');
    expect(await run({ userId: 'u1' })).toBe('Sam mentioned a trip to Porto last spring');
  });

  it('says nothing matched instead of echoing the guess when the search finds nothing', async () => {
    search.mockResolvedValue(null);
    const out = await run({ userId: 'u1', keyMoments: ['booked a dentist visit'] });
    expect(out).not.toContain(GUESS);
    expect(out).toMatch(/No stored memory matched/);
  });

  it('says nothing matched when there is no user to search', async () => {
    const out = await run({});
    expect(out).not.toContain(GUESS);
    expect(search).not.toHaveBeenCalled();
  });

  it('still returns a matching key moment from this call', async () => {
    search.mockResolvedValue(null);
    expect(await run({ userId: 'u1', keyMoments: ['Sam is planning a trip in May'] })).toBe(
      'Sam is planning a trip in May'
    );
  });
});
