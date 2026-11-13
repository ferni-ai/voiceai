/**
 * STRANGER_GREETING_EASY (#3668): told to ask "about how they are or what is on their
 * mind", the first-call hello asked what was on their mind or how they were holding up
 * on 5 of 5 dev red-team calls (2026-11-10). On: it asks how it's going. Off: the
 * direction is the same string as before, for first calls and unplaced callers alike.
 * The flag is read through flagOn, so its values and the flag file's default apply.
 * English calls only (owner decision, 2026-11-13): a Spanish, mixed or untagged call keeps the
 * old string with the flag on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import type { Cue } from '../../../speech/direction/cue.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { directedGreeting, greetingDirection, GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { STRANGER_GREETING_DIRECTION, UNPLACED_GREETING_DIRECTION, EASY_QUESTION } =
  await import('../first-call-stranger.js');

const ON = { STRANGER_GREETING_EASY: 'on' };
const MIND = 'what is on their mind';
const EN = ['en-US'];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('STRANGER_GREETING_EASY off: the hello direction is unchanged', () => {
  it.each([
    ['unset', {}],
    ['empty', { STRANGER_GREETING_EASY: '' }],
    ['off', { STRANGER_GREETING_EASY: 'off' }],
    ['false', { STRANGER_GREETING_EASY: 'false' }],
    ['0', { STRANGER_GREETING_EASY: '0' }],
    ['not a flag value', { STRANGER_GREETING_EASY: 'yes' }],
  ])('%s: first call and unplaced caller get the old strings, English call too', (_name, env) => {
    expect(greetingDirection('ferni', env, { firstCall: true, locales: EN })).toBe(
      STRANGER_GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', env, { unplaced: true, locales: EN })).toBe(
      UNPLACED_GREETING_DIRECTION
    );
    expect(STRANGER_GREETING_DIRECTION).toContain(MIND);
  });

  it.each([
    ['Spanish', ['es-US']],
    ['mixed', ['en-US', 'es-US']],
    ['no tags', []],
    ['no tags passed', undefined],
  ])('off, %s call: the old strings too', (_name, locales) => {
    expect(
      greetingDirection('ferni', { STRANGER_GREETING_EASY: 'off' }, { firstCall: true, locales })
    ).toBe(STRANGER_GREETING_DIRECTION);
    expect(greetingDirection('ferni', {}, { unplaced: true, locales })).toBe(
      UNPLACED_GREETING_DIRECTION
    );
  });

  it("unset or unrecognised values read the flag file's default, which is off", () => {
    const spec = FLAG_MANIFEST.STRANGER_GREETING_EASY;
    expect(spec.default).toBe('off');
    Object.assign(FLAG_MANIFEST, { STRANGER_GREETING_EASY: { ...spec, default: 'on' } });
    try {
      expect(greetingDirection('ferni', {}, { firstCall: true, locales: EN })).toContain(
        EASY_QUESTION
      );
      expect(
        greetingDirection(
          'ferni',
          { STRANGER_GREETING_EASY: 'yes' },
          { firstCall: true, locales: EN }
        )
      ).toContain(EASY_QUESTION);
      expect(
        greetingDirection(
          'ferni',
          { STRANGER_GREETING_EASY: 'off' },
          { firstCall: true, locales: EN }
        )
      ).toBe(STRANGER_GREETING_DIRECTION);
    } finally {
      Object.assign(FLAG_MANIFEST, { STRANGER_GREETING_EASY: spec });
    }
  });
});

describe('STRANGER_GREETING_EASY on: a first hello asks how it is going', () => {
  it.each(['on', 'true', '1', 'live', 'ON', ' On '])(
    '%j turns it on, as flagOn reads it',
    (value) => {
      const env = { STRANGER_GREETING_EASY: value };
      expect(greetingDirection('ferni', env, { firstCall: true, locales: EN })).toContain(
        EASY_QUESTION
      );
      expect(greetingDirection('ferni', env, { unplaced: true, locales: EN })).toContain(
        EASY_QUESTION
      );
    }
  );

  it.each([
    ['first call', { firstCall: true, locales: EN }],
    ['unplaced caller', { unplaced: true, locales: EN }],
  ])('%s: the easy question replaces the on-your-mind one', (_name, last) => {
    const direction = greetingDirection('ferni', ON, last);
    expect(direction).toContain(EASY_QUESTION);
    expect(direction).toContain("how's it going?");
    expect(direction).toMatch(/not "how are you holding up", which assumes something is wrong/);
    expect(direction).not.toContain(MIND);
    // The rest of the stranger's rules stay: no tease, no shared past.
    expect(direction).toContain('no tease');
    expect(direction).toContain('never imply you have talked before');
  });

  it('keeps the first-call intro when FIRST_CALL_INTRO adds one', () => {
    const direction = greetingDirection('ferni', ON, { firstCall: true, locales: EN }, 'Ferni');
    expect(direction).toContain(EASY_QUESTION);
    expect(direction).toContain('"Hi Sam, it\'s Ferni."');
    expect(direction).not.toContain('or introduce yourself');
  });

  it("leaves a returning caller's hello alone", () => {
    expect(greetingDirection('ferni', ON, { locales: EN })).toBe(GREETING_DIRECTION);
  });

  it('reaches the live hello through process.env', async () => {
    vi.stubEnv('STRANGER_GREETING_EASY', 'on');
    await directedGreeting('sge-1', 'ferni', {
      userId: 'voice-eval-new',
      userName: 'Sam',
      isReturningUser: false,
      callerLocales: EN,
    });
    const call = directedText.mock.calls.at(-1);
    if (!call) throw new Error('directedText was not called');
    const cue = call[1] as unknown as Cue;
    expect(cue.direction).toContain(EASY_QUESTION);
    expect(cue.direction).not.toContain(MIND);
  });
});

describe('STRANGER_GREETING_EASY reaches English calls only', () => {
  it.each([
    ['en-US', ['en-US']],
    ['en', ['en']],
    ['en-GB with en-US', ['en-GB', 'en-US']],
    ['upper case', ['EN-us']],
    ['upper case, no region', ['EN']],
    ['underscore region', ['en_GB']],
    ['private-use subtags', ['en-US-x-private']],
  ])('%s: the easy question', (_name, locales) => {
    expect(greetingDirection('ferni', ON, { firstCall: true, locales })).toContain(EASY_QUESTION);
    expect(greetingDirection('ferni', ON, { unplaced: true, locales })).toContain(EASY_QUESTION);
  });

  it.each([
    ['Spanish', ['es-US']],
    ['Spanish, no region', ['es']],
    ['Spanish first, then English', ['es-MX', 'en-US']],
    ['English first, then Spanish', ['en-US', 'es-US']],
    ['another language', ['pt-BR']],
    ['no tags (a phone call)', []],
    ['no tags passed', undefined],
    ['"eng" is not English here', ['eng']],
    ['"end" only starts like en', ['end']],
    ['"english" is not a tag', ['english']],
    ['an empty tag', ['']],
    ['English with a malformed Spanish tag', ['en-US', 'espanol']],
    ['English with an underscore Spanish tag', ['en-US', 'es_MX']],
  ])('%s: the old string, byte for byte', (_name, locales) => {
    expect(greetingDirection('ferni', ON, { firstCall: true, locales })).toBe(
      STRANGER_GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', ON, { unplaced: true, locales })).toBe(
      UNPLACED_GREETING_DIRECTION
    );
  });

  // Malformed tags as the gate sees them (applyCallOrigin trims and drops "" before the live
  // gate: call-locales.test.ts pins what a real call does with these).
  const MALFORMED = [
    'en-',
    'en_',
    'en-!!garbage',
    'en--US',
    'en-US-',
    'english',
    ' en',
    'en ',
    '',
    'eng',
    'fr',
  ];

  it.each(MALFORMED)('%j alone: the old string, byte for byte', (tag) => {
    expect(greetingDirection('ferni', ON, { firstCall: true, locales: [tag] })).toBe(
      STRANGER_GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', ON, { unplaced: true, locales: [tag] })).toBe(
      UNPLACED_GREETING_DIRECTION
    );
  });

  it.each(MALFORMED)('%j beside en-US: the old string, byte for byte', (tag) => {
    expect(greetingDirection('ferni', ON, { firstCall: true, locales: ['en-US', tag] })).toBe(
      STRANGER_GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', ON, { unplaced: true, locales: [tag, 'en-US'] })).toBe(
      UNPLACED_GREETING_DIRECTION
    );
  });

  it.each([
    ['English call', EN, true],
    ['Spanish call', ['es-US'], false],
    ['mixed call', ['en-US', 'es-US'], false],
    ['untagged call', undefined, false],
  ])("%s: the live hello's direction, through userData", async (_name, callerLocales, easy) => {
    vi.stubEnv('STRANGER_GREETING_EASY', 'on');
    await directedGreeting('sge-locale', 'ferni', {
      userId: 'voice-eval-new',
      userName: 'Sam',
      isReturningUser: false,
      callerLocales,
    });
    const call = directedText.mock.calls.at(-1);
    if (!call) throw new Error('directedText was not called');
    const cue = call[1] as unknown as Cue;
    if (easy) {
      expect(cue.direction).toContain(EASY_QUESTION);
      expect(cue.direction).not.toContain(MIND);
    } else {
      expect(cue.direction).toContain(STRANGER_GREETING_DIRECTION);
      expect(cue.direction).not.toContain(EASY_QUESTION);
    }
  });
});
