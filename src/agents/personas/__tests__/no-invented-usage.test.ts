/**
 * NO_INVENTED_USAGE (#3028, no-invented-usage.ts): Ferni can't see other callers, so the
 * prompt says he never counts, quotes or describes them; the director is told the same;
 * and a director note pushing for a usage number or other callers' questions is dropped.
 * Off, the prompt and the director are as before. Invented lines only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORY_HONESTY, withHonesty } from '../ai-honesty.js';
import { FERNI_CAST } from '../director-cast.js';
import { guardRuleFor, guardViolation } from '../director-guard.js';
import { parseNotes, type Line } from '../director-notes.js';
import { INTERNALS_HONESTY } from '../no-invented-internals.js';
import { pushesUsage, usageHonestyLine } from '../no-invented-usage.js';

const FLAG = 'NO_INVENTED_USAGE';
const ON = { [FLAG]: 'on' };
const RULE = 'If someone sincerely asks whether you are an AI, say yes.\n';
const USAGE_HONESTY = usageHonestyLine(ON);
/** After these words, a note asking for a figure is a push (the caller asked about others). */
const asksAboutUsage = (said: string): boolean => pushesUsage('Give a specific example.', said);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the prompt (withHonesty, as prompt-loader.ts builds it)', () => {
  it('off: the rule as loaded; on: the rule, then the usage line', () => {
    expect(withHonesty(RULE, {})).toBe(RULE);
    expect(withHonesty(RULE, ON)).toBe(`${RULE.trimEnd()}\n\n${USAGE_HONESTY}`);
  });

  it('keeps its place among the other honesty lines: story, internals, usage', () => {
    const env = { AI_HONESTY_STORY: 'on', NO_INVENTED_INTERNALS: 'on', ...ON };
    expect(withHonesty(RULE, env)).toBe(
      [RULE.trimEnd(), STORY_HONESTY, INTERNALS_HONESTY, USAGE_HONESTY].join('\n\n')
    );
    // The others, without it, are as they were.
    expect(withHonesty(RULE, { AI_HONESTY_STORY: 'on', NO_INVENTED_INTERNALS: 'on' })).toBe(
      [RULE.trimEnd(), STORY_HONESTY, INTERNALS_HONESTY].join('\n\n')
    );
  });

  it('says he never counts, quotes or describes other conversations', () => {
    expect(USAGE_HONESTY).toMatch(/can't see anyone else's conversations/);
    expect(USAGE_HONESTY).toMatch(/never count, quote or describe them/);
    expect(USAGE_HONESTY).toMatch(/no number, estimate or example/);
  });

  it('live: the model-level instructions carry it with the flag on, not off', async () => {
    vi.stubEnv('PROMPT_MODE', 'character');
    const off = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(off).not.toContain(USAGE_HONESTY);
    vi.resetModules(); // the instructions are cached per process
    vi.stubEnv(FLAG, 'on');
    const on = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(on).toContain(USAGE_HONESTY);
  });
});

describe('the director', () => {
  it("is told not to ask for what Ferni can't see, only with the flag on", () => {
    const rule = /can't see anyone else's conversations: never ask for a number/;
    expect(guardRuleFor(FERNI_CAST, { env: {} })).not.toMatch(rule);
    expect(guardRuleFor(FERNI_CAST, { env: ON })).toMatch(rule);
    expect(guardRuleFor(FERNI_CAST, { env: ON })).toContain('how many people talk to him');
  });

  // The prod notes from #3028, reworded; the caller had asked about other people.
  const asked = 'how many people ask you stuff like this every day?';
  const pushes = [
    "Drop the vague 'every day' and give a real estimate.",
    'Answer their direct question about what people asked you today.',
    'Share a specific detail about how much people use you.',
  ];

  it('drops a note pushing for a usage number or other callers, only with the flag on', () => {
    for (const note of pushes) {
      expect([note, guardViolation(note, asked, ON)]).toEqual([note, 'usage_invention']);
      expect([note, guardViolation(note, asked, {})]).toEqual([note, undefined]);
    }
    // Naming other callers outright needs no question before it.
    expect(guardViolation('Tell them what your other callers worry about.', '', ON)).toBe(
      'usage_invention'
    );
  });

  it('keeps ordinary coaching, about the caller or after their question', () => {
    const keeps: Array<[string, string]> = [
      ['They sound curious about you; turn it back to them.', asked],
      [
        'She says people ask her for advice every day; notice the pride.',
        'people ask me for advice every day',
      ],
      ['Ask how many people were at the party.', 'the party was huge'],
      ['Answer what they asked about the recipe.', 'what goes in the sauce?'],
      ['Give them the number for the crisis line.', 'i feel awful'],
    ];
    for (const [note, said] of keeps) {
      expect([note, guardViolation(note, said, ON)]).toEqual([note, undefined]);
    }
  });

  it('parseNotes drops the push from the call, as the director writes notes', () => {
    vi.stubEnv(FLAG, 'on');
    const call: Line[] = [
      { speaker: 'user', text: asked },
      { speaker: 'ferni', text: 'Every day, quite a lot.' },
    ];
    // Only the caller's question makes this a push: parseNotes hands the guard their words.
    const push = 'Answer with a specific number for every day.';
    const kept = 'They seem curious about every day; ask why.';
    expect(parseNotes(`${push}\n${kept}`, call)).toEqual([kept]);
    vi.stubEnv(FLAG, 'off');
    expect(parseNotes(`${push}\n${kept}`, call)).toEqual([push, kept]);
  });
});

describe('pushesUsage: which caller words make a figure a push', () => {
  it('reads a caller asking about other people and Ferni', () => {
    for (const said of [
      'how much do people use you every day?',
      'what do other people ask you about?',
      'do teens ask you this kind of stuff?',
      'how many users do you have?',
      'do other callers talk to you about this?',
    ]) {
      expect([said, asksAboutUsage(said)]).toEqual([said, true]);
    }
  });

  it('not a caller talking about their own people', () => {
    for (const said of [
      'how many people came to the party?',
      'other people at my work are mean',
      'i talked to my mom earlier today',
      'people ask me for advice a lot',
    ]) {
      expect([said, asksAboutUsage(said)]).toEqual([said, false]);
    }
    expect(pushesUsage('Give a specific example.', 'how many people came to the party?')).toBe(
      false
    );
  });
});
