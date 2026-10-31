/**
 * CRISIS_BRAKE_V2's rules one at a time (the whole call is in
 * agents/personas/__tests__/crisis-brake-v2.test.ts). Every line is fictional.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { agreementOutcome, hasCallerRiskContent, hasRiskContent } from '../crisis-agreement.js';
import { crisisBrakeOn, resetCrisisBrake } from '../crisis-brake.js';
import type { CrisisVerdict } from '../crisis-classifier.js';
import {
  applyClassifierVerdict,
  buildCrisisGuidance,
  detectCrisis,
  guardFromDetection,
} from '../crisis-guard.js';
import { combineReads, resetImminentAgreement } from '../crisis-imminent-agreement.js';
import { asksForNumber, LINE_GIVEN, withLineOnce } from '../crisis-line-once.js';
import { scriptAnswer } from '../crisis-script-answer.js';

const ON = { CRISIS_BRAKE_V2: 'on' };
const OFF = { CRISIS_BRAKE_V2: 'off' };
const CRISIS: CrisisVerdict = { risk: 'crisis', subject: 'self' };
const NONE: CrisisVerdict = { risk: 'none', subject: 'self' };
const IMMINENT: CrisisVerdict = { risk: 'imminent', subject: 'self' };
/** The 911 script, as an imminent read gives it. */
const SCRIPT = applyClassifierVerdict(detectCrisis('Okay.'), IMMINENT).suggestedResponse ?? '';

let n = 0;
beforeEach(() => {
  resetCrisisBrake();
  resetImminentAgreement();
  n++;
});

describe('the agreement gate scans only the caller, and everyday words only in risk phrases', () => {
  const companion = "You don't have to carry this alone, and I'm right here.";
  const turn = (env: Record<string, string>, extra: Record<string, unknown> = {}) =>
    agreementOutcome({
      pattern: 'none',
      verdicts: [CRISIS],
      latest: 'Why alone?',
      earlier: [],
      companion,
      env,
      call: `agree-${n}`,
      ...extra,
    });

  it('off: a risk word in Ferni\'s line or the caller\'s "alone" escalates, as on main', () => {
    expect(turn(OFF)).toBe('escalate');
    expect(turn({})).toBe('escalate');
  });

  it("on: Ferni's own words no longer count, and a bare 'alone' is not risk", () => {
    expect(turn(ON)).toBe('soft');
  });

  it('on: risk words only Ferni said (its own crisis reply) do not keep the gate from easing', () => {
    const own = 'Thoughts of suicide are heavy to carry, and you can call or text 988.';
    const ferni = { latest: 'Ferni?', companion: own };
    expect(turn(OFF, ferni)).toBe('escalate');
    expect(turn(ON, ferni)).toBe('presence');
  });

  it('on: two reads of the same turn are not agreement', () => {
    expect(turn(OFF, { verdicts: [CRISIS, CRISIS] })).toBe('escalate');
    expect(turn(ON, { verdicts: [CRISIS, CRISIS] })).toBe('soft');
  });

  it("on: the caller's earlier risk words still escalate", () => {
    expect(turn(ON, { earlier: ['I want to kill myself.'] })).toBe('escalate');
    expect(turn(ON, { earlier: ['I keep thinking everyone is better off without me.'] })).toBe(
      'escalate'
    );
  });

  it('on: an imminent read, a missing read or no call never softens', () => {
    expect(turn(ON, { verdicts: [IMMINENT] })).toBe('escalate');
    expect(turn(ON, { verdicts: [null] })).toBe('escalate');
    expect(turn(ON, { call: undefined })).toBe('escalate');
  });

  it.each([
    ['bye', 'Okay, bye.'],
    ['done', "I'm done for today."],
    ['point', 'Good point.'],
    ['live', 'I live in Tampa.'],
    ['sleep', 'I need some sleep.'],
    ['alone', 'I went alone.'],
    ['tonight', "We're getting pizza tonight."],
  ])('on: %s alone is everyday', (_word, line) => {
    expect(hasRiskContent(line)).toBe(true);
    expect(hasCallerRiskContent(line)).toBe(false);
  });

  it.each([
    "I don't want to live anymore.",
    'I just want to sleep forever.',
    "What's the point of living?",
    "I'm feeling so alone.",
    "I'm done with life.",
    "I'm going to end it tonight.",
    'This is goodbye.',
    'I feel so hopeless.',
    'Ich will sterben.',
    'Lo siento 💔',
  ])('on: inside a risk phrase it still counts: %s', (line) => {
    expect(hasCallerRiskContent(line)).toBe(true);
  });

  it('whole words: "alone" never hides inside another word, nor risk inside an everyday one', () => {
    expect(hasCallerRiskContent('I watched Home Alone.')).toBe(false);
    expect(hasCallerRiskContent('That was pointless.')).toBe(true);
  });
});

