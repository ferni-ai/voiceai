/**
 * EARLY_WARNING_STT_FORMS: speech-to-text writes "cant take it anymore" and
 * "im done" without apostrophes, and callers say "killing myself" or "wanna
 * die" rather than the listed "kill myself" / "want to die". None of those
 * fired in either EARLY_WARNING_WORD_BOUNDARY mode. Through the real
 * checkWarnings: on, they fire at their list's severity; everyday sentences
 * still don't; off, nothing changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const shadow = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (b: Record<string, unknown>) =>
      b.module === 'SafetyPhraseShadow'
        ? { info: shadow, warn: shadow, debug: shadow, error: shadow }
        : real.createLogger(b),
  };
});

import { checkWarnings } from '../early-warning.js';
import { getWellbeingProfile } from '../index.js';
import { mentions, resolveEarlyWarningSttForms } from '../../../utils/phrase-match.js';

let users = 0;
/** The warning types checkWarnings raises for one message; hope sets hopefulness. */
function warned(message: string, hope?: number): string[] {
  const profile = getWellbeingProfile(`ew-stt-forms-${++users}`);
  if (hope !== undefined) {
    profile.current = { dimensions: { hopefulness: hope } } as typeof profile.current;
  }
  return checkWarnings(profile, { recentMessages: [message] }).map((w) => w.type);
}

const MODES = ['off', 'on'] as const;
function stub(stt: 'on' | 'off' | 'shadow', wordBoundary: 'on' | 'off'): void {
  vi.stubEnv('EARLY_WARNING_STT_FORMS', stt);
  vi.stubEnv('EARLY_WARNING_WORD_BOUNDARY', wordBoundary);
}

afterEach(() => {
  vi.unstubAllEnvs();
  shadow.mockClear();
});

// Real-risk lines that no listed phrase catches today.
const CRISIS_LINES = [
  'i dont want to be here anymore',
  'i cant take it anymore',
  'I can not take it any more',
  'i wanna die',
  "I've been thinking about killing myself",
  'I keep hurting myself',
  'i want to harm myself',
  'im thinking about ending it all',
  'I want to end my life',
  "I've thought about taking my own life",
  'I feel suicidal',
  'honestly I wish I was dead',
  "I'd be better off dead",
  'i cant take this anymore',
];

// Hopelessness lines: they fire only with low hopefulness (0.15) as well.
const HOPELESS_LINES = [
  'i cant go on like this',
  'im done',
  'I am done',
  'I gave up',
  "I'm giving up",
  "I've given up on everything",
  'I keep thinking about ending it',
];

// Everyday sentences that hold an added form's words, or a near-miss of one.
const EVERYDAY = [
  'im done with dinner',
  'I gave up sugar for lent',
  "I'm killing it at work",
  'that comedian killed it',
  'I want to spend my life with you',
  'I wanna diet before summer',
  "I'll take my own lifeguard course",
  'we are ending it early tonight',
  'they spent it all on giving updates',
  'my phone is dying',
  'I hurt my back lifting',
  'that deadline is killing me',
  "I'm killing myself laughing",
  'been killing myself at the gym',
  'I keep hurting myself skiing',
  'killing myself to make rent',
  "I'm not suicidal, just tired",
  'I was never suicidal',
  'im done for today',
  'I gave up smoking',
  "we're ending it on a high note",
];

// Real-risk lines the idiom and negation guards must leave firing.
const STILL_CRISIS = [
  "I'm killing myself",
  'i keep thinking about killing myself at night',
  'thinking about killing myself to end the pain',
  'I keep hurting myself',
  "I'm suicidal",
  'not okay, im suicidal',
];

