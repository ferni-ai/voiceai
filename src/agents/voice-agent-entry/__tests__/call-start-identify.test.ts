import { afterEach, describe, expect, it, vi } from 'vitest';
import { identifyWithCallStartStages } from '../call-start-identify.js';
import { readOncePerCallStart, resetCallStartReads } from '../../../utils/call-start-reads.js';

describe('identifyWithCallStartStages', () => {
  afterEach(() => resetCallStartReads());

  it('opens the shared read window before identify runs', async () => {
    const read = vi.fn(async () => 'doc');
    const markStage = vi.fn(async () => undefined);
    await identifyWithCallStartStages('s1', markStage, async () => {
      await readOncePerCallStart('root:u1', read);
      await readOncePerCallStart('root:u1', read);
      return { userId: 'u1' };
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('returns what identify returned and marks identify_start and identify_done around it', async () => {
    const calls: Array<[string, string, number]> = [];
    const markStage = vi.fn(async (sessionId: string, stage: string, atMs: number) => {
      calls.push([sessionId, stage, atMs]);
    });
    let identifyRanAt = 0;
    const result = await identifyWithCallStartStages('s1', markStage, async () => {
      identifyRanAt = Date.now();
      return { userId: 'u1', userName: 'Sam' };
    });
    expect(result).toEqual({ userId: 'u1', userName: 'Sam' });
    expect(calls.map(([sessionId, stage]) => [sessionId, stage])).toEqual([
      ['s1', 'identify_start'],
      ['s1', 'identify_done'],
    ]);
    expect(calls[0][2]).toBeLessThanOrEqual(identifyRanAt);
    expect(calls[1][2]).toBeGreaterThanOrEqual(identifyRanAt);
  });
});
