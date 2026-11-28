/**
 * #4054: SARCASM_READ. A caller opened with stock sarcasm ("Best Monday ever. Truly. I'm living
 * the dream over here.") and Ferni took it at face value. With ATTUNE_LEDGER on, the ledger knew
 * only three sarcastic phrases, and the excited word read ("best day") outranked it. With
 * SARCASM_READ on, stock sarcasm reads 'mixed' (ask how it really was); low and hurting reads
 * keep their place. Off: unchanged. All lines are invented.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { ledgerRead } from '../attune-ledger.js';
import { attunementNote, readCaller, type CallerState } from '../turn-attunement.js';

/** ATTUNE_LEDGER on, SARCASM_READ off (main) and on. */
const off = (turns: string[]): CallerState => readCaller(turns, undefined, {});
const on = (turns: string[]): CallerState => readCaller(turns, undefined, { sarcasm: true });

const REPORTED = "Oh man. Best Monday ever. truly. I'm living the dream over here.";

const ctx = (...lines: string[]): llm.ChatContext => {
  const c = llm.ChatContext.empty();
  lines.forEach((text, i) => c.addMessage({ role: i % 2 ? 'assistant' : 'user', content: text }));
  return c;
};

describe('SARCASM_READ: stock sarcasm reads mixed (#4054)', () => {
  // [turns, read with the flag off, read with it on]
  const ROWS: Array<[string, string[], CallerState, CallerState]> = [
    ['the reported opener', [REPORTED], 'neutral', 'mixed'],
    ['a deadpan "Truly." on its own', ['Best Monday ever. Truly.'], 'neutral', 'mixed'],
    [
      '"living the dream!" over a complaint',
      ['Living the dream! My car broke down again.'],
      'neutral',
      'mixed',
    ],
    [
      '"best day ever" over a complaint',
      ['Best day ever, my car broke down again.'],
      'excited',
      'mixed',
    ],
    [
      'story of my life',
      ['The bus left right as I got there. Story of my life.'],
      'neutral',
      'mixed',
    ],
    ['just my luck', ['It started raining the second I left. Just my luck.'], 'neutral', 'mixed'],
    ['oh joy', ['Oh joy, the dishwasher is leaking.'], 'neutral', 'mixed'],
    ['could this day get any better', ['Could this day get any better.'], 'neutral', 'mixed'],
    [
      'a sarcastic turn after a neutral one',
      ['Hey.', "I'm living the dream over here."],
      'neutral',
      'mixed',
    ],
    // Sincere lines stay as they were.
    ['sincere best day', ['Best day ever, I got the job!'], 'excited', 'excited'],
    ['sincere best birthday', ['That was the best birthday ever.'], 'neutral', 'neutral'],
    // "truly" that praises, and an exclaimed "living the dream", are sincere.
    [
      'truly the best day ever',
      ['my daughter got married saturday, it was truly the best day ever'],
      'excited',
      'excited',
    ],
    [
      'truly the best birthday ever',
      ['honestly, truly the best birthday ever, everyone came'],
      'neutral',
      'neutral',
    ],
    [
      'living the dream, exclaimed',
      ['we finally moved to the beach, living the dream!'],
      'neutral',
      'neutral',
    ],
    [
      'someone else living the dream',
      ['My sister is living the dream in Lisbon.'],
      'neutral',
      'neutral',
    ],
    ['negated', ["I'm not exactly living the dream."], 'neutral', 'neutral'],
    ['hypothetical', ["If I won the lottery I'd be living the dream."], 'neutral', 'neutral'],
    // Low and hurting keep their read.
    [
      'own hard words in the same turn',
      ["I haven't slept in two days. Living the dream."],
      'low',
      'low',
    ],
    ['low from before', ["I'm so tired.", 'Yeah.', 'Living the dream.'], 'low', 'low'],
    ['venting', ["Living the dream. I'm so fed up with this job."], 'venting', 'venting'],
    ['hard news with "best day ever"', ['Best day ever. My dog died this morning.'], 'sad', 'sad'],
    ['laughing', ['Living the dream haha.'], 'playful', 'playful'],
  ];

  for (const [name, turns, wantOff, wantOn] of ROWS)
    it(`${name}: off ${wantOff}, on ${wantOn}`, () => {
      expect(off(turns)).toBe(wantOff);
      expect(on(turns)).toBe(wantOn);
    });

  it('the ledger says sarcastic only with the flag, and only when it reads mixed', () => {
    expect(ledgerRead([REPORTED]).sarcastic).toBeUndefined();
    expect(ledgerRead([REPORTED], undefined, undefined, { stockSarcasm: true })).toEqual({
      state: 'mixed',
      cues: [],
      sarcastic: true,
    });
    const low = ledgerRead(["I'm so tired.", 'Yeah.', 'Living the dream.'], undefined, undefined, {
      stockSarcasm: true,
    });
    expect(low.state).toBe('low');
    expect(low.sarcastic).toBeUndefined();
  });

  it('the reply line asks how it really was, only with the flag', () => {
    const env = { ATTUNE: 'on', ATTUNE_LEDGER: 'on' };
    expect(attunementNote(ctx(REPORTED), {}, { env })).toBe('');
    const note = attunementNote(ctx(REPORTED), {}, { env: { ...env, SARCASM_READ: 'on' } });
    expect(note).toContain("don't assume either way");
    expect(note).not.toContain('be glad about the specific thing');
    // "best day ever" over a complaint: celebrated on main, asked about with the flag.
    const car = ctx('Best day ever, my car broke down again.');
    expect(attunementNote(car, {}, { env })).toContain('match their energy');
    expect(attunementNote(car, {}, { env: { ...env, SARCASM_READ: 'on' } })).toContain(
      "don't assume either way"
    );
    // Crisis guidance: still nothing.
    expect(
      attunementNote(ctx(REPORTED), {}, { careful: true, env: { ...env, SARCASM_READ: 'on' } })
    ).toBe('');
  });

  it('sarcasm beside crisis words adds nothing to a crisis reply', () => {
    // The crisis read sets crisis guidance (careful) on its own; this flag is read only here,
    // so it can only add an attunement line, and under crisis guidance it adds none.
    const env = { ATTUNE: 'on', ATTUNE_LEDGER: 'on', SARCASM_READ: 'on' };
    for (const line of [
      'Oh joy, another Monday. I want to die.',
      "Living the dream. I don't want to be here anymore.",
      'Story of my life. Nobody would even notice if I was gone.',
    ]) {
      expect(on([line])).toBe('mixed');
      expect(attunementNote(ctx(line), {}, { env })).toContain("don't assume either way");
      expect(attunementNote(ctx(line), {}, { careful: true, env })).toBe('');
    }
  });

  it('reads only the start of a long turn, and a long pathological turn stays quick', () => {
    const late = `${'and then we talked about the plans for the weekend '.repeat(20)}living the dream.`;
    expect(late.indexOf('living')).toBeGreaterThan(600);
    expect(on([late])).toBe(off([late]));
    const nasty = `${'best '.repeat(20_000)}ever truly`;
    const t0 = performance.now();
    on([nasty]);
    // Generous on purpose: a backtracking regex would take seconds here, not milliseconds.
    expect(performance.now() - t0).toBeLessThan(1_000);
  });
});
