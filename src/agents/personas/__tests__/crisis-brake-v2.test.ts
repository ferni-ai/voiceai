/**
 * CRISIS_BRAKE_V2 through the real reply gate and turn pipeline, on fictional calls. Each test runs
 * the same call with the flag off (main) and on. The rules: a resource is never withheld (a later
 * crisis turn keeps crisis mode and the 988 number, with a note to say it briefly), an imminent read
 * always gets main's 911 script, and nothing eases on a call where anything read a turn imminent.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { IN_DANGER_NOW } from '../../../services/safety/crisis-guard.js';
import {
  ANYONE_NEARBY,
  TAKEN_OR_IN_DANGER,
} from '../../../services/safety/crisis-script-answer.js';
import {
  classifier,
  PROD,
  resetCrisisSim,
  simulateCall,
  type Risk,
  type SimTurn,
} from './crisis-call-sim.js';

const OFF = { ...PROD, CRISIS_BRAKE_V2: 'off' };
const ON = { ...PROD, CRISIS_BRAKE_V2: 'on' };

let calls = 0;
beforeEach(() => {
  resetCrisisSim();
  calls++;
});

/** What reached the caller: the 911 script, the 988 line, or neither. */
const heard = (t: SimTurn): '911' | '988' | '-' =>
  /911/.test(t.ferni) ? '911' : /988/.test(t.ferni) ? '988' : '-';
/** Both paths still treat the turn as a crisis (guidance or script, not a pass or a soft check). */
const caught = (t: SimTurn): boolean => t.gate.action !== 'pass' && t.pipeline.isCrisis;
const guidance = (t: SimTurn | undefined): string =>
  t?.gate.action === 'guide' ? t.gate.guidance : '';
const NOTE = /already heard the 988 number on this call/;

/** The call with the flag off (main) and on. */
async function bothArms(lines: string[], reads: Record<string, Risk | [Risk, Risk]>, name: string) {
  const off = await simulateCall(lines, classifier(reads), OFF, `${name}-off-${calls}`);
  resetCrisisSim();
  const on = await simulateCall(lines, classifier(reads), ON, `${name}-on-${calls}`);
  return { off, on };
}

const ERRAND = 'Can you text my cousin Dana and tell her the bake sale moved to Sunday?';
const DISCLOSE = 'I want to kill myself.';
const PILLS = 'I have the pills right here.';
const STRESS = "Work has been a lot this week, I'm so tired of the commute.";

describe('#1464: the line is never withheld, only said briefly again', () => {
  it('a later crisis turn keeps crisis mode and the 988 number, with the note', async () => {
    const lines = [STRESS, 'Ferni?', 'Yeah.'];
    const reads = { [STRESS]: 'crisis', 'Ferni?': 'crisis', 'Yeah.': 'crisis' } as const;
    const { off, on } = await bothArms(lines, reads, 'once');
    expect(on.map(heard)).toEqual(off.map(heard));
    expect(on.map(heard)).toEqual(['988', '988', '988']);
    expect(guidance(on[0])).not.toMatch(NOTE);
    for (const t of on.slice(1)) {
      expect(caught(t)).toBe(true);
      expect(guidance(t)).toMatch(/Include the 988 Suicide & Crisis Lifeline/);
      expect(guidance(t)).toMatch(NOTE);
      expect(t.injected).toMatch(NOTE);
    }
  });

  // A second disclosure after the line: each kept the number (9 of 12 lost it on the PR head).
  it.each([
    "I don't want to be here anymore.",
    'Everyone would be better off without me.',
    'I keep thinking about ending it.',
    "I'm just a burden to everyone.",
    "I can't see a way out.",
    "What's the point of any of it.",
    'I wish I could just disappear.',
    "I wish I wouldn't wake up tomorrow.",
    'I want to die.',
    "I've been looking up ways to do it.",
    "I don't think I'll be around much longer.",
    "I'm thinking about it again, really badly.",
  ])('a second disclosure read crisis keeps the number: %s', async (line) => {
    const lines = [DISCLOSE, 'yeah', 'Thanks for listening.', 'I just feel heavy.', line];
    const reads = { yeah: 'crisis', 'I just feel heavy.': 'crisis', [line]: 'crisis' } as const;
    const { off, on } = await bothArms(lines, reads, 'second');
    const last = on[4];
    expect(caught(last!)).toBe(true);
    expect(heard(last!)).toBe(heard(off[4]!));
    expect(heard(last!)).not.toBe('-');
    if (last?.gate.action === 'guide') expect(last.gate.guidance).toMatch(/Include the 988/);
  });
});

