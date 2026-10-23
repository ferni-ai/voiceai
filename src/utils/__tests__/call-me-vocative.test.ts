import { describe, expect, it } from 'vitest';

import {
  callMeAddressesTeam,
  callMeIntent,
  callMeVocativeEnabled,
  isTeamVocative,
  vocativesFor,
} from '../call-me-vocative.js';
import { extractCallerName } from '../caller-name.js';

const ferni = (words: string, extra: { callerName?: string; called?: boolean } = {}) =>
  callMeIntent(words, { persona: 'Ferni', ...extra });

describe('callMeIntent: ring', () => {
  it.each([
    'Can you call me Fern?', // prod 2026-10-23, STT for "call me, Ferni"
    'Can you call me, Ferni?',
    'call me Ferni',
    'Call me Fernie please',
    'could you call me Fernee',
    'call me Fern-ee',
    'please call me up, Ferni',
    'Ferni, can you call me now, Fern?',
  ])('reads %j as a phone call', (words) => {
    expect(ferni(words)).toBe('ring');
  });

  it("uses the active persona's name and its STT spellings", () => {
    expect(callMeIntent('Call me, Maya.', { persona: 'Maya' })).toBe('ring');
    expect(callMeIntent('can you call me Mya', { persona: 'Maya' })).toBe('ring');
    // Ferni's spellings belong to Ferni only.
    expect(callMeIntent('can you call me Fern', { persona: 'Maya' })).toBeNull();
    expect(callMeIntent('call me Maya', { persona: 'Ferni' })).toBeNull();
  });

  it('rings even when a call was already placed', () => {
    expect(ferni('call me Ferni', { called: true })).toBe('ring');
  });
});

describe('callMeIntent: clarify', () => {
  it.each(['you can call me Fern', 'Just call me Ferni', 'my friends call me Fern'])(
    'asks once for %j (a nickname cue)',
    (words) => {
      expect(ferni(words)).toBe('clarify');
    }
  );

  it('asks once when the name is also the caller’s own', () => {
    expect(ferni('can you call me Fern?', { callerName: 'Fern Lee' })).toBe('clarify');
  });
});

describe('callMeIntent: did you call me', () => {
  it.each([
    'Did you give me a call?', // prod 2026-10-23, STT for "Can you give me a call?"
    'did you call me?',
    'Did you call me yet?',
    'did you just ring me',
    'Did you try calling me, Ferni?',
  ])('reads %j as wanting a call when none was placed', (words) => {
    expect(ferni(words)).toBe('did-you-call');
  });

  it('is a plain question once a call was placed this session', () => {
    expect(ferni('Did you give me a call?', { called: true })).toBeNull();
  });
});

describe('callMeIntent: none', () => {
  it.each([
    'call me Sam',
    'call me later',
    'Call me crazy, but I like it',
    'you can call me Seth',
    'did you call my mom?',
    'Did you just call me crazy?',
    'call me Fernando',
    'call me Ferniture', // a longer word, never a substring match
    'I love ferns',
    'Hey for, how are you',
    '',
  ])('leaves %j alone', (words) => {
    expect(ferni(words)).toBeNull();
  });
});

describe('vocativesFor', () => {
  it('is the name plus its STT spellings', () => {
    expect(vocativesFor('Ferni')).toEqual(
      expect.arrayContaining(['ferni', 'fernie', 'fern', 'fernee'])
    );
    expect(vocativesFor('Nayan')).toEqual(expect.arrayContaining(['nayan', 'naya']));
    expect(vocativesFor('')).toEqual([]);
  });
});

describe('the name paths', () => {
  it('callMeAddressesTeam: Ferni or a teammate, never anyone else', () => {
    expect(callMeAddressesTeam('Can you call me Fern?')).toBe(true);
    expect(callMeAddressesTeam('you can call me Jordan')).toBe(true);
    expect(callMeAddressesTeam('you can call me Seth')).toBe(false);
    expect(callMeAddressesTeam('did you call me?')).toBe(false);
  });

  it('isTeamVocative', () => {
    expect(isTeamVocative('Fern')).toBe(true);
    expect(isTeamVocative('Seth')).toBe(false);
  });

  it('extractCallerName skips "call me Fern" only with CALL_ME_VOCATIVE=on', () => {
    const before = { ...process.env };
    try {
      process.env.NAME_CAPTURE_STRICT = 'on';
      delete process.env.CALL_ME_VOCATIVE;
      expect(extractCallerName('you can call me Fern')).toBe('Fern');
      process.env.CALL_ME_VOCATIVE = 'on';
      expect(extractCallerName('you can call me Fern')).toBeNull();
      expect(extractCallerName('you can call me Seth')).toBe('Seth');
      // "Fern" is still a name everywhere but after "call me".
      expect(extractCallerName("I'm Fern")).toBe('Fern');
    } finally {
      process.env = before;
    }
  });

  it('the flag is off by default', () => {
    expect(callMeVocativeEnabled({})).toBe(false);
    expect(callMeVocativeEnabled({ CALL_ME_VOCATIVE: 'on' })).toBe(true);
  });
});
