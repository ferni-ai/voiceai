/**
 * #3000: "I can't see" about a text read as a medical emergency (severity 10).
 *
 * CRISIS_SIGHT_NEEDS_CUE (off by default) keeps main's alarm for every "i can't
 * see" except an utterance that is ONLY an everyday "can't see" clause (an object
 * or context, filler, a short benign tail) with no acute cue, and adds alarms for
 * sight loss said outright. Run through the real path
 * (detectCrisisSignals + classifyEscalation) on:
 * - fixtures/cant-see-verifier{,-2,-3}.json: the independent verifier's sets for
 *   #3034, verbatim (85/60 plus 18 breathe/feel/move; 70/62; 45/44);
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
  { name: 'verifier', set: VERIFIER, caught: 84, falseAlarms: 42 },
  { name: 'verifier 2', set: load('cant-see-verifier-2'), caught: 69, falseAlarms: 57 },
  { name: 'verifier 3', set: load('cant-see-verifier-3'), caught: 43, falseAlarms: 34 },
  { name: 'set 1', set: load('cant-see-heldout-1'), caught: 30, falseAlarms: 31 },
  { name: 'set 2', set: load('cant-see-heldout-2'), caught: 40, falseAlarms: 39 },
  { name: 'set 3 (blind)', set: load('cant-see-heldout-3'), caught: 42, falseAlarms: 28 },
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

/** An everyday word with anything more: main's alarm stands. */
const EVERYDAY_WITH_ACUTE = [
  // the verifier's r4 never-lower misses (#3034 comment 6505472027), verbatim
  "i can't see my phone, my eye feels like it's being stabbed",
  "i can't see the clock, the room keeps tilting and i'm sick to my stomach",
  "i can't see the road signs, my vision cut out while driving",
  "i can't see, i'm alone and i can't find my phone, please",
  "i can't see, i tripped and my glasses broke into my eye",
  // the verifier's r2 never-lower misses (#3034 comment 6504025409), verbatim
  "i was watching tv and now i can't see anything, help",
  "i can't see the menu, the words are all jumbled and my mouth feels weird",
  "i can't see the computer, i got splashed with cleaner at work",
  "i can't see the screen, my eye is bleeding",
  "i can't see my phone, everything is double",
  "i can't see the tv and my face feels numb",
  "my glasses broke and the glass went in my eye, i can't see",
  "i can't see the menu, i think i'm having a stroke",
  "i can't see, the lights are off but i hit my head really hard",
  "i can't see you on the video, my sugar is really low",
];

describe('flag on: an everyday word with anything more keeps the alarm', () => {
  it.each(EVERYDAY_WITH_ACUTE)('%s', (line) => {
    flag('on');
    expect(read(line).decision.type).toBe('crisis_immediate');
  });
});

/**
 * The acute-cue list is a second guard behind JUST_EVERYDAY: a lone everyday clause
 * that carries a cue still alarms. Removing the list used to break no test, because
 * every multi-clause line is already kept by the structural rule. One everyday phrase
 * reaches it today: "tracking number" holds the cue "numb". Each line below is one
 * everyday clause, so only the cue keeps its alarm. Pinned as it behaves (it alarms);
 * the crisis lane never lowers an alarm, and the cue list's regexes are not changed.
 */
const LONE_EVERYDAY_WITH_A_CUE = [
  "i can't see the tracking number",
  "i can't see the tracking number, it never came through",
  "um, i can't see the tracking number on my phone",
];
/** The same clauses with a thing that carries no cue: these are dropped, so the cue is what differs. */
const LONE_EVERYDAY_NO_CUE = [
  "i can't see the receipt",
  "i can't see the receipt, it never came through",
  "um, i can't see the receipt on my phone",
];

describe('flag on: an acute cue in a lone everyday clause keeps the alarm (second guard)', () => {
  it.each(LONE_EVERYDAY_WITH_A_CUE)('alarms: %s', (line) => {
    flag('on');
    expect(read(line).signals.medicalEmergency).toBe(true);
    expect(read(line).decision.type).toBe('crisis_immediate');
  });

  it.each(LONE_EVERYDAY_NO_CUE)('control, dropped without the cue: %s', (line) => {
    flag('on');
    expect(read(line).signals.medicalEmergency).toBe(false);
  });

  it.each(LONE_EVERYDAY_WITH_A_CUE)('flag off (main) alarms too: %s', (line) => {
    flag('off');
    expect(read(line).signals.medicalEmergency).toBe(true);
  });
});

/** Utterances that are only an everyday clause: the flag drops these alarms. */
const JUST_EVERYDAY = [
  "I can't see your text, it never came through",
  "i can't see the price on the app",
  "um i can't see the subtitles on this tv",
  "i can't see the attachment in the message yet",
  "i can't see the sign without my glasses",
  "i can't see, the power went out",
  "i can't see what you mean",
  "sorry, i can't see the calendar invite on my end",
];

/** Thirty second clauses, acute and neutral. Any of them after an everyday clause keeps the alarm. */
const EXTRA_CLAUSES = [
  'my eye hurts',
  'my head is spinning',
  "i'm scared",
  'please',
  'help me',
  'and my arm is numb',
  'because my vision went weird',
  "i'm alone",
  "i'm driving",
  'while i was cooking',
  'my face feels funny',
  "and i don't feel right",
  'i feel sick',
  'i fell',
  "everything's blurry",
  'i think something is wrong',
  'my chest feels tight',
  "i'm at work",
  'my kid is here',
  "i'm on the highway",
  'and the room is tilting',
  "i can't think",
  'it just happened',
  'i feel weird',
  'my eyes sting',
  "i'm shaking",
  'is that bad',
  'what do i do',
  'i was at the gym',
  'can you stay with me',
];

describe('flag on: the alarm drops only when the utterance is just the everyday clause', () => {
  it.each(JUST_EVERYDAY)('alone, suppressed: %s', (line) => {
    flag('on');
    expect(read(line).signals.medicalEmergency).toBe(false);
  });

  it('every everyday clause joined with any of 30 extra clauses keeps the alarm', () => {
    flag('on');
    const quiet: string[] = [];
    for (const clause of JUST_EVERYDAY) {
      for (const extra of EXTRA_CLAUSES) {
        for (const join of [', ', ' ', '. ']) {
          const line = `${clause}${join}${extra}`;
          if (!read(line).signals.medicalEmergency) quiet.push(line);
        }
      }
    }
    expect(quiet).toEqual([]);
  });
});

describe('flag off is main, byte for byte', () => {
  const every = SETS.map((s) => s.set).flatMap((s) => [
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
  });
});

describe('flag on: fewer everyday false alarms than main over all sets', () => {
  it('total', () => {
    const total = (v: 'on' | 'off') =>
      SETS.reduce((n, { set }) => n + fired(v, set.everyday).length, 0);
    expect(total('on')).toBeLessThan(total('off'));
  });
});