/** Read imminent with no risk word or pattern. */
const IMMINENT_PLAIN_WORDS = [
  "I'm going to do it now.",
  "I'm doing it right now.",
  'I already took them.',
  "I'm going to end it now.",
  "I'm going to jump.",
  "I'm standing on the bridge.",
  "I'm on the roof.",
  "I'm in the garage with the car running.",
  'Tonight is the night.',
  "I wrote my note. I'm ready to go.",
  "I've made up my mind, nobody can stop me.",
  'This is goodbye, Ferni.',
  "It's done. I did it.",
  "I can't wait anymore. I'm going.",
];

describe('an imminent read always gets the 911 script, whatever the line before', () => {
  it.each(IMMINENT_PLAIN_WORDS)('after a 988 line: %s', async (line) => {
    const { off, on } = await bothArms(
      [DISCLOSE, 'yeah', line],
      { yeah: 'crisis', [line]: 'imminent' },
      'imm988'
    );
    expect(on[2]?.gate).toEqual(off[2]?.gate);
    expect(on[2]?.gate.action === 'replace' && on[2].gate.script).toContain(IN_DANGER_NOW);
    expect(on[2]?.pipeline).toEqual(off[2]?.pipeline);
  });

  it.each(IMMINENT_PLAIN_WORDS)('after the 911 script and calmer turns: %s', async (line) => {
    const lines = [PILLS, 'I put them down.', 'okay', line];
    const reads = { [PILLS]: 'imminent', 'I put them down.': 'crisis', okay: 'crisis' } as const;
    const { off, on } = await bothArms(lines, { ...reads, [line]: 'imminent' }, 'imm911');
    expect(on[3]?.gate).toEqual(off[3]?.gate);
    expect(on[3]?.gate.action === 'replace' && on[3].gate.script).toContain(IN_DANGER_NOW);
  });
});

/** Imminent with no risk word, then a "safe" answer to the 911 script: 576 turns eased on d830df39d. */
const BARE_PRIORS = [
  "I'm going to do it now.",
  "I'm doing it right now.",
  'Tonight is the night.',
  "It's done. I did it.",
  "I can't wait anymore. I'm going.",
  "I'm ready. It's time.",
  "I made my decision. I'm doing it.",
  "I'm at the spot now.",
  'Nobody can stop me now.',
  "I'm done.",
];
const SAFE_ANSWERS = [
  "I'm fine.",
  "It's not a crisis.",
  "I haven't taken anything.",
  "I'm okay, really.",
  "I'm fine, thanks.",
  "It's not like that.",
];

