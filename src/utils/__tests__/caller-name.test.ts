import { describe, expect, it } from 'vitest';

import {
  acceptsSpokenName,
  extractCallerName,
  findCallerName,
  nameCaptureStrict,
  rejectsAsName,
} from '../caller-name.js';
import { FERNI_HEARD_AS, HEARD_AS, TEAM_FIRST_NAMES } from '../teammate-talk.js';

/** The prod lines of 2026-10-19 and the cases the fix must keep. */
const CASES: Array<[string, string | null]> = [
  ["Oh, my name's not showing.", null],
  ['Hey Ferni, how are you', null],
  ['my name is Seth', 'Seth'],
  ["I'm Seth", 'Seth'],
  ['call me Sam', 'Sam'],
  ["I'm not sure", null],
  ['this is Seth', 'Seth'],
];

describe('extractCallerName', () => {
  it.each(CASES)('%j -> %j', (line, name) => {
    expect(extractCallerName(line)).toBe(name);
  });

  it('takes the name only as it was transcribed: capitalised', () => {
    expect(extractCallerName('my name is seth')).toBeNull();
    expect(extractCallerName("my name's Seth")).toBe('Seth');
  });

  it('never takes Ferni or a teammate, in any case or speech-to-text spelling', () => {
    expect(extractCallerName('this is ferni right')).toBeNull();
    expect(extractCallerName('This is Ferni')).toBeNull();
    expect(extractCallerName("I'm Maya")).toBeNull();
    expect(extractCallerName("I'm Mya")).toBeNull();
  });

  it('never takes Ferni as heard by speech-to-text (dev call 2026-10-20)', () => {
    // The line that named a caller "Fernie" on dev with NAME_CAPTURE_STRICT=on.
    expect(extractCallerName('Anyway, this is Fernie, right?')).toBeNull();
    expect(extractCallerName("I'm talking to Ferny")).toBeNull();
    expect(extractCallerName('Hey Fernie, this is Seth')).toBe('Seth');
  });

  it('cuts a greeting said to someone, and keeps what follows it', () => {
    expect(extractCallerName('hey ferni how are you doing')).toBeNull();
    expect(extractCallerName('Hi Ferni, Ferni here')).toBeNull();
    expect(extractCallerName("Hi Ferni, it's Seth")).toBe('Seth');
    expect(extractCallerName('Hey Ferni, this is Seth')).toBe('Seth');
    expect(extractCallerName('Hi, Seth here')).toBe('Seth');
  });

  it('takes "it\'s <Name>" only in an opener that starts with a hello', () => {
    expect(extractCallerName("It's Monday again")).toBeNull();
    expect(extractCallerName("well it's Seth")).toBeNull();
  });

  it('skips a refused word and finds a real name later in the line', () => {
    expect(extractCallerName("I'm not sure, but my name is Seth")).toBe('Seth');
    expect(findCallerName('so yeah my name is Seth Ford')).toEqual({
      name: 'Seth',
      phrase: 'my name is Seth',
    });
  });

  it('refuses function words, feelings and other non-names after a cue', () => {
    for (const line of [
      "I'm So tired",
      "I'm Just calling",
      'call me Back later',
      'I am Calling about my order',
      "I'm Fine",
      'Nothing here really',
    ]) {
      expect(extractCallerName(line), line).toBeNull();
    }
  });

  it('matches cue words whole, never inside another word', () => {
    expect(extractCallerName('Mathis is Sam')).toBeNull();
    expect(extractCallerName('Liam Seth')).toBeNull();
    expect(extractCallerName('recall me Sam')).toBeNull();
  });

  it('is not a name when possessive or spoken for someone else', () => {
    expect(extractCallerName("I'm Jess's mom")).toBeNull();
    expect(extractCallerName("I'm Jess, his wife")).toBeNull();
  });

  it('anchored: a stored fact only when the cue opens it', () => {
    expect(extractCallerName('name is Seth', { anchored: true })).toBe('Seth');
    expect(extractCallerName("User's name is Seth", { anchored: true })).toBe('Seth');
    expect(extractCallerName('Talked about it and I am Seth', { anchored: true })).toBeNull();
  });
});

describe('name word checks', () => {
  it('rejects every team first name and speech-to-text spelling, from the roster in code', () => {
    for (const n of [...TEAM_FIRST_NAMES, ...FERNI_HEARD_AS, ...Object.keys(HEARD_AS)]) {
      expect(rejectsAsName(n), n).toBe(true);
      const cap = n[0].toUpperCase() + n.slice(1);
      expect(acceptsSpokenName(cap), cap).toBe(false);
    }
  });

  it('accepts a capitalised name and refuses lower case', () => {
    expect(acceptsSpokenName('Seth')).toBe(true);
    expect(acceptsSpokenName('Mary-Jane')).toBe(true);
    expect(acceptsSpokenName('seth')).toBe(false);
    expect(acceptsSpokenName('Not')).toBe(false);
  });
});

describe('nameCaptureStrict', () => {
  it('is off by default and on with NAME_CAPTURE_STRICT=on', () => {
    expect(nameCaptureStrict({})).toBe(false);
    expect(nameCaptureStrict({ NAME_CAPTURE_STRICT: 'on' })).toBe(true);
    expect(nameCaptureStrict({ NAME_CAPTURE_STRICT: 'off' })).toBe(false);
  });
});
