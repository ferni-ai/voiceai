/**
 * A crisis flag may ADD a production crisis read; it may never remove one.
 *
 * Checked here: every flag the six production readers below actually read. That set is measured,
 * not listed: the readers run the corpus behind a process.env that records each name read, at
 * the defaults and with every crisis flag on. A flag a reader starts reading is checked the day
 * it does. Each checked flag is read from two baselines:
 *
 * - alone: the flag on, against every flag at its manifest default (what main runs);
 * - last: the flag on, against every other checked flag already on, so a flag that lowers only
 *   together with another one is caught too.
 *
 * "On" is checked as both 'on' and 'live', since some crisis modules read their own modes. A
 * flag in 'shadow' must change no read at all, and a flag that defaults on (a kill switch) must
 * lower nothing when turned off either.
 *
 * The rest of the crisis lane (every crisis-named flag plus every flag a crisis-lane source file
 * reads, crisis-lane-flags.ts) acts outside these readers. The guard at the bottom makes each of
 * those either be shown at the reply itself (SHOWN_ON, checked by the seventh reader,
 * agents/personas/__tests__/crisis-reply-never-lower.test.ts) or sit on a list that may only
 * shrink (NOT_YET_COVERED, crisis-flag-homes.ts).
 *
 * Why this exists: #3317 (CRISIS_WORD_BOUNDARIES, closed) made four #2645 warning lines lose
 * their only crisis read, and, with CRISIS_SIGHT_NEEDS_CUE on, seven stroke / sight-loss lines
 * lose their medical-emergency read. Every pinned crisis test stayed green, because those tests
 * call the whole-word helpers directly and the flag guarded a different path. This test reads
 * the production readers instead. All lines are fictional.
 *
 * A read also counts as lowered when it keeps its level but loses a resource: a crisis resource
 * the safety check or the life-coaching guard offered, a step down in the guard's recommended
 * action, or 988 / 911 gone from everything those readers hand the reply. The sixth reader is
 * the crisis script as the caller hears it (minorCrisisScript over crisis-guard's script): it
 * may gain a line, but never lose one of the script's, nor its 988 or 911.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import {
  LOWERS_A_REPLY,
  SHOWN_ON,
} from '../../../agents/personas/__tests__/crisis-reply.never-lower.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { minorCrisisScript } from '../../../utils/minor-crisis-care.js';
import { detectCrisisSignals } from '../../human-transfer/escalation-classifier.js';
import { riskCorpus } from '../../wellbeing-tracking/__tests__/crisis-corpus.js';
import { checkWarnings } from '../../wellbeing-tracking/early-warning.js';
import { getWellbeingProfile } from '../../wellbeing-tracking/index.js';
import { detectCrisis } from '../crisis-guard.js';
import { performSafetyCheck } from '../index.js';
import { NOT_YET_COVERED, NOT_YET_COVERED_CEILING } from './crisis-flag-homes.js';
import {
  CRISIS_FLAGS,
  flagReadsIn,
  LANE_READS,
  ROOT,
  RUNNER_MARKERS,
} from './crisis-lane-flags.js';

type FlagValues = Readonly<Record<string, string>>;

/**
 * Flags known to lower a read today. Each must stay off by default, and the test below fails
 * once the flag stops lowering, so the entry is removed and the flag is checked like the rest.
 */
const KNOWN_LOWERS: Readonly<Record<string, string>> = {
  // Whole-word matching drops the early-warning crisis read on run-together and stretched
  // speech-to-text forms ("iwant to die", "tokill myself", "dieee") and the #2645 lines.
  EARLY_WARNING_WORD_BOUNDARY: 'warning crisis_risk',
};

/** #2645: a risk line whose only match sits inside an everyday word ("skill", "send", "spend"). */
const INSIDE_A_WORD = [
  "i'll skill myself",
  "lend it all out, i won't be here",
  "i'll send it all to my sister before i go",
  "i'm going to spend it all tonight, i won't need it after",
];

