/**
 * A crisis flag may ADD a production crisis read; it may never remove one.
 *
 * Every flag in the crisis lane (CRISIS_*, SAFETY_*, EARLY_WARNING_*, MINOR_CARE*, SMS_CRISIS_*)
 * is checked from two baselines, so a new crisis flag is covered the day it is registered:
 *
 * - alone: the flag on, against every crisis flag at its manifest default (what main runs);
 * - last: the flag on, against every other crisis flag already on, so a flag that lowers only
 *   together with another one is caught too.
 *
 * "On" is checked as both 'on' and 'live', since some crisis modules read their own modes. A
 * flag in 'shadow' must change no read at all.
 *
 * Why this exists: #3317 (CRISIS_WORD_BOUNDARIES, closed) made four #2645 warning lines lose
 * their only crisis read, and, with CRISIS_SIGHT_NEEDS_CUE on, seven stroke / sight-loss lines
 * lose their medical-emergency read. Every pinned crisis test stayed green, because those tests
 * call the whole-word helpers directly and the flag guarded a different path. This test reads
 * the five production readers instead. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { detectCrisisSignals } from '../../human-transfer/escalation-classifier.js';
import { riskCorpus } from '../../wellbeing-tracking/__tests__/crisis-corpus.js';
import { checkWarnings } from '../../wellbeing-tracking/early-warning.js';
import { getWellbeingProfile } from '../../wellbeing-tracking/index.js';
import { detectCrisis } from '../crisis-guard.js';
import { performSafetyCheck } from '../index.js';

type FlagValues = Readonly<Record<string, string>>;

/** Every registered flag in the crisis lane. */
const CRISIS_FLAGS = Object.keys(FLAG_MANIFEST)
  .filter((name) => /^(CRISIS_|SAFETY_|EARLY_WARNING_|MINOR_CARE|SMS_CRISIS_)/.test(name))
  .sort();

/**
 * Flags known to lower a read today. Each must stay off by default, and the test below fails
 * once the flag stops lowering, so the entry is removed and the flag is checked like the rest.
 */
const KNOWN_LOWERS: Readonly<Record<string, string>> = {
  // Whole-word matching drops the early-warning crisis read on run-together and stretched
  // speech-to-text forms ("iwant to die", "tokill myself", "dieee") and the #2645 lines.
  EARLY_WARNING_WORD_BOUNDARY: 'warning crisis_risk',
};

const CHECKED = CRISIS_FLAGS.filter((name) => !(name in KNOWN_LOWERS));
const ON_VALUES = ['on', 'live'] as const;
const CASES = CHECKED.flatMap((name) => ON_VALUES.map((value) => [name, value] as const));

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

const LINES = [...new Set([...riskCorpus(), ...INSIDE_A_WORD, ...SIGHT_WORD_SLOT])];

const ASSESS = ['safe', 'concerning', 'urgent', 'crisis'];
const ESCALATION = [
  'none',
  'gentle_suggestion',
  'warm_recommendation',
  'urgent_referral',
  'emergency',
];

let profiles = 0;

/** What each production reader makes of one line. */
function read(line: string) {
  const gate = detectCrisis(line);
  const transfer = detectCrisisSignals(line);
  const safety = performSafetyCheck(line, { userId: 'u-flag-gate', personaId: 'ferni' });
  const warnings = checkWarnings(getWellbeingProfile(`flag-gate-${++profiles}`), {
    recentMessages: [line],
  }).map((w) => w.type);
  const assess = assessSafety(line);
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
  return out;
}

/** Every reading of every line with these flags set and every other crisis flag unset. */
const readings = new Map<string, Map<string, Reading>>();
function readUnder(flags: FlagValues): Map<string, Reading> {
  const key = JSON.stringify(Object.entries(flags).sort());
  let found = readings.get(key);
  if (!found) {
    for (const name of CRISIS_FLAGS) vi.stubEnv(name, flags[name]);
    found = new Map(LINES.map((line) => [line, read(line)]));
    vi.unstubAllEnvs();
    readings.set(key, found);
  }
  return found;
}

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
    // Named here so a rename that drops one out of the filter fails loudly.
    for (const name of [
      'CRISIS_SIGHT_NEEDS_CUE',
      'SAFETY_WHOLE_WORD_SITES',
      'EARLY_WARNING_STT_FORMS',
    ]) {
      expect(CHECKED).toContain(name);
    }
    expect(LINES.length).toBeGreaterThan(500);
  });

  it('reads the pinned lines as risk where main does', () => {
    const defaults = readUnder({});
    for (const line of INSIDE_A_WORD)
      expect(defaults.get(line)!.warnings, line).toContain('crisis_risk');
    const sight = readUnder({ CRISIS_SIGHT_NEEDS_CUE: 'on' });
    for (const line of SIGHT_WORD_SLOT) expect(sight.get(line)!.transferSeverity, line).toBe(10);
  });

  it.each(CASES)('%s=%s alone lowers no read', (name, value) => {
    expect(losses({}, { [name]: value })).toEqual([]);
  });

  it.each(CASES)('%s=%s on top of every other crisis flag lowers no read', (name, value) => {
    const base = allBut(name, value);
    expect(losses(base, { ...base, [name]: value })).toEqual([]);
  });

  it.each(
    CHECKED.filter((name) => FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default === 'off')
  )('%s=shadow changes no read', (name) => {
    expect(readUnder({ [name]: 'shadow' })).toEqual(readUnder({}));
  });

  it.each(Object.entries(KNOWN_LOWERS))(
    '%s is off by default and still lowers %s',
    (name, what) => {
      expect(FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default).toBe('off');
      const lost = losses({}, { [name]: 'on' });
      // Fixed? Delete the KNOWN_LOWERS entry so the flag is checked like every other.
      expect(lost.length).toBeGreaterThan(0);
      // ...and only that: a loss in any other reader fails here.
      for (const entry of lost) expect(entry.endsWith(` :: ${what}`), entry).toBe(true);
    }
  );
});
