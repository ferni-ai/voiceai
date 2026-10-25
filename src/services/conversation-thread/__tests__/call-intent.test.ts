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
 * Never lower at the output: no text may lose its reply except the ones that
 * were never asks to talk (bare assent, negations, names, someone else's words).
 */
const TABLE: { text: string; main: 'reply' | 'none'; now: 'reply' | 'none'; why?: string }[] = [
  { text: 'I want to die, call me', main: 'reply', now: 'reply' },
  { text: 'I want to kill myself, can you call me', main: 'reply', now: 'reply' },
  { text: "please call me I can't do this anymore", main: 'reply', now: 'reply' },
  { text: "I'm scared, call me", main: 'reply', now: 'reply' },
  { text: 'I need to talk', main: 'reply', now: 'reply' },
  { text: 'need to talk to someone', main: 'reply', now: 'reply' },
  { text: 'can we talk? im not ok', main: 'reply', now: 'reply' },
  { text: 'call me', main: 'reply', now: 'reply' },
  { text: 'ok', main: 'reply', now: 'none', why: 'assent' },
  { text: 'yes', main: 'reply', now: 'none', why: 'assent' },
  { text: 'sure', main: 'reply', now: 'none', why: 'assent' },
  { text: 'please', main: 'reply', now: 'none', why: 'assent' },
  { text: "I'd like that", main: 'reply', now: 'reply' },
  { text: "don't call me", main: 'reply', now: 'none', why: 'negated' },
  { text: 'call me Ishmael', main: 'reply', now: 'none', why: 'name' },
  { text: 'call me crazy but I like it', main: 'reply', now: 'none', why: 'name' },
  { text: 'she said to call me back later', main: 'reply', now: 'none', why: 'reported' },
  // Crisis words beside a non-ask: pinned as they are; the crisis screen
  // (SMS_CRISIS_SCREEN) is what must answer these, not this matcher.
  { text: "don't call me, I just want to die", main: 'reply', now: 'none', why: 'negated' },
  { text: 'call me Ishmael, I want to end it', main: 'reply', now: 'none', why: 'name' },
  { text: 'she said call me if I feel like ending it', main: 'reply', now: 'reply' },
  { text: 'running late, see you at 6', main: 'none', now: 'none' },
];

describe('detectTalkIntent: the reply the texter gets, pinned against main', () => {
  it.each(TABLE)('$text: $main on main, $now now', ({ text, now }) => {
    expect(detectTalkIntent(text) ? 'reply' : 'none').toBe(now);
  });

  it('only texts that were never asks to talk lose their reply', () => {
    const lost = TABLE.filter((row) => row.main === 'reply' && row.now === 'none');
    expect(lost.every((row) => row.why !== undefined)).toBe(true);
    expect(TABLE.filter((row) => row.main === 'none' && row.now === 'reply')).toEqual([]);
  });

  it('a crisis text that asks to talk is answered, but only a whole-text ask can dial', () => {
    expect(detectTalkIntent('I want to die, call me')).toBe(true);
    expect(detectCallIntent('I want to die, call me')).toBe(false);
  });
});
