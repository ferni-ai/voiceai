/**
 * CRISIS_WORD_BOUNDARIES: a crisis risk phrase never counts inside a longer, different everyday
 * word (utils/crisis-word-boundaries.ts). Every line goes through the four real readers: the
 * crisis gate (detectCrisis), the human-transfer check (detectCrisisSignals), the safety check
 * (performSafetyCheck) and early-warning (checkWarnings). All lines are fictional.
 *
 * - Everyday lines main reads as risk only through a word that holds a risk word: risk on
 *   main, nothing with the flag on.
 * - Everyday lines main already reads as nothing (its patterns are whole-word there): nothing
 *   either way.
 * - Real risk, inflections and real risk beside listed words: with the flag on, every reading
 *   equals main's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisisSignals } from '../../human-transfer/escalation-classifier.js';
import { checkWarnings } from '../../wellbeing-tracking/early-warning.js';
import { getWellbeingProfile } from '../../wellbeing-tracking/index.js';
import { detectCrisis } from '../crisis-guard.js';
import { performSafetyCheck } from '../index.js';
import { EVERYDAY, blankedEveryday } from '../../../utils/crisis-word-boundaries.js';

let users = 0;
/** Everything the four readers make of one caller line. */
function read(line: string) {
  const { metadata: _when, ...safety } = performSafetyCheck(line, {
    userId: 'u-cwb',
    personaId: 'ferni',
  }).detection;
  const profile = getWellbeingProfile(`cwb-${++users}`);
  return {
    gate: detectCrisis(line),
    transfer: detectCrisisSignals(line),
    safety,
    warnings: checkWarnings(profile, { recentMessages: [line] }).map((w) => w.type),
  };
}

/** Any risk read at all: a gate indicator, a transfer signal, a safety detection or a warning. */
function risky(r: ReturnType<typeof read>): boolean {
  return (
    r.gate.indicators.length > 0 ||
    r.transfer.severity > 0 ||
    r.safety.detected ||
    r.warnings.length > 0
  );
}

const flag = (v: 'on' | 'off') => vi.stubEnv('CRISIS_WORD_BOUNDARIES', v);
afterEach(() => vi.unstubAllEnvs());

/** [line, the word that holds the risk word]: main reads risk only through that word. */
const FIXED: Array<[string, string]> = [
  ['can you resend it', 'resend'],
  ["I'll spend it all on rent", 'spend'],
  ['just send it whenever', 'send'],
  ["I couldn't attend it this year", 'attend'],
  ['can you lend it to me', 'lend'],
  ["I'd recommend it to anyone", 'recommend'],
  ["let's pretend it never happened", 'pretend'],
  ['blend it until smooth', 'blend'],
  ['I want to diet before the wedding', 'diet'],
  ["what's the pointer for", 'pointer'],
  ["there's no pointers in the docs", 'pointers'],
  ['no one would miss meetings', 'meetings'],
  ['everyone would be better off without meat', 'meat'],
  ['I hit play on my favorite song', 'song'],
  ['I hurt my back this season', 'season'],
  ['I hurt my wrist helping a person move', 'person'],
  ['I hit the snooze button, are you kidding', 'kidding'],
];

/** Everyday words main's patterns already read whole: nothing either way. */
const ALREADY_WHOLE = [
  "I'm going to diet this month",
  'I studied all night',
  'that puppy is so cute',
  "we'll execute the plan tomorrow",
  'that is a real skill',
  "there's been a change of plans",
  "I'm doing great today",
  "I'm writing code all day",
  "I'll send my mom a card",
  'I spend my life at work, honestly',
  'I bought a skillet',
];

describe('everyday words that hold a risk word', () => {
  it.each(FIXED)('%j: risk on main, nothing with the flag on (%s)', (line, word) => {
    expect(blankedEveryday(line.toLowerCase())).not.toContain(word);
    flag('off');
    expect(risky(read(line))).toBe(true);
    flag('on');
    expect(risky(read(line))).toBe(false);
  });

  it.each(ALREADY_WHOLE)('%j: nothing on main, nothing with the flag on', (line) => {
    flag('off');
    expect(risky(read(line))).toBe(false);
    flag('on');
    expect(risky(read(line))).toBe(false);
  });
});

/** Real risk: every reading with the flag on equals main's. */
const REAL_RISK = [
  'end it',
  'end it all',
  'I want to end it',
  'I want to end it all tonight',
  "I'm going to end it",
  'I want to end my life',
  'I want to kill myself',
  "I'm going to kill myself",
  'kill myself',
  "I'll die",
  'I want to die',
  "I'm going to die tonight",
  'I cut myself',
  'I want to cut myself',
  "I've been cutting again",
  'I want to hang myself',
  "I'm going to hang myself",
  "I OD'd last night",
  'I overdosed',
  'I took an overdose',
  'I want to overdose on my pills',
  "I've been thinking about suicide",
  "what's the point",
  "there's no point anymore",
  'no point in living',
  'no one would miss me',
  'everyone would be better off without me',
  "I don't want to live",
  "I don't want to be here",
  "I can't go on like this",
  'I hurt myself',
  "I've been hurting myself",
  'my husband hit me',
  'he hits me',
  'he hurt my son',
  'I hurt my kids',
  'he beat my daughter',
  "I'm having chest pains",
  "I'm having a heart attack",
  'I was raped',
  'I want to hurt him',
  // Real risk beside a listed everyday word: the listed word goes, the risk stays.
  'I want to die, not diet',
  "I'm going to kill myself after this meeting",
  'I want to end it, I already spent it all',
  'he hit my son during the song',
  'I want to end it this season',
  "I don't want to be here, I can't face it, I'm better off without me",
  'I want to overdose on the pills from the pharmacy',
];

/**
 * Real risk that none of the four readers reads on main: a recall gap of main's own, outside
 * this flag (reported on the PR). Pinned so it shows if main changes; equal either way.
 */
const MAIN_READS_NOTHING = new Set([
  "I'll die",
  "I'm going to die tonight",
  'I took an overdose',
  'I want to overdose on my pills',
  "I can't go on like this",
  'I want to overdose on the pills from the pharmacy',
]);

describe('real risk reads exactly as on main', () => {
  it('the table is real risk', () => {
    expect(REAL_RISK.length).toBeGreaterThanOrEqual(40);
    for (const line of MAIN_READS_NOTHING) expect(REAL_RISK).toContain(line);
  });

  it.each(REAL_RISK)('%j', (line) => {
    flag('off');
    const main = read(line);
    expect(risky(main)).toBe(!MAIN_READS_NOTHING.has(line));
    flag('on');
    expect(read(line)).toEqual(main);
  });
});

describe('the everyday list', () => {
  it('never holds a word a crisis check reads as risk', () => {
    const listed = new Set(Object.values(EVERYDAY).flat());
    for (const word of ['change', 'reason', 'methods', 'messages', 'today', 'homeless', 'points'])
      expect(listed.has(word), word).toBe(false);
  });

  it('blanks whole listed words only, keeping the length', () => {
    expect(blankedEveryday('I want to diet, I want to die')).toBe('I want to     , I want to die');
    expect(blankedEveryday('Song songbird')).toBe('     songbird');
  });
});
