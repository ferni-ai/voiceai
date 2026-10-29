/**
 * #3000: "I can't see" about a text read as a medical emergency (severity 10).
 *
 * CRISIS_SIGHT_NEEDS_CUE (off by default) keeps main's alarm for every "i can't
 * see" except one that plainly points at an everyday thing with no acute cue, and
 * adds alarms for sight loss said outright. Run through the real path
 * (detectCrisisSignals + classifyEscalation) on:
 * - fixtures/cant-see-verifier.json: the independent verifier's set for #3034,
 *   verbatim (85 emergencies, 60 everyday, 18 breathe/feel/move);
 * - fixtures/cant-see-heldout-{1,2,3}.json: each by a separate author who never saw
 *   the rule. Set 3 was not tuned on.
 *
 * Never-lower: on every set, line by line, the flag misses no emergency main catches.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyEscalation, detectCrisisSignals } from '../escalation-classifier.js';

type SightSet = { emergency: string[]; everyday: string[]; breathe_feel_move?: string[] };
const load = (name: string): SightSet =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as SightSet;

const VERIFIER = load('cant-see-verifier');
/** Flag-on counts each set pins: emergencies caught (a floor) and false alarms (a ceiling). */
const SETS = [
  { name: 'verifier', set: VERIFIER, caught: 84, falseAlarms: 6 },
  { name: 'set 1', set: load('cant-see-heldout-1'), caught: 30, falseAlarms: 7 },
  { name: 'set 2', set: load('cant-see-heldout-2'), caught: 40, falseAlarms: 10 },
  { name: 'set 3 (blind)', set: load('cant-see-heldout-3'), caught: 42, falseAlarms: 8 },
];

/** Main's medical patterns, verbatim, for the flag-off identity check. */
const MAIN_MEDICAL = [
  /\bi('m| am) having (chest pain|a heart attack|a stroke)/i,
  /\bi can't (breathe|see|feel|move)/i,
  /\bi('m| am) (bleeding|losing blood)/i,
  /\bi think i('m| am) (dying|having a medical emergency)/i,
];

const flag = (v: 'on' | 'off') => vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', v);
const read = (words: string) => {
  const signals = detectCrisisSignals(words);
  return { signals, decision: classifyEscalation(signals) };
};
const fired = (v: 'on' | 'off', lines: string[]) => {
  flag(v);
  return lines.filter((line) => detectCrisisSignals(line).medicalEmergency);
};

afterEach(() => vi.unstubAllEnvs());

describe('the prod line: "I can\'t see." about a text', () => {
  it('flag off (main): a medical emergency at severity 10, read as crisis_immediate', () => {
    flag('off');
    const { signals, decision } = read("I can't see your text, it never came through");
    expect(signals.severity).toBe(10);
    expect(decision.type).toBe('crisis_immediate');
  });

  it('flag on: no signal at all, so no crisis is logged and no 911 note is built', () => {
    flag('on');
    const { signals, decision } = read("I can't see your text, it never came through");
    expect(signals.medicalEmergency).toBe(false);
    expect(signals.severity).toBe(0);
    expect(decision.type).toBe('none');
  });

  it('flag on: a bare "I can\'t see." keeps main\'s alarm (nothing points at a thing)', () => {
    flag('on');
    expect(read("I can't see.").decision.type).toBe('crisis_immediate');
  });
});

/** An everyday word with an acute cue: the cue wins and main's alarm stands. */
const EVERYDAY_WITH_ACUTE = [
  "i can't see the screen, my eye is bleeding",
  "i can't see my phone, everything is double",
  "i can't see the tv and my face feels numb",
  "my glasses broke and the glass went in my eye, i can't see",
  "i can't see the menu, i think i'm having a stroke",
  "i can't see, the lights are off but i hit my head really hard",
  "i can't see you on the video, my sugar is really low",
];

describe('flag on: an acute cue overrides an everyday word', () => {
  it.each(EVERYDAY_WITH_ACUTE)('%s', (line) => {
    flag('on');
    expect(read(line).decision.type).toBe('crisis_immediate');
  });
});

describe('flag off is main, byte for byte', () => {
  const every = [VERIFIER, ...SETS.slice(1).map((s) => s.set)].flatMap((s) => [
    ...s.emergency,
    ...s.everyday,
    ...(s.breathe_feel_move ?? []),
  ]);

  it('medical reads and their raw signals match main on every line of every set', () => {
    flag('off');
    for (const line of every) {
      const lower = line.toLowerCase();
      const want = MAIN_MEDICAL.filter((p) => p.test(lower)).map((p) => `medical: ${p.source}`);
      const got = detectCrisisSignals(line).rawSignals.filter((r) => r.startsWith('medical: '));
      expect(got, line).toEqual(want);
    }
  });
});

describe('breathe, feel and move are unchanged by the flag', () => {
  it.each(VERIFIER.breathe_feel_move ?? [])('%s', (line) => {
    flag('off');
    const off = read(line);
    flag('on');
    expect(read(line)).toEqual(off);
  });
});

describe.each(SETS)('held-out $name', ({ set, caught, falseAlarms }) => {
  it('never-lower: flag on misses no emergency that main (flag off) catches', () => {
    const before = fired('off', set.emergency);
    const after = new Set(fired('on', set.emergency));
    expect(before.filter((line) => !after.has(line))).toEqual([]);
  });

  it('flag on: emergencies caught and false alarms stay at their measured counts', () => {
    expect(fired('on', set.emergency).length).toBeGreaterThanOrEqual(caught);
    expect(fired('on', set.everyday).length).toBeLessThanOrEqual(falseAlarms);
    expect(fired('off', set.everyday).length).toBeGreaterThan(falseAlarms);
  });
});