/** Stroke and sight-loss lines where a filler word ("somewhat") sits in a pattern's word slot. */
const SIGHT_WORD_SLOT = [
  'I can barely see and my arm feels somewhat weak',
  'I can hardly see, my face looks somewhat weird',
  "I couldn't see, my leg is somewhat heavy",
  'my right eye somewhat went gray',
  'my left eye somewhat turned black',
  'my eyes somewhat went dark',
  'I can barely see, my mouth feels somewhat funny',
];

/** Risk lines from a caller who sounds under 18, so the youth path of a crisis script is read. */
const SOUNDS_UNDER_18 = [
  "I'm 15 and I want to kill myself",
  "I'm 14 and in 9th grade and I took a bunch of pills just now",
  "I'm 16 and I keep thinking everyone would be better off without me",
];

const LINES = [
  ...new Set([...riskCorpus(), ...INSIDE_A_WORD, ...SIGHT_WORD_SLOT, ...SOUNDS_UNDER_18]),
];

const ASSESS = ['safe', 'concerning', 'urgent', 'crisis'];
const ESCALATION = [
  'none',
  'gentle_suggestion',
  'warm_recommendation',
  'urgent_referral',
  'emergency',
];

const ACTION = ['continue', 'check_in', 'resources', 'immediate_referral'];

let profiles = 0;

/** Sorted resource names, so a loss is named in the failure. */
const names = (resources: readonly { name: string }[] | undefined): string[] =>
  (resources ?? []).map((r) => r.name).sort();

/** Whether a number appears anywhere in what the readers hand the reply. */
const mentions = (text: string, number: string): boolean =>
  new RegExp(`(?<![0-9])${number}(?![0-9])`).test(text);

/** What each production reader makes of one line. */
function read(line: string) {
  const gate = detectCrisis(line);
  const transfer = detectCrisisSignals(line);
  const safety = performSafetyCheck(line, { userId: 'u-flag-gate', personaId: 'ferni' });
  const warnings = checkWarnings(getWellbeingProfile(`flag-gate-${++profiles}`), {
    recentMessages: [line],
  }).map((w) => w.type);
  const assess = assessSafety(line);
  // The crisis script the caller hears when the gate replaces the reply (crisis-gate.ts), as
  // spoken: a caller who sounds under 18 also gets a youth line (MINOR_CRISIS_CARE). A fresh
  // session per read, so one line's age never carries to another.
  const script = gate.suggestedResponse ?? '';
  const spoken = script ? minorCrisisScript(script, `flag-gate-call-${++profiles}`, line, []) : '';
  const handed = JSON.stringify([
    assess.resources ?? [],
    safety.response ?? null,
    safety.contextInjection ?? null,
  ]);
  return {
    gateCrisis: gate.isCrisis,
    gateSeverity: gate.severity,
    transferSeverity: transfer.severity,
    transferSignals: Object.entries(transfer)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort(),
    safetyDetected: safety.crisisDetected,
    safetyEscalation: ESCALATION.indexOf(safety.escalation.level),
    safetyInterrupt: safety.shouldInterrupt,
    warnings: [...warnings].sort(),
    assessLevel: ASSESS.indexOf(assess.level),
    assessAction: ACTION.indexOf(assess.recommendedAction),
    assessResources: names(assess.resources),
    safetyResources: names([
      ...(safety.response?.primaryResource ? [safety.response.primaryResource] : []),
      ...(safety.response?.additionalResources ?? []),
    ]),
    offers988: mentions(handed, '988'),
    offers911: mentions(handed, '911'),
    scriptWhole: spoken.includes(script),
    spokenAdded: spoken.length > script.length,
    script988: mentions(spoken, '988'),
    script911: mentions(spoken, '911'),
  };
}
type Reading = ReturnType<typeof read>;

