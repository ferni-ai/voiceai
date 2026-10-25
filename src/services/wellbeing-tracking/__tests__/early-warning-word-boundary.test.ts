/**
 * EARLY_WARNING_WORD_BOUNDARY: prod 2026-10-22, "I actually did send it
 * Wednesday night" fired crisis_risk (severity urgent) because 'end it' was
 * matched as a substring. Through the real checkWarnings: off keeps that
 * (today's behaviour); on matches whole words, so everyday words that contain
 * a phrase stop firing and every real phrase still fires.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWarnings } from '../early-warning.js';
import { getWellbeingProfile } from '../index.js';
import { mentions, resolveEarlyWarningWordBoundary } from '../../../utils/phrase-match.js';

let users = 0;
/** The warning types checkWarnings raises for one message, on a fresh profile. */
function warned(message: string): string[] {
  const profile = getWellbeingProfile(`ew-word-boundary-${++users}`);
  return checkWarnings(profile, { recentMessages: [message] }).map((w) => w.type);
}

afterEach(() => vi.unstubAllEnvs());

describe('crisis_risk on the 2026-10-22 canary line', () => {
  it('off: "send it" fires crisis_risk, as today', () => {
    vi.stubEnv('EARLY_WARNING_WORD_BOUNDARY', 'off');
    expect(warned('Ah, yeah, I actually did send it Wednesday night.')).toContain('crisis_risk');
  });

  it('on: "send it" does not fire', () => {
    vi.stubEnv('EARLY_WARNING_WORD_BOUNDARY', 'on');
    expect(warned('Ah, yeah, I actually did send it Wednesday night.')).not.toContain(
      'crisis_risk'
    );
  });

  it.each(['I want to end it', 'end it all tonight', 'I just want to End It.', 'I want to die'])(
    'on: %j still fires crisis_risk',
    (line) => {
      vi.stubEnv('EARLY_WARNING_WORD_BOUNDARY', 'on');
      expect(warned(line)).toContain('crisis_risk');
    }
  );
});

describe('every phrase that overlapped an everyday word', () => {
  // [phrase, an everyday line that holds it inside a word, a real use of it]
  const OVERLAPS: Array<[string, string, string]> = [
    ['end it', 'just spend it on yourself', 'I want to end it'],
    ['end it', "I'd recommend it", 'maybe I should just end it'],
    ['want to die', 'I want to diet before summer', 'I want to die'],
    [
      'better off without me',
      'better off without meat, honestly',
      "they'd be better off without me",
    ],
    ['give up', "I'll give updates later", 'I want to give up'],
    ["can't go on", "I can't go online at work", "I can't go on like this"],
    ['no point', 'I got casino points', "there's no point"],
    ["what's the use", "what's the username again", "what's the use of trying"],
    ['alone', 'the standalone version', 'I feel so alone'],
    [
      'staying home',
      'volunteering at the staying homeless shelter',
      "I've been staying home a lot",
    ],
    ["can't face", "I can't FaceTime right now", "I can't face anyone"],
    ['what if', "it's somewhat if you squint", 'what if it all goes wrong'],
    ["can't sleep", "I can't sleepwalk, that's a myth", "I can't sleep"],
    ['why bother', 'why bothered asking', 'why bother trying'],
  ];

  it.each(OVERLAPS)('%j: off matches inside a word (today)', (phrase, everyday) => {
    expect(mentions(everyday, [phrase], { EARLY_WARNING_WORD_BOUNDARY: 'off' })).toBe(true);
  });

  it.each(OVERLAPS)(
    '%j: on ignores it inside a word, still finds the real use',
    (phrase, everyday, real) => {
      const on = { EARLY_WARNING_WORD_BOUNDARY: 'on' };
      expect(mentions(everyday, [phrase], on)).toBe(false);
      expect(mentions(real, [phrase], on)).toBe(true);
    }
  );
});

describe('mentions with the flag on', () => {
  const on = { EARLY_WARNING_WORD_BOUNDARY: 'on' };
  it('matches across punctuation, case and line ends', () => {
    expect(mentions('End it.', ['end it'], on)).toBe(true);
    expect(mentions('"end it"', ['end it'], on)).toBe(true);
    expect(mentions('want   to\ndie', ['want to die'], on)).toBe(true);
  });

  it('reads curly apostrophes as straight ones', () => {
    expect(mentions('I can’t sleep', ["can't sleep"], on)).toBe(true);
    expect(mentions('I don’t want to be here', ["don't want to be here"], on)).toBe(true);
  });

  it('never throws on a non-string message', () => {
    expect(mentions(undefined as unknown as string, ['end it'], on)).toBe(false);
  });

  it('is off unless on', () => {
    expect(resolveEarlyWarningWordBoundary({})).toBe(false);
    expect(resolveEarlyWarningWordBoundary({ EARLY_WARNING_WORD_BOUNDARY: 'live' })).toBe(false);
    expect(resolveEarlyWarningWordBoundary({ EARLY_WARNING_WORD_BOUNDARY: ' ON ' })).toBe(true);
  });
});