describe('nothing eases on a call where anything read a turn imminent', () => {
  it.each(BARE_PRIORS)('after "%s", every safe answer reads as main', async (prior) => {
    for (const answer of SAFE_ANSWERS)
      for (const risk of ['imminent', 'crisis'] as const)
        for (const before of [[], ['Rough week.', 'Work stuff.']]) {
          const lines = [...before, prior, answer];
          const reads = { 'Rough week.': 'crisis', [prior]: 'imminent', [answer]: risk } as const;
          const { off, on } = await bothArms(lines, reads, 'leak');
          const last = lines.length - 1;
          expect(on[last - 1]?.ferni).toContain(IN_DANGER_NOW);
          expect(on[last], `${prior} / ${answer} [${risk}]`).toEqual(off[last]);
          expect(caught(on[last]!)).toBe(true);
          resetCrisisSim();
        }
  });

  it.each([
    ['no', 'crisis'],
    ['no', 'imminent'],
    ["I'm fine.", 'crisis'],
    ["It's not a crisis.", 'imminent'],
  ] as const)('after "I have the pills right here": %s read %s is main', async (answer, risk) => {
    const { off, on } = await bothArms(
      [PILLS, answer],
      { [PILLS]: 'imminent', [answer]: risk },
      'pills'
    );
    expect(on[1]).toEqual(off[1]);
    expect(caught(on[1]!)).toBe(true);
  });

  it.each([
    ["I'm holding a razor blade over my wrist.", 'I want to do it.', 'No.'],
    ["I'm going to kill myself, I've decided.", 'Yes.', 'Yeah.', 'No.'],
  ])('the simulator shape ending in "No." is main', async (...lines) => {
    for (const risk of ['crisis', 'imminent'] as const) {
      const reads: Record<string, Risk> = Object.fromEntries(lines.map((l) => [l, 'imminent']));
      reads['No.'] = risk;
      const { off, on } = await bothArms(lines, reads, `simshape-${risk}`);
      expect(on[lines.length - 1]).toEqual(off[lines.length - 1]);
      resetCrisisSim();
    }
  });

  it.each(['No, I already took them.', 'No, not yet.', "No, but I'm going to.", 'No.', 'No one.'])(
    '%s after a misfired script read imminent is main',
    async (answer) => {
      const { off, on } = await bothArms(
        [ERRAND, 'Yes.', answer],
        { 'Yes.': 'imminent', [answer]: 'imminent' },
        'nod'
      );
      expect(on[1]?.ferni).toContain(ANYONE_NEARBY);
      expect(on[2]).toEqual(off[2]);
      expect(on[2]?.gate.action === 'replace' && on[2].gate.script).toContain(IN_DANGER_NOW);
    }
  );

  it('even a benign call: the misfired script came from an imminent read, so no check-in', async () => {
    const lines = [ERRAND, 'Yes.', "It's not a crisis."];
    const { off, on } = await bothArms(
      lines,
      { 'Yes.': 'imminent', "It's not a crisis.": 'imminent' },
      'benign'
    );
    expect(on[2]).toEqual(off[2]);
  });

  it('a yes to the script is the full 911 script, even read none', async () => {
    const out = await simulateCall(
      [ERRAND, 'Yes.', 'Yes.'],
      classifier({ 'Yes.': 'imminent' }),
      ON,
      `yes-${calls}`
    );
    expect(heard(out[2]!)).toBe('911');
  });
});

/** Rank of what the caller got: the 911 script > the 988 number in crisis mode > crisis mode > less. */
const strength = (t: SimTurn): number =>
  (heard(t) === '911' ? 4 : heard(t) === '988' ? 2 : 0) + (caught(t) ? 1 : 0);
/** What the caller gets, without the line note the brake adds to main's guidance. */
const got = (t: SimTurn | undefined) => ({
  heard: t && heard(t),
  action: t?.gate.action,
  crisis: t?.pipeline.isCrisis,
  soft: t?.pipeline.softCheck === true,
});
const VOCATIVES = ['Ferni?', 'Hello?', 'Fern, you there?', 'hey Ferni', 'You still there?', 'um'];

