/**
 * CRISIS_BRAKE_V2's rules one at a time (the whole call is in
 * agents/personas/__tests__/crisis-brake-v2.test.ts). Every line is fictional.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { agreementOutcome } from '../crisis-agreement.js';
import { crisisBrakeOn, resetCrisisBrake } from '../crisis-brake.js';
import type { CrisisVerdict } from '../crisis-classifier.js';
import {
  applyClassifierVerdict,
  buildCrisisGuidance,
  detectCrisis,
  guardFromDetection,
  IN_DANGER_NOW,
} from '../crisis-guard.js';
import {
  imminentReadThisCall,
  noteImminentRead,
  resetCrisisCallRisk,
} from '../crisis-call-risk.js';
import { combineReads, resetImminentAgreement } from '../crisis-imminent-agreement.js';
import { crisisGuidanceOnce, LINE_GIVEN, withLineOnce } from '../crisis-line-once.js';
import {
  ANYONE_NEARBY,
  briefTurn,
  scriptAnswer,
  TAKEN_OR_IN_DANGER,
} from '../crisis-script-answer.js';

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
  resetCrisisCallRisk();
  n++;
});

describe("the agreement gate scans only the caller's words, with main's risk words", () => {
  const companion = "You don't have to carry this alone, and I'm right here.";
  type Turn = Parameters<typeof agreementOutcome>[0] & { call?: string };
  /** As the gate calls it: the brake read for this call (briefTurn), then the outcome. */
  const turn = (env: Record<string, string>, extra: Partial<Turn> = {}) => {
    const t: Turn = { pattern: 'none', verdicts: [CRISIS], latest: 'Why?', earlier: [] };
    const { call, ...args } = { ...t, companion, call: `agree-${n}`, ...extra };
    const on = crisisBrakeOn(env, call, [args.latest, ...(args.earlier ?? [])]);
    const brake = on
      ? imminentReadThisCall(call)
        ? ('hold' as const)
        : ('ease' as const)
      : undefined;
    return agreementOutcome({ ...args, brake });
  };

  it("off: a risk word in Ferni's line escalates, as on main", () => {
    expect(turn(OFF)).toBe('escalate');
    expect(turn({})).toBe('escalate');
  });

  it("on: Ferni's own words no longer count", () => {
    expect(turn(ON)).toBe('soft');
    const own = 'Thoughts of suicide are heavy to carry, and you can call or text 988.';
    expect(turn(OFF, { latest: 'Ferni?', companion: own })).toBe('escalate');
    expect(turn(ON, { latest: 'Ferni?', companion: own })).toBe('presence');
  });

  it('on: two reads of the same turn are not agreement', () => {
    expect(turn(OFF, { verdicts: [CRISIS, CRISIS] })).toBe('escalate');
    expect(turn(ON, { verdicts: [CRISIS, CRISIS] })).toBe('soft');
  });

  // Every word main's list holds counts, alone or in a phrase: masking "tonight" or "live" deleted
  // the phrase it completed, and a vocative after it eased (verify of 5b6a342c6).
  it.each([
    "Tonight's the night.",
    'Tonight is the night.',
    "I can't live like this.",
    'I just want to sleep.',
    "I'm done.",
    'Goodbye.',
    'Bye, everyone.',
    "There's no point.",
    "I'm all alone tonight.",
    "I'm done living.",
  ])('on: the caller saying "%s" never eases a later vocative', (said) => {
    expect(turn(ON, { latest: 'Ferni?', earlier: [said] })).toBe('escalate');
    expect(turn(ON, { latest: said })).toBe('escalate');
  });

  it("on: the caller's earlier risk words still escalate", () => {
    expect(turn(ON, { earlier: ['I want to kill myself.'] })).toBe('escalate');
    expect(turn(ON, { earlier: ['I keep thinking everyone is better off without me.'] })).toBe(
      'escalate'
    );
  });

  it('on: once a turn on the call was read imminent, nothing eases', () => {
    expect(turn(ON, { latest: 'Ferni?' })).toBe('presence');
    noteImminentRead(`agree-${n}`);
    expect(turn(ON, { latest: 'Ferni?' })).toBe('escalate');
    expect(turn(ON)).toBe('escalate');
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [CRISIS],
        latest: 'Why?',
        companion,
        brake: 'hold',
      })
    ).toBe('escalate');
  });

  it('on: an imminent read, a missing read or no call never softens', () => {
    expect(turn(ON, { verdicts: [IMMINENT] })).toBe('escalate');
    expect(turn(ON, { verdicts: [null] })).toBe('escalate');
    expect(turn(ON, { call: undefined })).toBe('escalate');
  });
});

