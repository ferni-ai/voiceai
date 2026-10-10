import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOPIC_TOOL_HEADROOM,
  filterInitialSpawnTools,
  getInitialToolPolicyFromEnv,
  resolveTopicToolHeadroom,
} from '../initial-tools.js';

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

describe('resolveTopicToolHeadroom', () => {
  it('defaults when MID_SESSION_TOPIC_TOOLS is unset or blank', () => {
    expect(resolveTopicToolHeadroom({})).toBe(DEFAULT_TOPIC_TOOL_HEADROOM);
    expect(resolveTopicToolHeadroom({ MID_SESSION_TOPIC_TOOLS: ' ' })).toBe(
      DEFAULT_TOPIC_TOOL_HEADROOM
    );
  });

  it('takes a non-negative integer, 0 turning the headroom off', () => {
    expect(resolveTopicToolHeadroom({ MID_SESSION_TOPIC_TOOLS: '40' })).toBe(40);
    expect(resolveTopicToolHeadroom({ MID_SESSION_TOPIC_TOOLS: '0' })).toBe(0);
  });

  it('ignores negative or non-integer values', () => {
    for (const bad of ['-5', '12.5', 'lots']) {
      expect(resolveTopicToolHeadroom({ MID_SESSION_TOPIC_TOOLS: bad })).toBe(
        DEFAULT_TOPIC_TOOL_HEADROOM
      );
    }
  });
});
