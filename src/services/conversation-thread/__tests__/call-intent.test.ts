/**
 * detectCallIntent decides whether a text asks for a call now. With
 * SMS_CALL_ME on that places a real call, so only a short whole-text ask
 * counts: a call mentioned inside a longer sentence, assent alone, negations,
 * names and calls for later all read as no.
 */
import { describe, expect, it } from 'vitest';
import { detectCallIntent, detectTalkIntent } from '../inbound-router.js';

describe('detectCallIntent', () => {
  it.each([
    'call me',
    'Call me.',
    'call me!! 📞',
    'can you call me?',
    'Hey Ferni, can you call me?',
    'ok, call me',
    'yes please call me back',
    'call me back',
    'call me now please',
    'give me a call',
    "let's talk",
    'can we talk?',
    'talk to me',
  ])('asks for a call: %s', (text) => {
    expect(detectCallIntent(text)).toBe(true);
  });

  it.each([
    'ok',
    'yes',
    'Sure',
    "I'd like that",
    "don't call me",
    'please do not call me',
    'no need to call me back',
    'stop calling me',
    'call me tomorrow',
    'call me back tonight',
    'call me at 5pm',
    'call me on Friday',
    'call me Seth',
    'thanks, sounds good',
    // a call inside a longer sentence (verifier probes, 2026-10-25)
    'did you call me?',
    'why did you call me',
    'my mom will call me',
    'call me when im home',
    'I need to call back my boss',
    'I need to talk to my boss',
    'I want to talk to my sister about it',
    "let's talk about it over text",
    'can we talk here',
  ])('does not ask for a call now: %s', (text) => {
    expect(detectCallIntent(text)).toBe(false);
  });
});

/**
 * What the texter gets back, main vs this change (2026-10-25). `main` is what
 * main's matcher did: every 'reply' there was "Let me call you now..." with no
 * call. Here a 'reply' is the honest "Open Ferni whenever you're ready."
 * Reply by default: the only texts that lose their reply are bare assent.
 * Verifier r2 of #2841 showed a word list deciding silence fails fresh
 * distress texts ("stop it hurts, call me"), so no other silence class exists.
 */
const REPLY = 'reply' as const;
const both = (text: string) => ({ text, main: REPLY, now: REPLY });
const TABLE: { text: string; main: 'reply' | 'none'; now: 'reply' | 'none'; why?: string }[] = [
  ...[
    'I want to die, call me',
    'I want to kill myself, can you call me',
    "please call me I can't do this anymore",
    "I'm scared, call me",
    'I need to talk',
    'need to talk to someone',
    'can we talk? im not ok',
    'call me',
    "I'd like that",
    // Fresh distress texts from the #2841 r2 verify (22d2f2635): 10 of these went silent there
    "I can't stop crying, call me",
    "I can't stop shaking, please call me",
    "it won't stop hurting, can we talk",
    'I never feel ok anymore, call me',
    "I don't feel safe, can we talk",
    "don't leave me, call me",
    "please don't hang up on me, call me back",
    'i dont want to live, call me',
    'stop it hurts, call me',
    'I want to die, call me Mom',
    "I don't want to be here anymore, call me",
    "I don't know what to do, I need to talk",
    "I can't do this, call me",
    'nobody would care, call me',
    "I'm not ok. call me",
    "call me please I'm scared",
    'I want to end it. call me',
    // Not asks, but an honest invitation is harmless and silence is never chosen by a word list
    "don't call me, I just want to die",
    'call me Ishmael, I want to end it',
    'she said call me if I feel like ending it',
    'call me Ishmael',
    'call me crazy but I like it',
    'she said to call me back later',
  ].map(both),
  { text: 'ok', main: 'reply', now: 'none', why: 'bare assent' },
  { text: 'yes', main: 'reply', now: 'none', why: 'bare assent' },
  { text: 'sure', main: 'reply', now: 'none', why: 'bare assent' },
  { text: 'please', main: 'reply', now: 'none', why: 'bare assent' },
  { text: 'running late, see you at 6', main: 'none', now: 'none' },
];

describe('detectTalkIntent: the reply the texter gets, pinned against main', () => {
  it.each(TABLE)('$text: $main on main, $now now', ({ text, now }) => {
    expect(detectTalkIntent(text) ? 'reply' : 'none').toBe(now);
  });

  it('only bare assent loses its reply, and nothing gains one', () => {
    const lost = TABLE.filter((row) => row.main === 'reply' && row.now === 'none');
    expect(lost.map((row) => row.text).sort()).toEqual(['ok', 'please', 'sure', 'yes']);
    expect(TABLE.filter((row) => row.main === 'none' && row.now === 'reply')).toEqual([]);
  });

  it('a crisis text that asks to talk is answered, but only a whole-text ask can dial', () => {
    expect(detectTalkIntent('I want to die, call me')).toBe(true);
    expect(detectCallIntent('I want to die, call me')).toBe(false);
  });
});
