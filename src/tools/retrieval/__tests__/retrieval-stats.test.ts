import { describe, expect, it } from 'vitest';
import { RetrievalStats, isLiveCovered } from '../retrieval-stats.js';

describe('isLiveCovered', () => {
  it('in shadow, counts retrieved tools only within the top k of the whole index', () => {
    expect(isLiveCovered({ via: 'retrieved', rank: 19, covered: true }, 20, 'shadow')).toBe(true);
    expect(isLiveCovered({ via: 'retrieved', rank: 20, covered: true }, 20, 'shadow')).toBe(false);
    expect(isLiveCovered({ via: 'core', rank: -1, covered: true }, 20, 'shadow')).toBe(true);
    expect(isLiveCovered({ via: 'sticky', rank: -1, covered: true }, 20, 'shadow')).toBe(true);
    expect(isLiveCovered({ via: 'missed', rank: -1, covered: false }, 20, 'shadow')).toBe(false);
  });

  it('in live, trusts covered: the agent holds the whole catalog', () => {
    expect(isLiveCovered({ via: 'retrieved', rank: 40, covered: true }, 20, 'live')).toBe(true);
    expect(isLiveCovered({ via: 'missed', rank: 3, covered: false }, 20, 'live')).toBe(false);
  });
});

describe('RetrievalStats', () => {
  it('reports latency percentiles and distinct missed tools', () => {
    const s = new RetrievalStats();
    for (const ms of [10, 20, 30, 40, 200]) s.pick(ms);
    s.call({ tool: 'getNews', covered: false, liveCovered: false });
    s.call({ tool: 'getNews', covered: false, liveCovered: false });
    s.call({ tool: 'playMusic', covered: true, liveCovered: true });
    expect(s.summary()).toEqual({
      picks: 5,
      pickFailures: 0,
      calls: 3,
      covered: 1,
      liveCovered: 1,
      missedTools: ['getNews'],
      embedMsP50: 30,
      embedMsP95: 200,
      embedMsMax: 200,
    });
  });
});
