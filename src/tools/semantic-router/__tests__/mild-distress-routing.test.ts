/**
 * Mild distress leads with a wellness tool, never crisis_support; risk language keeps
 * crisis_support at the head. The holistic layer boosts crisis and wellness tools equally
 * for any distress word, so without a wellness pattern hit the crisis tools won the tie on
 * registration order ("I'm a little anxious" headed crisis_support at 0.71).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { runCombinedMatching } from '../matcher.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { DEFAULT_ROUTER_CONFIG, type ToolMatch } from '../types.js';

afterAll(() => resetToolRegistry());

function route(text: string): ToolMatch[] {
  const registry = getToolRegistry();
  registry.registerMany(allToolDefinitions.filter((d) => !registry.get(d.id)));
  return runCombinedMatching(text, registry, { ...DEFAULT_ROUTER_CONFIG, maxMatches: 50 }).matches;
}

const WELLNESS = ['wellness_checkin', 'grounding_exercise'];

const MILD = [
  "I'm feeling a bit stressed today",
  "I'm feeling a bit stressed",
  "I'm so stressed out",
  "I'm stressed about work",
  'Work has been stressing me out',
  "I'm feeling really sad today",
  "I'm feeling really sad",
  'I feel kind of down today',
  "I'm a little anxious",
  "I'm feeling anxious about tomorrow",
  "I've been anxious all day",
  "I'm having a rough day",
  'Rough day today',
  'Today was a really bad day',
  "I'm overwhelmed",
  "I'm feeling overwhelmed today",
  "I'm in a bit of a funk",
];

const RISK = [
  'i want to kill myself',
  'I want to die',
  "I'm so stressed I want to kill myself",
  "I'm feeling down and I want to die",
  "I'm sad and I want to hurt myself",
];

// Risk lines built from the mild-distress phrasings: the wellness patterns must not fire.
// ("feeling down" is a wellness_checkin phrase trigger, so "I'm feeling down and I want to
// die" still gets a wellness hit from main; crisis_support leads it at 1.0 regardless.)
const RISK_WITH_MILD_WORDS = [
  "I'm so stressed I want to kill myself",
  "I'm sad and I want to hurt myself",
  "I've been really anxious and I want to die",
  'Rough day, I want to kill myself',
  "I'm so stressed I'm going to overdose",
  "I'm so anxious I want to take all my pills",
  "I'm feeling really sad and I want to end my life",
  "Rough day, I can't go on",
  "I'm feeling really sad and I don't want to live",
  "I'm overwhelmed and I don't want to wake up",
];

describe('mild distress', () => {
  it.each(MILD)('%j leads with a wellness tool, not crisis_support', (text) => {
    const matches = route(text);
    expect(WELLNESS).toContain(matches[0]?.toolId);
    expect(matches[0]?.confidence ?? 0).toBeGreaterThanOrEqual(0.95);
  });
});

describe('risk language', () => {
  it.each(RISK)('%j keeps crisis_support at the head at full confidence', (text) => {
    const matches = route(text);
    expect(matches[0]?.toolId).toBe('crisis_support');
    expect(matches[0]?.confidence).toBe(1);
  });

  it.each(RISK_WITH_MILD_WORDS)('%j gets no wellness pattern hit', (text) => {
    for (const m of route(text).filter((x) => WELLNESS.includes(x.toolId))) {
      expect(m.layerScores.pattern, m.toolId).toBe(0);
    }
  });
});