describe('an imminent read needs agreement: the flag implies CRISIS_IMMINENT_NEEDS_AGREEMENT', () => {
  const split = (env: Record<string, string>, call = `split-${n}`) =>
    combineReads({
      ruled: IMMINENT,
      plain: NONE,
      pattern: 'none',
      latest: "Okay, I'm done for tonight, bye.",
      earlier: [],
      call,
      env,
    });

  it('off: the split imminent / none keeps imminent (the 911 script)', () => {
    expect(split(OFF)?.risk).toBe('imminent');
  });

  it('on: the split gives crisis guidance, never the script', () => {
    expect(split(ON)?.risk).toBe('crisis');
  });

  it('on: both reads imminent keep imminent', () => {
    const both = combineReads({
      ruled: IMMINENT,
      plain: IMMINENT,
      pattern: 'none',
      latest: 'Okay, bye.',
      earlier: [],
      call: `both-${n}`,
      env: ON,
    });
    expect(both?.risk).toBe('imminent');
  });
});

describe("the script's own question: the next short answer is an answer", () => {
  const answer = (latest: string, env: Record<string, string> = ON, companion = SCRIPT) =>
    scriptAnswer({ latest, companion, earlier: [], call: `answer-${n}`, env });

  it('the 911 script asks the question this reads', () => {
    expect(SCRIPT).toMatch(/taken something/);
  });

  it.each([
    'Yes.',
    'Yeah',
    'I did.',
    'I took them.',
    'The pills.',
    'Kind of.',
    'No, just the bottle.',
  ])('yes: %s', (line) => {
    expect(answer(line)).toBe('yes');
  });

  it.each([
    'No.',
    'Nope.',
    "No, I'm fine.",
    "I'm fine.",
    "It's not a crisis.",
    'I meant something else.',
    'No, I have not taken anything.',
    'I meant the bake sale.',
  ])('no: %s', (line) => {
    expect(answer(line)).toBe('no');
  });

  it.each([
    ['a danger word', "No, but I can't do this anymore."],
    ['a risk phrase', 'No, I just want to sleep forever.'],
    ['an ending word', 'No, I meant goodbye.'],
    ['a risk word in a closed-set no', 'No, I meant the bridge.'],
    ['a held word in a closed-set no', "I'm fine, I meant the note."],
    ['a question', 'No?'],
    ['a hesitant no', 'Um, no...'],
    [
      'a long answer',
      'No, I mean, it is a long story about my week and how my boss keeps calling.',
    ],
    ['something else', 'Ferni?'],
  ])('neither, so the reads decide: %s', (_name, line) => {
    expect(answer(line)).toBeNull();
  });

  it('only after the script asked it, only with the flag on', () => {
    expect(answer('No.', ON, 'Okay, tell me more.')).toBeNull();
    expect(answer('No.', OFF)).toBeNull();
    expect(answer('No.', {})).toBeNull();
  });
});

