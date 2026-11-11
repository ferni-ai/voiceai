/**
 * ROUTER_CONTEXT_ADDITIVE: the context layer only adds to a tool's score.
 *
 * Off (main), the context boost is averaged into the score, so a crisis word in the last
 * three turns lowers crisis_support for a keyword-only turn, or drops it below the router
 * minimum. These run the real tool definitions through runCombinedMatching.
 * The lines are written for this test; none come from an eval set.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runCombinedMatching } from '../matcher.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { mergeLocaleIntoTools } from '../i18n/index.js';
import { DEFAULT_ROUTER_CONFIG, type ConversationTurn } from '../types.js';
import {
  CONTEXT_BONUS_CAP,
  addContextBonus,
  historyBeforeTurn,
  scoreWithoutContext,
} from '../context-additive.js';

const turns = (...texts: string[]): ConversationTurn[] =>
  texts.map((text) => ({ role: 'user', text, timestamp: new Date(0) }));

// Keyword-only crisis turns: no crisis pattern fires, so the context layer can move them.
const KEYWORD_CRISIS = ["i'm suicidal", 'i feel suicidal again', 'i need crisis help'];
const CRISIS_TURNS = [
  ...KEYWORD_CRISIS,
  'i think i might hurt myself',
  'i want to kill myself',
  'i want to end my life',
  "i'm in crisis right now",
];
const CRISIS_HISTORY = turns(
  'i keep thinking about dying',
  'lately i feel suicidal most nights',
  'i wrote a goodbye note last week'
);
const EVERYDAY_HISTORY = turns(
  'the pharmacy called, my refill is ready',
  'big deadline friday and my boss wants it sent by noon',
  'we watched a show about an emergency room'
);
const EVERYDAY = [
  'what should i make for dinner',
  'play some jazz',
  "what's the weather tomorrow",
  'remind me to call my sister',
  "i'm dying to see that new movie",
  "i'm dead tired",
  'set a timer for ten minutes',
];
const CRISIS_TOOLS = ['crisis_support', 'safety_planning', 'quick_crisis_resources'];
const ALL = { ...DEFAULT_ROUTER_CONFIG, maxMatches: 1000 };

const route = (text: string, history?: ConversationTurn[]) =>
  runCombinedMatching(text, getToolRegistry(), ALL, { conversationHistory: history }).matches;
const scoresOf = (text: string, history?: ConversationTurn[]) =>
  Object.fromEntries(route(text, history).map((m) => [m.toolId, m.confidence]));
const crisisScore = (text: string, history?: ConversationTurn[]) =>
  scoresOf(text, history).crisis_support;

beforeAll(async () => {
  resetToolRegistry();
  getToolRegistry().registerMany(await mergeLocaleIntoTools(allToolDefinitions));
});
afterEach(() => vi.unstubAllEnvs());

describe('ROUTER_CONTEXT_ADDITIVE off (default) averages the boost in', () => {
  it('a crisis history drops crisis_support for a keyword-only crisis turn', () => {
    for (const text of KEYWORD_CRISIS) {
      expect(crisisScore(text), text).toBeGreaterThan(0);
      expect(crisisScore(text, CRISIS_HISTORY), text).toBeUndefined();
    }
  });
});

describe('ROUTER_CONTEXT_ADDITIVE=on', () => {
  it('a crisis history never lowers or drops crisis_support', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    for (const text of CRISIS_TURNS) {
      const alone = crisisScore(text) ?? 0;
      expect(alone, text).toBeGreaterThan(0);
      expect(crisisScore(text, CRISIS_HISTORY), text).toBeGreaterThanOrEqual(alone);
    }
    // A keyword-only turn gets the capped bonus on top of what it scores alone.
    for (const text of KEYWORD_CRISIS) {
      expect(crisisScore(text, CRISIS_HISTORY), text).toBeGreaterThan(crisisScore(text) ?? 0);
    }
  });

  it('no tool scores lower because of context, and none gains more than the cap', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    for (const text of [...CRISIS_TURNS, ...EVERYDAY]) {
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

  it('a turn already at the end of the history does not boost itself', () => {
    vi.stubEnv('ROUTER_CONTEXT_ADDITIVE', 'on');
    const plain = turns('made pasta tonight', 'watching a baking show');
    for (const text of CRISIS_TURNS) {
      expect(scoresOf(text, [...plain, ...turns(text)]), text).toEqual(scoresOf(text, plain));
    }
  });

  it('an everyday history never brings a crisis tool into an everyday turn', () => {
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

describe('context-additive helpers', () => {
  it('addContextBonus adds at most the cap, never lowers, and only to a tool the turn names', () => {
    const kw = (context: number) => ({ context, pattern: 0, keyword: 0.8 });
    expect(addContextBonus(0.5, kw(0.05), true)).toBeCloseTo(0.55);
    expect(addContextBonus(0.5, kw(0.4), true)).toBeCloseTo(0.5 + CONTEXT_BONUS_CAP);
    expect(addContextBonus(0.95, { context: 0.4, pattern: 0.95, keyword: 0 }, true)).toBeCloseTo(
      0.99
    );
    expect(addContextBonus(0.995, kw(0.05), true)).toBe(0.995);
    expect(addContextBonus(1, { context: 0.1, pattern: 1, keyword: 0 }, true)).toBe(1);
    expect(addContextBonus(0.6, kw(0), true)).toBe(0.6);
    // Holistic-only (mood, no pattern or keyword): context does not lift it.
    expect(addContextBonus(0.9, { context: 0.1, pattern: 0, keyword: 0 }, true)).toBe(0.9);
    // Flag off: unchanged.
    expect(addContextBonus(0.5, kw(0.1), false)).toBe(0.5);
  });

  it('scoreWithoutContext takes only the context layer out, and only with the flag on', () => {
    const scores = { context: 0.1, keyword: 0.8, matchedBy: ['keyword', 'context'] as const };
    const s = { ...scores, matchedBy: [...scores.matchedBy] };
    expect(scoreWithoutContext(s, true)).toEqual({
      context: 0,
      keyword: 0.8,
      matchedBy: ['keyword'],
    });
    expect(scoreWithoutContext(s, false)).toBe(s);
    const none = { context: 0, keyword: 0.8, matchedBy: ['keyword' as const] };
    expect(scoreWithoutContext(none, true)).toBe(none);
  });

  it('historyBeforeTurn drops only the trailing turns that together are this turn', () => {
    const h = turns('made pasta', "I can't go on.", "I'm done");
    expect(historyBeforeTurn(h, "I can't go on. I'm done")).toEqual(h.slice(0, 1));
    expect(historyBeforeTurn(h, "i'm done")).toEqual(h.slice(0, 2));
    expect(historyBeforeTurn(h, 'something else')).toBe(h);
    // A short earlier turn that this turn merely contains stays.
    const help = turns('help');
    expect(historyBeforeTurn(help, 'i need help with my taxes')).toBe(help);
    expect(historyBeforeTurn(turns('made pasta', 'help'), 'please help')).toHaveLength(2);
    expect(historyBeforeTurn(turns('go'), 'going home')).toHaveLength(1);
    // Only the caller's turns: an assistant turn ends the walk.
    const agent = [...h, { role: 'assistant' as const, text: "I'm done", timestamp: new Date(0) }];
    expect(historyBeforeTurn(agent, "I'm done")).toBe(agent);
    // Letters outside a-z count as words.
    const es = turns('hola', 'ya no puedo más');
    expect(historyBeforeTurn(es, 'Ya no puedo más.')).toEqual(es.slice(0, 1));
    const ru = turns('привет', 'мне очень плохо');
    expect(historyBeforeTurn(ru, 'Мне очень плохо.')).toEqual(ru.slice(0, 1));
    expect(historyBeforeTurn(ru, 'мне хорошо')).toBe(ru);
    expect(historyBeforeTurn(undefined, 'x')).toBeUndefined();
  });
});
