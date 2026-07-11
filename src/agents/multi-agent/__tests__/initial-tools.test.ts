import { describe, it, expect } from 'vitest';
import { filterInitialSpawnTools, getInitialToolPolicyFromEnv } from '../initial-tools.js';

describe('filterInitialSpawnTools', () => {
  const all = [
    { name: 'playMusic' },
    { name: 'handoffToMaya' },
    { name: 'deepResearch' },
    { name: 'getWeather' },
  ];
  const essential = new Set(['playMusic', 'getWeather']);
  const handoff = new Set(['handoffToMaya']);

  it('returns all tools when essentialOnly is false', () => {
    expect(
      filterInitialSpawnTools(all, essential, handoff, { essentialOnly: false })
    ).toHaveLength(4);
  });

  it('keeps only essential + handoff when essentialOnly is true', () => {
    const filtered = filterInitialSpawnTools(all, essential, handoff, {
      essentialOnly: true,
    });
    expect(filtered.map((t) => t.name).sort()).toEqual([
      'getWeather',
      'handoffToMaya',
      'playMusic',
    ]);
  });
});

describe('getInitialToolPolicyFromEnv', () => {
  it('defaults to essentialOnly true', () => {
    expect(getInitialToolPolicyFromEnv({})).toEqual({ essentialOnly: true });
  });

  it('disables when MULTI_AGENT_ESSENTIAL_TOOLS_FIRST=false', () => {
    expect(
      getInitialToolPolicyFromEnv({ MULTI_AGENT_ESSENTIAL_TOOLS_FIRST: 'false' })
    ).toEqual({ essentialOnly: false });
  });
});
