/**
 * The wellness risk guard (#3733): risk language keeps crisis_support at the head and gets no
 * wellness pattern hit, while the mild lines main already offered a wellness tool for still do.
 * Broader mild patterns ("I'm a bit stressed today", "rough day") wait for the crisis check
 * before ranking (task #15): see mild-lead-in-never-lower.test.ts for why.
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

// Mild lines whose wellness head on main comes from the tools' own triggers, now guarded.
const MILD = [
  "I'm so stressed out",
  "I'm stressed about work",
  "I'm feeling anxious about tomorrow",
  "I'm overwhelmed",
  "I'm feeling overwhelmed today",
];

const RISK = [
  'i want to kill myself',
  'I want to die',
  "I'm so stressed I want to kill myself",
  "I'm feeling down and I want to die",
  "I'm sad and I want to hurt myself",
];

// Risk lines built from the mild-distress phrasings: no wellness trigger may fire, including
// the former plain phrases ("I'm stressed", "feeling down"), word forms ("killing") and
// indirect forms. crisis-corpus-no-wellness.test.ts runs the public crisis corpus the same way.
const RISK_WITH_MILD_WORDS = [
  "I'm stressed and I want to kill myself",
  "I'm feeling down and I want to die",
  "I'm so stressed I keep wanting to hang myself",
  "I'm anxious and killing myself feels like the only way",
  "I'm overwhelmed and everyone would be better off without me",
  'Rough day. I just want to disappear',
  "I'm stressed\nI want to kill myself",
  'I\u2019m so sad and I can\u2019t take it anymore',
  "I'm struggling, I'm thinking about self-harm",
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

describe('mild distress main already offered', () => {
  it.each(MILD)('%j still leads with a wellness tool', (text) => {
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