/** Every way `on` reads lower than `off`; empty when it never does. */
function lower(off: Reading, on: Reading): string[] {
  const out: string[] = [];
  if (off.gateCrisis && !on.gateCrisis) out.push('crisis-guard isCrisis');
  if (on.gateSeverity < off.gateSeverity) out.push('crisis-guard severity');
  if (on.transferSeverity < off.transferSeverity) out.push('transfer severity');
  for (const s of off.transferSignals)
    if (!on.transferSignals.includes(s)) out.push(`transfer ${s}`);
  if (off.safetyDetected && !on.safetyDetected) out.push('safety check detected');
  if (on.safetyEscalation < off.safetyEscalation) out.push('safety check escalation');
  if (off.safetyInterrupt && !on.safetyInterrupt) out.push('safety check interrupt');
  for (const w of off.warnings) if (!on.warnings.includes(w)) out.push(`warning ${w}`);
  if (on.assessLevel < off.assessLevel) out.push('life-coaching level');
  if (on.assessAction < off.assessAction) out.push('life-coaching action');
  for (const r of off.assessResources)
    if (!on.assessResources.includes(r)) out.push(`life-coaching resource ${r}`);
  for (const r of off.safetyResources)
    if (!on.safetyResources.includes(r)) out.push(`safety check resource ${r}`);
  if (off.offers988 && !on.offers988) out.push('988');
  if (off.offers911 && !on.offers911) out.push('911');
  if (off.scriptWhole && !on.scriptWhole) out.push('spoken crisis script cut');
  if (off.script988 && !on.script988) out.push('spoken script 988');
  if (off.script911 && !on.script911) out.push('spoken script 911');
  return out;
}

/** Every reading of every line with these flags set and every other crisis flag unset. */
const readings = new Map<string, Map<string, Reading>>();
function readUnder(flags: FlagValues): Map<string, Reading> {
  const key = JSON.stringify(Object.entries(flags).sort());
  let found = readings.get(key);
  if (!found) {
    for (const name of STUBBED) vi.stubEnv(name, flags[name]);
    found = new Map(LINES.map((line) => [line, read(line)]));
    vi.unstubAllEnvs();
    readings.set(key, found);
  }
  return found;
}

/**
 * Every manifest flag the six readers read on the corpus, at the defaults and with every crisis
 * flag on, recorded by a process.env that notes each name looked up.
 */
function flagsTheReadersRead(): string[] {
  const seen = new Set<string>();
  const note = (key: string | symbol): void => {
    if (typeof key === 'string') seen.add(key);
  };
  const pass = (flags: FlagValues): void => {
    for (const name of CRISIS_FLAGS) vi.stubEnv(name, flags[name]);
    const real = process.env;
    process.env = new Proxy(real, {
      get: (target, key) => (note(key), Reflect.get(target, key)),
      has: (target, key) => (note(key), Reflect.has(target, key)),
    });
    try {
      for (const line of LINES) read(line);
    } finally {
      process.env = real;
      vi.unstubAllEnvs();
    }
  };
  pass({});
  pass(Object.fromEntries(CRISIS_FLAGS.map((name) => [name, 'on'])));
  return [...seen].filter((name) => name in FLAG_MANIFEST && !(name in RUNNER_MARKERS)).sort();
}

const defaultOf = (name: string): string =>
  FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default;

/** The flags the six readers read, measured, so the set can't drift from what they do. */
const READ_BY_READERS = flagsTheReadersRead();
const CHECKED = READ_BY_READERS.filter((name) => !(name in KNOWN_LOWERS));
/** Unset (manifest default) unless a case sets it. */
const STUBBED = [...new Set([...CRISIS_FLAGS, ...READ_BY_READERS])];
const ON_VALUES = ['on', 'live'] as const;
const CASES = CHECKED.flatMap((name) => ON_VALUES.map((value) => [name, value] as const));
/** Checked flags that don't default off: turned off, they must lower nothing either. */
const DEFAULT_ON = CHECKED.filter((name) => defaultOf(name) !== 'off').map(
  (name) => [name, defaultOf(name)] as const
);

