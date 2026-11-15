/**
 * surfaceRelevantMemory must never hand the model's own guess back as a
 * memory: when the search and this call's key moments find nothing, it says
 * nothing matched (read-path audit 2026-10-29). A key moment counts only when
 * it shares two content words, as whole words, with the guess; sharing the
 * guess's first word ("your", a name) is not a match.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
const recordFeedback = vi.fn();

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ execute: config.execute })) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: vi.fn(() => ({ search, recordFeedback })),
}));

import type { ToolContext } from '../../../registry/types.js';
import { surfaceRelevantMemoryUnifiedDef } from '../tools-unified.js';

type Exec = (args: Record<string, string>, opts: { ctx: unknown }) => Promise<string>;

const GUESS = 'Sam said his sister moved to Lisbon';
const NOTHING = /No stored memory matched/;

function run(userData: Record<string, unknown>, memoryToSurface = GUESS): Promise<string> {
  const tool = surfaceRelevantMemoryUnifiedDef.create({ agentId: 'ferni' } as ToolContext) as unknown as {
    execute: Exec;
  };
  const args = { context: 'talking about travel', memoryToSurface, connectionReason: 'travel' };
  return tool.execute(args, { ctx: { userData } });
}

describe('surfaceRelevantMemory', () => {
  beforeEach(() => {
    search.mockReset();
    recordFeedback.mockReset();
  });

  it('returns the stored memory when the search finds one, and records it as surfaced', async () => {
    search.mockResolvedValue('Sam mentioned a trip to Porto last spring');
    expect(await run({ userId: 'u1' })).toBe('Sam mentioned a trip to Porto last spring');
    expect(recordFeedback).toHaveBeenCalledTimes(1);
    expect(recordFeedback.mock.calls[0][0]).toMatchObject({ action: 'surfaced', userId: 'u1' });
  });

  it('says nothing matched instead of echoing the guess when the search finds nothing', async () => {
    search.mockResolvedValue(null);
    const out = await run({ userId: 'u1', keyMoments: ['booked a dentist visit'] });
    expect(out).not.toContain(GUESS);
    expect(out).toMatch(NOTHING);
    expect(recordFeedback).not.toHaveBeenCalled();
  });

  it('says nothing matched when there is no user to search', async () => {
    const out = await run({});
    expect(out).not.toContain(GUESS);
    expect(search).not.toHaveBeenCalled();
  });

  it('returns a key moment from this call that is about the same thing', async () => {
    search.mockResolvedValue(null);
    expect(await run({ userId: 'u1', keyMoments: ["Sam's sister just moved to Lisbon"] })).toBe(
      "Sam's sister just moved to Lisbon"
    );
    expect(recordFeedback).toHaveBeenCalledTimes(1);
  });

  it('does not return a key moment that shares only the first word of the guess', async () => {
    search.mockResolvedValue(null);
    const out = await run(
      { userId: 'u1', keyMoments: ['your dentist visit is on Friday'] },
      'your sister moved to Lisbon last year'
    );
    expect(out).toMatch(NOTHING);
    expect(recordFeedback).not.toHaveBeenCalled();
  });

  it('does not return a key moment that shares only a name with the guess', async () => {
    search.mockResolvedValue(null);
    expect(await run({ userId: 'u1', keyMoments: ['Sam is planning a trip in May'] })).toMatch(NOTHING);
  });

  it('matches whole words only: "art" is not in "party", "class" is not in "classroom"', async () => {
    search.mockResolvedValue(null);
    const out = await run(
      { userId: 'u1', keyMoments: ['a party in the classroom'] },
      'art class on Tuesdays'
    );
    expect(out).toMatch(NOTHING);
  });
});