describe('#1464: the crisis line once per call', () => {
  const STRESS = detectCrisis('Honestly, nobody would even notice if I was gone.');
  const plain = detectCrisis('Okay.');
  const turn = (over: Record<string, unknown> = {}) => ({
    call: `line-${n}`,
    latest: 'Yeah.',
    earlier: [],
    ferni: ['I hear you. You can call or text 988, any time.'],
    patterns: plain,
    env: ON,
    ...over,
  });
  const crisisRead = { ...plain, isCrisis: true, severity: 0.9, subject: 'self' as const };

  it('the line not yet heard: unchanged', () => {
    const t = turn({ ferni: ['Okay, tell me more.'] });
    expect(withLineOnce(crisisRead, t)).toBe(crisisRead);
  });

  it('heard once on this call: later crisis turns stay in crisis mode, without the line', () => {
    withLineOnce(plain, turn()); // Ferni's 988 line, noted on a turn with no risk
    const later = withLineOnce(crisisRead, turn({ ferni: ['Okay.'] }));
    expect(later.indicators).toContain(LINE_GIVEN);
    expect(later.isCrisis).toBe(true);
    expect(guardFromDetection(later).shouldBlock).toBe(false);
    const guidance = buildCrisisGuidance(later);
    expect(guidance).toMatch(/already heard the 988 line/);
    expect(guidance).not.toMatch(/Include the 988/);
  });

  it.each([
    ['explicit words', 'I want to kill myself.'],
    ['means in hand', 'I have the pills right here in my hand.'],
    ['an explicit plan', "Tonight's the night."],
    ['a means form', "I'm holding the gun right now."],
  ])('new risk always gets the full line: %s', (_name, latest) => {
    const t = turn({ latest, patterns: detectCrisis(latest) });
    expect(withLineOnce(crisisRead, t).indicators).not.toContain(LINE_GIVEN);
  });

  it('asking for the number again gets it', () => {
    const t = turn({ latest: "What's the number again?" });
    expect(withLineOnce(crisisRead, t).indicators).not.toContain(LINE_GIVEN);
  });

  it.each([
    "What's the number again?",
    'What was that number?',
    'Can you say the hotline number again?',
    "What's the crisis line?",
    '988 again?',
  ])('asks for the number: %s', (line) => {
    expect(asksForNumber(line)).toBe(true);
  });

  it.each([
    "What's the number for the pizza place?",
    'Send me the number for the plumber again.',
    'What line are we in?',
  ])('does not ask for the crisis line: %s', (line) => {
    expect(asksForNumber(line)).toBe(false);
  });

  it('a worry about someone else, the flag off, or no call: unchanged', () => {
    withLineOnce(plain, turn());
    const other = { ...crisisRead, subject: 'third_party' as const };
    expect(withLineOnce(other, turn())).toBe(other);
    expect(withLineOnce(crisisRead, turn({ env: OFF }))).toBe(crisisRead);
    expect(withLineOnce(crisisRead, turn({ call: undefined }))).toBe(crisisRead);
  });

  it('a guidance without the indicator is the guidance on main', () => {
    expect(buildCrisisGuidance(STRESS)).toMatch(/Include the 988/);
  });
});

describe('minors (MINOR_CARE): the brake never applies', () => {
  it('a caller who says they are under 18, now or earlier on the call', () => {
    const call = `minor-${n}`;
    expect(crisisBrakeOn(ON, call, ['Okay.'])).toBe(true);
    expect(crisisBrakeOn(ON, call, ["I'm 14."])).toBe(false);
    expect(crisisBrakeOn(ON, call, ['Okay.'])).toBe(false); // the rest of the call
  });

  it('every rule falls back to main for them', () => {
    const call = `minor-rules-${n}`;
    const earlier = ["I'm 15 and in ninth grade."];
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [CRISIS],
        latest: 'Why alone?',
        earlier,
        companion: "You don't have to carry this alone.",
        env: ON,
        call,
      })
    ).toBe('escalate');
    expect(scriptAnswer({ latest: 'No.', companion: SCRIPT, earlier, call, env: ON })).toBeNull();
    const split = combineReads({
      ruled: IMMINENT,
      plain: NONE,
      pattern: 'none',
      latest: 'Okay, bye.',
      earlier,
      call,
      env: ON,
    });
    expect(split?.risk).toBe('imminent');
  });
});