/** Every line some reader reads lower with `flags` than with `base`, with what it lost. */
function losses(base: FlagValues, flags: FlagValues): string[] {
  const off = readUnder(base);
  const on = readUnder(flags);
  return LINES.flatMap((line) => {
    const lost = lower(off.get(line)!, on.get(line)!);
    return lost.length ? [`${line} :: ${lost.join(', ')}`] : [];
  });
}

/** Every checked flag but `name`, at `value`. */
const allBut = (name: string, value: string): FlagValues =>
  Object.fromEntries(CHECKED.filter((other) => other !== name).map((other) => [other, value]));

afterEach(() => vi.unstubAllEnvs());

describe('crisis flags never lower a production crisis read', () => {
  it('covers the crisis lane flags and a real corpus', () => {
    // Named here so a change that stops the readers reading one fails loudly.
    for (const name of [
      'CRISIS_SIGHT_NEEDS_CUE',
      'SAFETY_WHOLE_WORD_SITES',
      'EARLY_WARNING_STT_FORMS',
    ]) {
      expect(CHECKED).toContain(name);
    }
    expect(LINES.length).toBeGreaterThan(500);
    // The resource checks bite only if main hands the reply 988 and named resources.
    const defaults = [...readUnder({}).values()];
    expect(defaults.filter((r) => r.offers988).length).toBeGreaterThan(100);
    // No reader hands the reply 911 on main today, so the 911 check cannot fail yet (#3341).
    // When #3341 lands this goes red: change it to toBeGreaterThan(0).
    expect(defaults.filter((r) => r.offers911).length).toBe(0);
    expect(defaults.filter((r) => r.assessResources.length > 0).length).toBeGreaterThan(100);
    expect(defaults.filter((r) => r.safetyResources.length > 0).length).toBeGreaterThan(100);
  });

  it('reads the pinned lines as risk where main does', () => {
    const defaults = readUnder({});
    for (const line of INSIDE_A_WORD)
      expect(defaults.get(line)!.warnings, line).toContain('crisis_risk');
    const sight = readUnder({ CRISIS_SIGHT_NEEDS_CUE: 'on' });
    for (const line of SIGHT_WORD_SLOT) expect(sight.get(line)!.transferSeverity, line).toBe(10);
  });

  it('reads the spoken script with its youth line for a caller who sounds under 18', () => {
    const defaults = readUnder({});
    const youth = readUnder({ MINOR_CARE: 'on', MINOR_CRISIS_CARE: 'on' });
    for (const line of SOUNDS_UNDER_18) {
      expect(defaults.get(line)?.spokenAdded, line).toBe(false);
      expect(youth.get(line)).toMatchObject({
        spokenAdded: true,
        scriptWhole: true,
        script988: true,
      });
    }
  });

  it.each(CASES)('%s=%s alone lowers no read', (name, value) => {
    expect(losses({}, { [name]: value })).toEqual([]);
  });

  it.each(CASES)('%s=%s on top of every other checked flag lowers no read', (name, value) => {
    const base = allBut(name, value);
    expect(losses(base, { ...base, [name]: value })).toEqual([]);
  });

  it.each(DEFAULT_ON)('%s=off (default %s) lowers no read', (name) => {
    expect(losses({}, { [name]: 'off' })).toEqual([]);
  });

  it.each(CHECKED.filter((name) => defaultOf(name) === 'off'))(
    '%s=shadow changes no read',
    (name) => {
      expect(readUnder({ [name]: 'shadow' })).toEqual(readUnder({}));
    }
  );

  it.each(Object.entries(KNOWN_LOWERS))(
    '%s is off by default and still lowers %s',
    (name, what) => {
      expect(defaultOf(name)).toBe('off');
      const lost = losses({}, { [name]: 'on' });
      // Fixed? Delete the KNOWN_LOWERS entry so the flag is checked like every other.
      expect(lost.length).toBeGreaterThan(0);
      // ...and only that: a loss in any other reader fails here.
      for (const entry of lost) expect(entry.endsWith(` :: ${what}`), entry).toBe(true);
    }
  );
});

