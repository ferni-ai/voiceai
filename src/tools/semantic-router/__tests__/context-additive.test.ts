/**
 * ROUTER_CONTEXT_ADDITIVE: the context layer only adds to a tool's score.
 *
 * Off, the context boost is averaged into the score, so a crisis word in the last three
 * turns pushed crisis_support DOWN the ranking (0.90 first -> 0.69 fifth for "i want to
 * end it"). These run the real tool definitions through runCombinedMatching.
 *
 * Not committed: the 251 real-risk cases of the crisis-eligible-v1 eval set, run the same
 * way (crisis_support rank with a crisis turn in the history never worse than without).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runCombinedMatching } from '../matcher.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { mergeLocaleIntoTools } from '../i18n/index.js';
import { DEFAULT_ROUTER_CONFIG, type ConversationTurn } from '../types.js';
import { CONTEXT_BONUS_CAP, addContextBonus, historyBeforeTurn } from '../context-additive.js';

const turns = (...texts: string[]): ConversationTurn[] =>
  texts.map((text) => ({ role: 'user', text, timestamp: new Date(0) }));

const REAL_RISK = [
  'i want to end it',
  'I cant go on',
  "I can't go on",
  'i want to die',
  'i think about killing myself',
  'i feel suicidal tonight',
  "honestly i don't want to live anymore",
  'i want to hurt myself',
  'i want to harm myself', // pattern 0.95: the case a context bonus can still move
  "i'm in crisis",
  'i need help right now',
  'there is no point anymore, i want to be dead',
  'i keep thinking everyone would be better off if i was dead',
];
const CRISIS_HISTORY = turns(
  'some days i honestly want to die',
  "i've been suicidal on and off since march",
  "it feels urgent and i'm scared"
);
// Eight crisis_support keywords as substrings (diet, pharmacy, deadline, send it, ...), so
// the raw boost (0.40) is over the 0.35 minimum and only the cap keeps crisis tools out.
const EVERYDAY_HISTORY = turns(
  'my diet is going ok, but the pharmacy said my refill is urgent',
  'big deadline friday, my boss keeps joking about a midlife crisis, send it by noon he said',
  'we rewatched suicide squad, then a show about an emergency room'
);
const EVERYDAY = [
  'what should i make for dinner',
  'i had a long day at work',
  'play some jazz',
  "what's the weather tomorrow",
  "i'm dying to see that new movie",
  'my phone is dead, ugh',
  'remind me to call my mom',
  "i'm dead tired",
];
const CRISIS_TOOLS = ['crisis_support', 'safety_planning', 'quick_crisis_resources'];
const ALL = { ...DEFAULT_ROUTER_CONFIG, maxMatches: 1000 };

function route(text: string, history?: ConversationTurn[]) {
  return runCombinedMatching(text, getToolRegistry(), ALL, { conversationHistory: history })
    .matches;
}
const rankOf = (text: string, history?: ConversationTurn[]) => {
  const i = route(text, history).findIndex((m) => m.toolId === 'crisis_support');
  return i < 0 ? Infinity : i + 1;
};
const scoresOf = (text: string, history?: ConversationTurn[]) =>
  Object.fromEntries(route(text, history).map((m) => [m.toolId, m.confidence]));

beforeAll(async () => {
  resetToolRegistry();
  getToolRegistry().registerMany(await mergeLocaleIntoTools(allToolDefinitions));
});
afterEach(() => vi.unstubAllEnvs());

describe('ROUTER_CONTEXT_ADDITIVE=on', () => {
  it("a real crisis in the last turns never lowers crisis_support's rank", () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    const before = REAL_RISK.map((t) => rankOf(t));
    expect(before.filter((r) => r <= 5).length).toBeGreaterThanOrEqual(6); // the set routes
    const worse = REAL_RISK.filter((t, i) => rankOf(t, CRISIS_HISTORY) > (before[i] ?? Infinity));
    expect(worse).toEqual([]);
    // ...and the crisis words still count where the turn names the tool (pattern 0.95 -> 0.99).
    const score = (h?: ConversationTurn[]) =>
      scoresOf('i want to harm myself', h).crisis_support ?? 0;
    expect(score(CRISIS_HISTORY)).toBeGreaterThan(score());
    // A holistic-only read ("i want to end it", 0.90) is left exactly where it was.
    const mood = (h?: ConversationTurn[]) => scoresOf('i want to end it', h).crisis_support;
    expect(mood(CRISIS_HISTORY)).toBe(mood());
  });

  it('no tool scores lower because of context, whatever the history', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    for (const text of [...REAL_RISK, ...EVERYDAY]) {
      const alone = scoresOf(text);
      for (const history of [CRISIS_HISTORY, EVERYDAY_HISTORY]) {
        const withHistory = scoresOf(text, history);
        for (const [tool, score] of Object.entries(alone)) {
          expect(withHistory[tool], `${tool} on "${text}"`).toBeGreaterThanOrEqual(score);
          expect((withHistory[tool] ?? 0) - score).toBeLessThanOrEqual(CONTEXT_BONUS_CAP + 1e-9);
        }
      }
    }
  });

  it('the current turn does not boost itself when the history already ends with it', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    for (const text of REAL_RISK) {
      const plain = turns('made pasta for dinner', 'watching that baking show');
      const self = [...plain, ...turns(text)];
      expect(scoresOf(text, self), text).toEqual(scoresOf(text, plain));
    }
  });

  it('everyday history and turns never bring in a crisis tool', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    for (const text of EVERYDAY) {
      const scores = scoresOf(text, EVERYDAY_HISTORY);
      for (const tool of CRISIS_TOOLS) {
        expect(scores[tool] ?? 0, `${tool} on "${text}"`).toBeLessThan(
          DEFAULT_ROUTER_CONFIG.thresholds.minimum
        );
      }
    }
  });
});

describe('ROUTER_CONTEXT_ADDITIVE off (default) keeps the averaged boost', () => {
  it('a crisis history still lowers crisis_support for a keyword-only turn', () => {
    expect(rankOf('i want to end it', CRISIS_HISTORY)).toBeGreaterThan(rankOf('i want to end it'));
  });
});

describe('context-additive helpers', () => {
  it('addContextBonus adds at most the cap, never lowers, and only to a tool the turn names', () => {
    const kw = (context: number) => ({ context, pattern: 0, keyword: 0.8 });
    expect(addContextBonus(0.5, kw(0.05))).toBeCloseTo(0.55);
    expect(addContextBonus(0.5, kw(0.4))).toBeCloseTo(0.5 + CONTEXT_BONUS_CAP);
    expect(addContextBonus(0.95, { context: 0.4, pattern: 0.95, keyword: 0 })).toBeCloseTo(0.99);
    expect(addContextBonus(0.995, kw(0.05))).toBe(0.995);
    expect(addContextBonus(1, { context: 0.1, pattern: 1, keyword: 0 })).toBe(1);
    expect(addContextBonus(0.6, kw(0))).toBe(0.6);
    // Holistic-only (mood, no pattern or keyword): context does not lift it.
    expect(addContextBonus(0.9, { context: 0.1, pattern: 0, keyword: 0 })).toBe(0.9);
  });

  it('historyBeforeTurn drops the turn and the finals it was stitched from, nothing else', () => {
    const h = turns('made pasta', "I can't go on.", "I'm done");
    expect(historyBeforeTurn(h, "I can't go on. I'm done")).toEqual(h.slice(0, 1));
    expect(historyBeforeTurn(h, 'something else')).toBe(h);
    expect(historyBeforeTurn(turns('go'), 'going home')).toHaveLength(1);
    const agent = [...h, { role: 'assistant' as const, text: "I'm done", timestamp: new Date(0) }];
    expect(historyBeforeTurn(agent, "I'm done")).toBe(agent);
    expect(historyBeforeTurn(undefined, 'x')).toBeUndefined();
  });
});