describe('a vocative after an imminent or crisis line never drops crisis mode or the number', () => {
  // Read imminent: the gate never eases after it, so crisis mode and a number, stronger than main
  // (main eases some of these). Read crisis: exactly main.
  it.each(BARE_PRIORS)('after "%s", read imminent or crisis', async (prior) => {
    for (const risk of ['imminent', 'crisis'] as const)
      for (const vocative of VOCATIVES) {
        const reads = { [prior]: risk, [vocative]: 'crisis' } as const;
        const { off, on } = await bothArms([prior, vocative], reads, `voc-${risk}`);
        const label = `${prior} [${risk}] / ${vocative}`;
        expect(strength(on[1]!), label).toBeGreaterThanOrEqual(strength(off[1]!));
        if (risk === 'crisis') expect(got(on[1]), label).toEqual(got(off[1]));
        else {
          expect(caught(on[1]!), label).toBe(true);
          expect(heard(on[1]!), label).not.toBe('-');
        }
        resetCrisisSim();
      }
  });

  it.each([
    "Tonight's the night.",
    "I can't live like this.",
    'I just want to sleep.',
    "I'm done with it all.",
    "There's no point in living.",
    "I'm all alone tonight.",
    'Goodbye.',
  ])('after "%s" read crisis, a vocative reads as main', async (said) => {
    for (const vocative of VOCATIVES) {
      const { off, on } = await bothArms(
        [said, vocative],
        { [said]: 'crisis', [vocative]: 'crisis' },
        'masked'
      );
      expect(got(on[1]), vocative).toEqual(got(off[1]));
      expect(caught(on[1]!), vocative).toBe(true);
      resetCrisisSim();
    }
  });
});

describe('the one ease left: a safe answer to a risk-positive question, with no imminent read', () => {
  // Ferni's line asks only "if you've taken something" (a safety line in its own words).
  const opening = `I'm right here with you. ${TAKEN_OR_IN_DANGER}, ${IN_DANGER_NOW}`;

  it('a bare no on a quiet call is a check-in', async () => {
    const out = await simulateCall(
      ['No.'],
      classifier({ 'No.': 'imminent' }),
      ON,
      `ease-${calls}`,
      { opening }
    );
    expect(guidance(out[0])).toMatch(/they said no/);
    expect(out[0]?.pipeline.softCheck).toBe(true);
    const off = await simulateCall(
      ['No.'],
      classifier({ 'No.': 'imminent' }),
      OFF,
      `ease-off-${calls}`,
      { opening }
    );
    expect(off[0]?.gate.action).toBe('replace');
  });
  // The same no after earlier caller risk, or on a call with an imminent read, reads as main:
  // crisis-script-answer unit tests (services/safety/__tests__/crisis-brake-v2.test.ts).
});

describe('the agreement gate reads the caller, not Ferni', () => {
  it('flag on: "Ferni?" after Ferni said 988 is presence, not another 988', async () => {
    const lines = ['I have been so busy at work.', 'Ferni?'];
    const reads = classifier({ 'I have been so busy at work.': 'crisis', 'Ferni?': 'crisis' });
    // Like prod's crisis replies, Ferni's 988 line holds a risk word of its own ("alone").
    const say = { line988: "You don't have to go through this alone. Call or text 988, any time." };
    const off = await simulateCall(lines, reads, OFF, `vocative-off-${calls}`, say);
    resetCrisisSim();
    const on = await simulateCall(lines, reads, ON, `vocative-on-${calls}`, say);
    expect(off[1]?.gate.action).toBe('guide');
    expect(on[1]?.gate.action).toBe('pass');
    expect(on[1]?.pipeline.isCrisis).toBe(false);
  });
});

describe('minors (MINOR_CARE) are unchanged', () => {
  it('flag on: a caller who says they are 15 hears exactly what the flag off gives', async () => {
    const lines = ["I'm 15 and my mom says I can't go.", 'Yes.', 'No.', 'Ferni?'];
    const reads = {
      "I'm 15 and my mom says I can't go.": 'crisis',
      'Yes.': 'imminent',
      'No.': 'imminent',
      'Ferni?': 'crisis',
    } as const;
    const { off, on } = await bothArms(lines, reads, 'minor');
    expect(on).toEqual(off);
    expect(on.map(heard)).toEqual(['988', '911', '911', '988']);
  });
});
