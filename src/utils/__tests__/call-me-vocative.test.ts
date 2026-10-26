import { afterEach, describe, expect, it } from 'vitest';

import {
  callMeVocativeEnabled,
  personaLike,
  readCallMe,
  withoutVocatives,
} from '../call-me-vocative.js';
import { extractCallerName } from '../caller-name.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('personaLike', () => {
  it.each([
    ['Ferni', 'ferni'],
    ['Fern', 'ferni'],
    ['Ferney', 'ferni'], // round 1 renamed the owner to this: not in any list
    ['Fernie', 'ferni'],
    ['Furny', 'ferni'],
    ['Fern-ee', 'ferni'],
    ['Pete', 'peter'],
    ['Mya', 'maya'],
    ['Maia', 'maya'],
    ['Jordyn', 'jordan'],
    ['Nian', 'nayan'],
    ['alex', 'alex'],
  ])('%s sounds like %s', (word, team) => {
    expect(personaLike(word)).toBe(team);
  });

  it.each(['Sam', 'Jess', 'Seth', 'Nathan', 'Bernie', 'Fergie', 'Max', 'Jordy', 'Fernanda', 'S'])(
    '%s is no team name',
    (word) => {
      expect(personaLike(word)).toBeNull();
    }
  );
});

describe('readCallMe', () => {
  it.each([
    'call me, Ferni',
    'Ferni, call me',
    'Hey Ferni call me',
    'call me back Ferni',
    'give me a call, Ferni',
    'Can you call me right now, Ferni?',
    'Call me, um, Ferni',
    'call me asap Fern',
    'ring me',
    'can you call my cell',
  ])('%j rings', (words) => {
    expect(readCallMe(words, 'Ferni').intent).toBe('ring');
  });

  it.each([
    ['Can you call me Fern?', 'Fern'],
    ['Could you call me Ferney', 'Ferney'],
    ['could you just call me Fern', 'Fern'], // "could you just": asking, not a nickname cue
  ])('%j asks ring or name', (words, name) => {
    expect(readCallMe(words, 'Ferni')).toMatchObject({ intent: 'ask', name });
  });

  it.each([
    ['Just call me Pete', 'Pete'],
    ['My friends call me Mya', 'Mya'],
    ['Actually, call me Fern from now on', 'Fern'],
    ["Don't call me Seth, call me Fern", 'Fern'],
  ])('%j is a name to confirm, never a call', (words, name) => {
    const r = readCallMe(words, 'Ferni');
    expect(r.intent).toBeNull();
    expect(r.rename).toBe(name);
  });

  it.each([
    'call me Sam',
    'call me later',
    'call me tomorrow, Ferni',
    'call me crazy',
    "please don't call me",
    "that's what they call me",
  ])('%j is nothing to ring or ask', (words) => {
    expect(readCallMe(words, 'Ferni').intent).toBeNull();
  });

  it('the persona speaking decides which name is its own', () => {
    expect(readCallMe('call me Maya', 'Maya').intent).toBe('ring');
    expect(readCallMe('call me Maya', 'Ferni')).toMatchObject({ intent: 'ask', name: 'Maya' });
  });

  it('"did you call me?" is a question, not a request', () => {
    expect(readCallMe('Did you call me, Ferni?', 'Ferni').intent).toBe('did-you-call');
    expect(readCallMe('did you give me a call?', 'Ferni').intent).toBe('did-you-call');
    expect(readCallMe('Did you just call me crazy?', 'Ferni').intent).toBeNull();
  });

  it('only the vocative span is skipped', () => {
    const words = "I'm Sam, not Seth. Call me, Ferni.";
    const r = readCallMe(words, 'Ferni');
    expect(r.intent).toBe('ring');
    const rest = withoutVocatives(words, r.spans);
    expect(rest).toContain("I'm Sam, not Seth.");
    expect(rest).not.toContain('Ferni');
  });
});

describe('extractCallerName with CALL_ME_VOCATIVE', () => {
  it('never takes a word like a team name after "call me"; any other name stays', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    expect(callMeVocativeEnabled()).toBe(true);
    expect(extractCallerName('Could you call me Ferney')).toBeNull();
    expect(extractCallerName('Can you call me Fern?')).toBeNull();
    expect(extractCallerName('call me Sam')).toBe('Sam');
    expect(extractCallerName("I'm Sam, call me Ferney")).toBe('Sam');
  });

  it('flag off: as on main', () => {
    delete process.env.CALL_ME_VOCATIVE;
    expect(extractCallerName('Could you call me Ferney')).toBe('Ferney');
    expect(extractCallerName('Can you call me Fern?')).toBe('Fern');
  });
});
