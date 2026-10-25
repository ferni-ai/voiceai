/**
 * detectCallIntent decides whether a text asks for a call now. With
 * SMS_CALL_ME on that places a real call, so only a short whole-text ask
 * counts: a call mentioned inside a longer sentence, assent alone, negations,
 * names and calls for later all read as no.
 */
import { describe, expect, it } from 'vitest';
import { detectCallIntent } from '../inbound-router.js';

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