describe('the brake never touches a split read: CRISIS_IMMINENT_NEEDS_AGREEMENT is its own flag', () => {
  const AGREE = { CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on' };
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

  it('a split imminent / none keeps imminent (the 911 script), brake off or on, as in prod', () => {
    expect(split(OFF)?.risk).toBe('imminent');
    expect(split(ON, `split-on-${n}`)?.risk).toBe('imminent');
  });

  it('with CRISIS_IMMINENT_NEEDS_AGREEMENT on, the brake changes nothing either way', () => {
    expect(split(AGREE, `agree-alone-${n}`)?.risk).toBe('crisis');
    expect(split({ ...AGREE, ...ON }, `agree-brake-${n}`)?.risk).toBe('crisis');
    noteImminentRead(`agree-noted-${n}`);
    expect(split({ ...AGREE, ...ON }, `agree-noted-${n}`)?.risk).toBe('crisis');
  });

  it('either read imminent is noted for the call', () => {
    const call = `noted-${n}`;
    expect(imminentReadThisCall(call)).toBe(false);
    expect(split(ON, call)?.risk).toBe('imminent');
    expect(imminentReadThisCall(call)).toBe(true);
  });

  it('both reads imminent keep imminent', () => {
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

describe('an imminent read on the call blocks every ease; no turn is told apart by its words', () => {
  /** A split read of `latest` (ruled imminent, plain none) on this call, flag on. */
  const split = (call: string, latest: string) =>
    combineReads({
      ruled: IMMINENT,
      plain: NONE,
      pattern: 'none',
      latest,
      earlier: [],
      call,
      env: ON,
    });
  const brakeOf = (call: string, latest: string) =>
    briefTurn({ latest, earlier: [], call, env: ON, ferni: [] }).brake;

  it('a caller repeating the exact imminent line: the repeat never eases', () => {
    const call = `repeat-${n}`;
    noteImminentRead(call); // the first time the line was read imminent
    expect(split(call, "I'm going to do it now.")?.risk).toBe('imminent');
    expect(brakeOf(call, "I'm going to do it now.")).toBe('hold');
  });

  it.each([
    ['Spanish', 'Voy a hacerlo ahora.', 'Estoy bien.'],
    ['Arabic', 'سأفعلها الآن', 'أنا بخير'],
  ])('a %s imminent line, then a safe answer in it: no easing', (_lang, imminent, safe) => {
    const call = `lang-${n}`;
    // An imminent read of the line, as the guard or the classifier gives it (no agreed split).
    const read = applyClassifierVerdict(detectCrisis(imminent), IMMINENT);
    withLineOnce(read, { call, latest: imminent, earlier: [], ferni: [], env: ON });
    expect(split(call, safe)?.risk).toBe('imminent');
    expect(brakeOf(call, safe)).toBe('hold');
    const answer = { latest: safe, companion: SCRIPT, earlier: [imminent], call, env: ON };
    expect(scriptAnswer(answer)).not.toBe('safe');
  });

  it('an emoji-only turn after an imminent read: no easing', () => {
    const call = `emoji-${n}`;
    noteImminentRead(call);
    expect(split(call, '🙂')?.risk).toBe('imminent');
    expect(split(call, '🙏🙏')?.risk).toBe('imminent');
    expect(brakeOf(call, '🙂')).toBe('hold');
  });

  it('with no turn id, any imminent read noted blocks easing; with no call, nothing eases', () => {
    const call = `noid-${n}`;
    expect(imminentReadThisCall(call)).toBe(false);
    noteImminentRead(call);
    expect(imminentReadThisCall(call)).toBe(true);
    expect(split(call, 'Okay, bye.')?.risk).toBe('imminent');
    expect(imminentReadThisCall(undefined)).toBe(true);
    expect(brakeOf('', "I'm fine.")).toBeUndefined(); // no call: the brake is off, main's reads
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
  ])('risk, the full script: %s', (line) => {
    expect(answer(line)).toBe('risk');
  });

  it.each([
    "I'm fine.",
    "It's not a crisis.",
    'I meant something else.',
    'No, I have not taken anything.',
    'I meant the bake sale.',
    // "I did" and "I have" are risk answers, never their negations
    'I did not take anything.',
    "I didn't take anything.",
    'I have not taken anything.',
  ])('safe, a check-in: %s', (line) => {
    expect(answer(line)).toBe('safe');
  });

  it.each(['No.', 'Nope.', 'No one.', 'Nobody.', "No, I'm fine.", 'Nope, nobody is here.'])(
    'a no to "is anyone nearby" is being alone, never eased: %s',
    (line) => {
      expect(answer(line)).toBe('main');
    }
  );

  it.each([
    ['a danger word', "No, but I can't do this anymore."],
    ['a risk phrase', 'No, I just want to sleep forever.'],
    ['an ending word', 'No, I meant goodbye.'],
    ['a risk word in a closed-set no', 'No, I meant the bridge.'],
    ['a held word in a closed-set no', "I'm fine, I meant the note."],
    ['a question', 'No?'],
    ['a hesitant no', 'Um, no...'],
    ['something else', 'Ferni?'],
  ])('carries risk, a question or a hesitation: main, never eased or held: %s', (_name, line) => {
    expect(answer(line)).toBe('main');
  });

  it('a long answer is not a short answer to the script: the reads decide', () => {
    const long = 'No, I mean, it is a long story about my week and how my boss keeps calling.';
    expect(answer(long)).toBeNull();
  });

  it.each([
    ['explicit words', 'I want to kill myself.'],
    ['means in hand', 'I have the pills right here.'],
    ['a razor', "I'm holding a razor blade over my wrist."],
    ['a decision', "I'm going to kill myself, I've decided."],
  ])('a safe answer after the caller said risk (%s) reads as main', (_name, said) => {
    for (const latest of ['No.', "I'm fine.", "It's not a crisis."]) {
      const turn = { latest, companion: SCRIPT, earlier: [said], call: `risk-${n}`, env: ON };
      expect(scriptAnswer(turn)).toBe('main');
      expect(scriptAnswer({ ...turn, earlier: [said, 'Yes.', 'Yeah.'] })).toBe('main');
    }
  });

  it('a safe answer on a call whose caller said no risk is a check-in; a bare no is not', () => {
    const earlier = ['Can you text my cousin that the bake sale moved?', 'Yes.'];
    const turn = { companion: SCRIPT, earlier, call: `quiet-${n}`, env: ON };
    expect(scriptAnswer({ ...turn, latest: "I'm fine." })).toBe('safe');
    expect(scriptAnswer({ ...turn, latest: 'No.' })).toBe('main');
  });

  it('a safe answer on a call where anything read a turn imminent reads as main', () => {
    const turn = { latest: "I'm fine.", companion: SCRIPT, earlier: [], call: `imm-${n}`, env: ON };
    expect(scriptAnswer(turn)).toBe('safe');
    noteImminentRead(turn.call);
    for (const latest of ["I'm fine.", "It's not a crisis.", "I haven't taken anything."]) {
      expect(scriptAnswer({ ...turn, latest })).toBe('main');
    }
  });

  it('without a call nothing eases: the imminent record fails closed', () => {
    expect(imminentReadThisCall(undefined)).toBe(true);
    expect(imminentReadThisCall('')).toBe(true);
    expect(
      scriptAnswer({ latest: "I'm fine.", companion: SCRIPT, earlier: [], env: ON })
    ).toBeNull();
  });

  it('only after the script asked it, only with the flag on', () => {
    expect(answer('No.', ON, 'Okay, tell me more.')).toBeNull();
    expect(answer('No.', OFF)).toBeNull();
    expect(answer('No.', {})).toBeNull();
  });
});

describe("a yes or no means what the script's question makes it mean", () => {
  const ANSWERS = ['Yes.', 'No.', 'No one.', 'Not really.'] as const;
  const RISK_SAID = ['I have the pills right here.'];
  // [question Ferni asked, quiet call (yes, no, no one, not really), call with risk said (same)]
  const TABLE: Array<[string, string, readonly string[], readonly string[]]> = [
    [
      'the taken-something question alone',
      `I'm right here. ${TAKEN_OR_IN_DANGER}, tell me.`,
      // "no one" holds risk words of its own (being alone): never eased, whatever was asked
      ['risk', 'safe', 'main', 'risk'],
      ['risk', 'main', 'main', 'risk'],
    ],
    [
      'the anyone-nearby question alone',
      `I'm right here. ${ANYONE_NEARBY}`,
      ['safe', 'main', 'main', 'risk'],
      ['main', 'main', 'main', 'risk'],
    ],
    [
      'the 911 script, which asks both',
      SCRIPT,
      ['risk', 'main', 'main', 'risk'],
      ['risk', 'main', 'main', 'risk'],
    ],
  ];

  it("the questions are read from the guard's own 911 script", () => {
    expect(TAKEN_OR_IN_DANGER).toBe("If you've taken something or you're in danger right now");
    expect(ANYONE_NEARBY).toBe('Is anyone nearby who can be with you?');
    expect(SCRIPT).toContain(TAKEN_OR_IN_DANGER);
    expect(SCRIPT).toContain(ANYONE_NEARBY);
  });

  it.each(TABLE)('%s', (_name, companion, quiet, risky) => {
    const read = (latest: string, earlier: readonly string[]) =>
      scriptAnswer({ latest, companion, earlier, call: `table-${n}-${latest}`, env: ON });
    expect(ANSWERS.map((a) => read(a, []))).toEqual(quiet);
    expect(ANSWERS.map((a) => read(a, RISK_SAID))).toEqual(risky);
  });

  it('a line that asks neither question is not an answer to the script', () => {
    const companion = 'Is there something on your mind tonight?';
    for (const a of ANSWERS) {
      expect(
        scriptAnswer({ latest: a, companion, earlier: [], call: `none-${n}`, env: ON })
      ).toBeNull();
    }
  });
});

describe('#1464: the crisis line once per call, never withheld', () => {
  const plain = detectCrisis('Okay.');
  const turn = (over: Record<string, unknown> = {}) => ({
    call: `line-${n}`,
    latest: 'Yeah.',
    earlier: [],
    ferni: ['I hear you. You can call or text 988, any time.'],
    env: ON,
    ...over,
  });
  const crisisRead = { ...plain, isCrisis: true, severity: 0.75, subject: 'self' as const };
  const guidanceOf = crisisGuidanceOnce;

  it('the line not yet heard: unchanged, main guidance', () => {
    const t = turn({ ferni: ['Okay, tell me more.'] });
    expect(withLineOnce(crisisRead, t)).toBe(crisisRead);
    expect(guidanceOf(crisisRead)).toBe(buildCrisisGuidance(crisisRead));
  });

  it('heard once: a later crisis turn keeps crisis mode and the 988 number, with the note', () => {
    withLineOnce(plain, turn()); // Ferni's 988 line, noted on a turn with no risk
    const later = withLineOnce(crisisRead, turn({ ferni: ['Okay.'] }));
    expect(later.indicators).toContain(LINE_GIVEN);
    expect(later.isCrisis).toBe(true);
    const guidance = guidanceOf(later);
    expect(guidance).toMatch(/Include the 988 Suicide & Crisis Lifeline/);
    expect(guidance).toMatch(/already heard the 988 number on this call/);
    expect(guidance).toMatch(/don't re-read the crisis script/);
  });

  it('heard once: a severe crisis turn still gets the 988 script, as on main', () => {
    withLineOnce(plain, turn());
    const severe = detectCrisis('I want to kill myself.');
    const later = withLineOnce(severe, turn({ ferni: ['Okay.'] }));
    expect(guardFromDetection(later).shouldBlock).toBe(true);
    expect(later.suggestedResponse).toBe(severe.suggestedResponse);
  });

  it.each([
    ['the classifier', applyClassifierVerdict(plain, IMMINENT)],
    ['the patterns', detectCrisis("I'm on the roof and I'm going to jump, I might kill myself")],
  ])('an imminent read from %s is never marked, and is noted for the call', (_name, read) => {
    withLineOnce(plain, turn());
    const t = turn({ latest: "I'm on the roof.", ferni: ['Okay.'] });
    expect(read.indicators).toContain('imminent_danger');
    expect(imminentReadThisCall(t.call)).toBe(false);
    const after = withLineOnce(read, t);
    expect(after).toBe(read);
    expect(guardFromDetection(after).shouldBlock).toBe(true);
    expect(after.suggestedResponse).toContain(IN_DANGER_NOW);
    expect(imminentReadThisCall(t.call)).toBe(true);
  });

  it('a main answer to the script (fullLine) is never marked', () => {
    withLineOnce(plain, turn());
    const t = turn({ latest: 'No.', ferni: ['Okay.'], fullLine: true });
    expect(withLineOnce(crisisRead, t)).toBe(crisisRead);
    expect(withLineOnce(crisisRead, { ...t, fullLine: false }).indicators).toContain(LINE_GIVEN);
  });

  it('a worry about someone else, the flag off, or no call: unchanged', () => {
    withLineOnce(plain, turn());
    const other = { ...crisisRead, subject: 'third_party' as const };
    expect(withLineOnce(other, turn())).toBe(other);
    expect(withLineOnce(crisisRead, turn({ env: OFF }))).toBe(crisisRead);
    expect(withLineOnce(crisisRead, turn({ call: undefined }))).toBe(crisisRead);
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
    const on = crisisBrakeOn(ON, call, ['Why alone?', ...earlier]);
    expect(on).toBe(false);
    const brake = on ? ('ease' as const) : undefined;
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [CRISIS],
        latest: 'Why alone?',
        earlier,
        companion: "You don't have to carry this alone.",
        brake,
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