/** Crisis flags no crisis name marks, so only the lane read finds them. */
const READ_NOT_NAMED = [
  'MINOR_ABUSE_DISCLOSURE', // a caller under 18 telling of sexual harm (turn path)
  'ABUSE_DISCLOSURE_PATTERNS', // someone hurting the caller (turn path)
  'THIRD_PARTY_SELF_HARM', // who is at risk on a third-party crisis read
  'SEXUAL_TOPIC_BOUNDARY', // the sexual-content hold for a caller under 18
  'SPEAK_988_DIGITS', // 988 spoken as digits
  'AI_NOTICE_SPOKEN', // the spoken AI notice
];

describe('every flag a crisis module reads is checked or covered elsewhere', () => {
  it('finds crisis flags by what crisis modules read, not by name', () => {
    for (const name of READ_NOT_NAMED) {
      expect(LANE_READS.has(name), `${name} is read by no crisis-lane file`).toBe(true);
      expect(CRISIS_FLAGS, name).toContain(name);
    }
  });

  it('counts a read, never a mention in a comment', () => {
    const source = [
      "// `SPEAK_988_DIGITS` and 'AI_NOTICE_SPOKEN' are only mentioned here",
      "/* THIRD_PARTY_SELF_HARM: 'MINOR_ABUSE_DISCLOSURE' */",
      "const site = 'https://example.test/'; // `SEXUAL_TOPIC_BOUNDARY`",
      "if (flagOn('CRISIS_SIGHT_NEEDS_CUE', env)) mark();",
      'const who = env?.CRISIS_MEANS_IN_HAND ?? process.env.EARLY_WARNING_STT_FORMS;',
    ].join('\n');
    expect([...flagReadsIn(source)].sort()).toEqual([
      'CRISIS_MEANS_IN_HAND',
      'CRISIS_SIGHT_NEEDS_CUE',
      'EARLY_WARNING_STT_FORMS',
    ]);
  });

  it('accounts for each lane flag exactly once', () => {
    const unaccounted: string[] = [];
    for (const name of new Set([...CRISIS_FLAGS, ...LANE_READS.keys(), ...READ_BY_READERS])) {
      const homes = [
        CHECKED.includes(name) && 'checked',
        name in KNOWN_LOWERS && 'KNOWN_LOWERS',
        name in SHOWN_ON && 'SHOWN_ON',
        name in LOWERS_A_REPLY && 'LOWERS_A_REPLY',
        NOT_YET_COVERED.includes(name) && 'NOT_YET_COVERED',
        name in RUNNER_MARKERS && 'RUNNER_MARKERS',
      ].filter(Boolean);
      if (homes.length !== 1) unaccounted.push(`${name}: ${homes.join(', ') || 'nowhere'}`);
    }
    // A flag the readers start reading is checked: delete its other entry.
    expect(unaccounted).toEqual([]);
  });

  it('only shrinks NOT_YET_COVERED', () => {
    for (const name of NOT_YET_COVERED) {
      expect(NOT_YET_COVERED_CEILING, `${name} was added to NOT_YET_COVERED`).toContain(name);
      expect(CRISIS_FLAGS, `${name} is no longer a crisis-lane flag`).toContain(name);
    }
  });

  it('skips only runner markers a crisis module still reads', () => {
    for (const name of Object.keys(RUNNER_MARKERS)) {
      expect(name in FLAG_MANIFEST, name).toBe(true);
      expect(LANE_READS.has(name), `${name}: stale RUNNER_MARKERS entry`).toBe(true);
    }
  });
});
