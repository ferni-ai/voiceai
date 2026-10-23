/**
 * The context layer boosts a tool whose keywords appear in the last three
 * turns. crisis_support's keywords include 'die', 'dead', 'harm' and 'end it',
 * matched as substrings, so "diet", "deadline", "pharmacy" and "send it"
 * boosted it. The boost never lifts it over the minimum on an everyday turn,
 * but it is averaged into a real crisis turn's confidence: after everyday
 * history, "I cant go on" dropped crisis_support from first to fifth.
 * SAFETY_WHOLE_WORD_SITES=on matches crisis keywords as whole words.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { calculateContextBoosts, runCombinedMatching } from '../matcher.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { crisisSupportTool } from '../tool-definitions/crisis.semantic.js';
import { DEFAULT_ROUTER_CONFIG, type SemanticToolDefinition } from '../types.js';

const turn = (text: string) => ({ role: 'user' as const, text, timestamp: new Date() });
const sendTool = {
  id: 'fake_send',
  category: 'communication',
  triggers: { keywords: ['send'] },
} as unknown as SemanticToolDefinition;
const tools = [{ definition: crisisSupportTool }, { definition: sendTool }];

/** The context boost each tool gets from one history line. */
function boosts(line: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of calculateContextBoosts([turn(line)], [], tools)) out[b.toolId] = b.boost;
  return out;
}

afterEach(() => vi.unstubAllEnvs());
afterAll(() => resetToolRegistry());

const EVERYDAY = [
  'I started a new diet',
  'the audience loved it',
  'deadline at the pharmacy',
  'I actually did send it Wednesday night',
  'she is so charming',
  'I have to spend it all',
];

describe('crisis_support context boost', () => {
  it.each(EVERYDAY)('off: %j boosts crisis_support, as today', (line) => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'off');
    expect(boosts(line).crisis_support).toBeGreaterThan(0);
  });

  it.each(EVERYDAY)('on: %j does not', (line) => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
    expect(boosts(line).crisis_support).toBeUndefined();
  });

  it.each(['I want to end it', 'i cant go on', 'I want to die', 'I feel suicidal', 'self-harm'])(
    'on: %j still boosts crisis_support',
    (line) => {
      vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
      expect(boosts(line).crisis_support).toBeGreaterThan(0);
    }
  );

  it('on: other tools keep the substring check', () => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
    expect(boosts('I was sending photos').fake_send).toBe(0.05);
  });
});

describe('a real crisis turn after everyday history', () => {
  const history = [
    'I started a new diet with the audience',
    'deadline at the pharmacy, so charming',
    'I actually did send it Wednesday',
  ].map(turn);

  function rank(): { rank: number; confidence: number } {
    const registry = getToolRegistry();
    registry.registerMany(allToolDefinitions.filter((d) => !registry.get(d.id)));
    const cfg = { ...DEFAULT_ROUTER_CONFIG, maxMatches: 50 };
    const { matches } = runCombinedMatching('I cant go on', registry, cfg, {
      conversationHistory: history,
    });
    const i = matches.findIndex((m) => m.toolId === 'crisis_support');
    return { rank: i + 1, confidence: matches[i]?.confidence ?? 0 };
  }

  it('off: the boost drags crisis_support below the top', () => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'off');
    expect(rank().rank).toBeGreaterThan(1);
  });

  it('on: crisis_support is the top match', () => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
    expect(rank()).toEqual({ rank: 1, confidence: expect.closeTo(0.9, 2) });
  });
});