describe('flag off: byte-identical to today', () => {
  it.each(MODES)('word boundary %s: no new line fires', (wb) => {
    stub('off', wb);
    for (const line of CRISIS_LINES) expect(warned(line), line).not.toContain('crisis_risk');
    for (const line of HOPELESS_LINES) {
      expect(warned(line, 0.15), line).not.toContain('hopelessness_pattern');
    }
  });

  it('is off unless on or shadow', () => {
    expect(resolveEarlyWarningSttForms({})).toBe('off');
    expect(resolveEarlyWarningSttForms({ EARLY_WARNING_STT_FORMS: 'true' })).toBe('off');
    expect(resolveEarlyWarningSttForms({ EARLY_WARNING_STT_FORMS: ' On ' })).toBe('on');
    expect(resolveEarlyWarningSttForms({ EARLY_WARNING_STT_FORMS: 'shadow' })).toBe('shadow');
  });

  it('only this flag: the whole-word sites flag does not change early-warning', () => {
    stub('off', 'off');
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
    for (const line of CRISIS_LINES) expect(warned(line), line).not.toContain('crisis_risk');
  });
});

describe.each(MODES)('flag on, word boundary %s', (wb) => {
  it.each(CRISIS_LINES)('%j fires crisis_risk', (line) => {
    stub('on', wb);
    expect(warned(line)).toContain('crisis_risk');
  });

  it.each(HOPELESS_LINES)('%j fires hopelessness with low hope, never crisis_risk', (line) => {
    stub('on', wb);
    expect(warned(line, 0.15)).toContain('hopelessness_pattern');
    expect(warned(line)).not.toContain('crisis_risk');
    expect(warned(line)).not.toContain('hopelessness_pattern');
  });

  it.each(EVERYDAY)(
    '%j raises no warning the flag-off check does not, even with low hope',
    (line) => {
      stub('off', wb);
      const before = warned(line, 0.15);
      stub('on', wb);
      expect(warned(line, 0.15)).toEqual(before);
      expect(warned(line)).not.toContain('crisis_risk');
    }
  );

  it.each(STILL_CRISIS)('%j still fires crisis_risk past the guards', (line) => {
    stub('on', wb);
    expect(warned(line)).toContain('crisis_risk');
  });

  it('shadow: logs what on would add, decides as off', () => {
    stub('shadow', wb);
    expect(warned('i wanna die')).not.toContain('crisis_risk');
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'EARLY_WARNING_STT_FORMS', phrase: 'want to die' }),
      expect.any(String)
    );
    shadow.mockClear();
    expect(warned('im done with dinner')).toEqual([]);
    expect(shadow).not.toHaveBeenCalled();
  });
});

describe('mentions with STT forms on', () => {
  const on = { EARLY_WARNING_STT_FORMS: 'on', EARLY_WARNING_WORD_BOUNDARY: 'on' };
  // The crisis_risk list from early-warning.ts.
  const CRISIS = [
    'hurt myself',
    'end it',
    "don't want to be here",
    'better off without me',
    "can't take it anymore",
    'want to die',
    'kill myself',
  ];

  it('never matches an added form inside a larger word', () => {
    for (const line of [
      'I want to spend my life here',
      'they keep sending it all back',
      'wanna diet',
      'better off deadlifting',
      'charm myself into it',
      'suicidality research paper',
    ]) {
      expect(mentions(line, CRISIS, on), line).toBe(false);
    }
    expect(mentions('get him done by noon', ["can't go on"], on)).toBe(false);
    expect(mentions('I gave upgrades away', ['give up'], on)).toBe(false);
  });

  it('adds forms only under their own phrase, so severity follows the list', () => {
    expect(mentions('im done', CRISIS, on)).toBe(false);
    expect(mentions('I gave up', CRISIS, on)).toBe(false);
    expect(mentions('im done', ["can't go on"], on)).toBe(true);
  });

  it('keeps every match the listed phrases already make', () => {
    for (const line of ['I want to end it', 'I want to die', 'they are better off without me']) {
      expect(mentions(line, CRISIS, on), line).toBe(true);
    }
    // With word boundary off, today's substring hit stays: the flag only adds.
    const substring = { EARLY_WARNING_STT_FORMS: 'on', EARLY_WARNING_WORD_BOUNDARY: 'off' };
    expect(mentions('I actually did send it', ['end it'], substring)).toBe(true);
  });
});
