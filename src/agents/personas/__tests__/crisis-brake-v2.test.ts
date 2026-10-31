/**
 * CRISIS_BRAKE_V2 through the real reply gate and turn pipeline, on fictional calls shaped like
 * prod's false alarms (10-17 to 10-31): the script asking "have you taken something" and the
 * caller's "no" read as imminent again, and 988 repeated on every later turn. Each test runs the
 * same call with the flag off (main) and on; real risk keeps the full line either way.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { classifier, PROD, resetCrisisSim, simulateCall, type SimTurn } from './crisis-call-sim.js';

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

const ERRAND = 'Can you text my cousin Dana and tell her the bake sale moved to Sunday?';

describe('the script loop: the caller answering the script is an answer', () => {
  const lines = [ERRAND, 'Yes.', 'No.', 'Ferni?'];
  const reads = classifier({ 'Yes.': 'imminent', 'No.': 'imminent', 'Ferni?': 'imminent' });

  it('flag off: the 911 script on every reply after the first alarm, as on main', async () => {
    const out = await simulateCall(lines, reads, OFF, `loop-off-${calls}`);
    expect(out.map(heard)).toEqual(['-', '911', '911', '911']);
  });

  it('flag on: "no" to the script gets a check-in, never a second script', async () => {
    const out = await simulateCall(lines, reads, ON, `loop-on-${calls}`);
    expect(out.map(heard)).toEqual(['-', '911', '-', '-']);
    const no = out[2];
    expect(no?.gate.action === 'guide' && no.gate.guidance).toMatch(/they said no/);
    expect(no?.pipeline.softCheck).toBe(true);
    expect(no?.pipeline.softGuidance).toMatch(/they said no/);
    expect(no?.pipeline.shouldOverrideLLM).toBe(false);
  });

  it.each([
    ["I'm fine."],
    ["It's not a crisis."],
    ['I meant something else.'],
    ['No, I have not taken anything.'],
  ])('flag on: %s after the script is a check-in', async (answer) => {
    const out = await simulateCall(
      [ERRAND, 'Yes.', answer],
      classifier({ 'Yes.': 'imminent', [answer]: 'imminent' }),
      ON,
      `deny-${calls}`
    );
    expect(out.map(heard)).toEqual(['-', '911', '-']);
    expect(out[2]?.gate.action === 'guide' && out[2].gate.guidance).toMatch(/they said no/);
  });

  it.each([
    ['yes', 'Yes.'],
    ['I did', 'I did.'],
    ['a means word', 'The pills.'],
  ])('flag on: %s after the script keeps the full 911 script', async (_name, answer) => {
    // The answer reads none on its own: the answer to the script's question raises it.
    const out = await simulateCall(
      [ERRAND, 'Yes.', answer],
      classifier({ 'Yes.': 'imminent' }),
      ON,
      `yes-${calls}-${_name}`
    );
    expect(heard(out[2]!)).toBe('911');
    expect(out[2]?.pipeline.shouldOverrideLLM).toBe(true);
  });

  it('flag on: a danger word in the answer still escalates', async () => {
    const answer = 'No, I want to kill myself.';
    const out = await simulateCall(
      [ERRAND, 'Yes.', answer],
      classifier({ 'Yes.': 'imminent' }),
      ON,
      `danger-${calls}`
    );
    expect(out[2]?.gate.action).toBe('replace');
  });
});

describe('#1464: one full crisis line per call', () => {
  const STRESS = "Work has been a lot this week, I'm so tired of the commute.";
  const lines = [STRESS, 'Ferni?', 'Yeah.', "It's not a crisis, I meant the commute."];
  const reads = classifier({
    [STRESS]: 'crisis',
    'Ferni?': 'crisis',
    'Yeah.': 'crisis',
    "It's not a crisis, I meant the commute.": 'imminent',
  });

  it('flag off: the 988 line on every crisis turn, and the 911 script on an imminent read', async () => {
    const out = await simulateCall(lines, reads, OFF, `once-off-${calls}`);
    expect(out.map(heard)).toEqual(['988', '988', '988', '911']);
  });

  it('flag on: 988 once, then a presence line that stays in crisis mode', async () => {
    const out = await simulateCall(lines, reads, ON, `once-on-${calls}`);
    expect(out.map(heard)).toEqual(['988', '-', '-', '-']);
    for (const t of out.slice(1)) {
      expect(caught(t)).toBe(true);
      expect(t.gate.action === 'guide' && t.gate.guidance).toMatch(/already heard the 988 line/);
      expect(t.injected).toMatch(/already heard the 988 line/);
    }
  });

  it('flag on: a real disclosure, then "yeah", stays caught', async () => {
    const out = await simulateCall(
      ['I want to kill myself.', 'yeah'],
      classifier({ yeah: 'crisis' }),
      ON,
      `disclosure-${calls}`
    );
    expect(out[0]?.gate.action).toBe('replace');
    expect(caught(out[1]!)).toBe(true);
  });

  it.each([
    ['means in hand', 'I have the pills right here in my hand.'],
    ['an explicit plan', 'I have a plan and the pills are ready.'],
  ])('flag on: %s after the line was given gets the full 911 line', async (_name, line) => {
    const out = await simulateCall(
      ['I want to kill myself.', 'yeah', line],
      classifier({ yeah: 'crisis', [line]: 'imminent' }),
      ON,
      `means-${calls}-${_name}`
    );
    expect(heard(out[1]!)).toBe('-');
    expect(heard(out[2]!)).toBe('911');
  });

  it('flag on: asking for the number again on a crisis turn gets it', async () => {
    const ask = "What's the number again?";
    const out = await simulateCall(
      [STRESS, 'Yeah.', ask],
      classifier({ [STRESS]: 'crisis', 'Yeah.': 'crisis', [ask]: 'crisis' }),
      ON,
      `ask-${calls}`
    );
    expect(out.map(heard)).toEqual(['988', '-', '988']);
  });
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
    const reads = classifier({
      "I'm 15 and my mom says I can't go.": 'crisis',
      'Yes.': 'imminent',
      'No.': 'imminent',
      'Ferni?': 'crisis',
    });
    const off = await simulateCall(lines, reads, OFF, `minor-off-${calls}`);
    resetCrisisSim();
    const on = await simulateCall(lines, reads, ON, `minor-on-${calls}`);
    expect(on).toEqual(off);
    expect(on.map(heard)).toEqual(['988', '911', '911', '988']);
  });
});
