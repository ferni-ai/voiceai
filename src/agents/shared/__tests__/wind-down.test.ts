/**
 * The wind-down read (#3197): a caller wrapping up with no goodbye word.
 * Whole turns, whole words; a question, a "but", or any risk is never one.
 */
import { describe, expect, it } from 'vitest';
import { callerSaysGoodbye } from '../goodbye-phrases.js';
import { windingDown } from '../wind-down.js';

/** The read with SIGNOFF_READ_WIDE on. */
const callerWindsDown = (line: string): boolean => windingDown(line, { SIGNOFF_READ_WIDE: 'on' });

/** Sign-offs from #3197's red-team calls that the goodbye read misses. */
const WIND_DOWNS = [
  "Ha, okay. Thanks, man. I'll call him tonight.",
  'night.',
  "All right. I'll look into that. Thanks.",
  'Okay. That actually helps. Thanks, Sam.',
  'Thanks. I needed that.',
  'Thanks for listening.',
  "That helps. I'm gonna try that.",
];

/** Lines that keep the talk going, or are too thin to read as leaving. */
const NOT_WIND_DOWNS = [
  'night shift was rough',
  'Night shift was rough, honestly.',
  'thanks for asking, but actually...',
  'Thanks for asking, but actually I wanted to talk about my dad.',
  'Thanks, that helps, but what about Tuesday?',
  'Thanks.',
  'Yes, thanks.',
  "I'll call him tonight.",
  'That helps.',
  "Thanks. I'll be honest, I hate it.",
  'Thanks, but.',
  'thanks for the tip',
  'Thanks. That helps. So what do I tell him?',
];

describe('windingDown (SIGNOFF_READ_WIDE on)', () => {
  it.each(WIND_DOWNS)('reads %j as a wind-down the goodbye read misses', (line) => {
    expect(callerSaysGoodbye(line)).toBe(false);
    expect(callerWindsDown(line)).toBe(true);
  });

  it.each(NOT_WIND_DOWNS)('does not read %j as a wind-down', (line) => {
    expect(callerWindsDown(line)).toBe(false);
  });

  it('a wind-down that carries risk is not one', () => {
    expect(callerWindsDown('Thanks for listening. I just want to die tonight.')).toBe(false);
    expect(callerWindsDown("Thanks for listening. I won't be here tomorrow.")).toBe(false);
    // "tonight" is a plan's time, never a pass for a crisis line in the same shape
    expect(callerWindsDown("Thanks, man. I'll end it tonight.")).toBe(false);
    expect(callerWindsDown("Thanks, man. I'll call him tonight.")).toBe(true);
  });

  it('only with SIGNOFF_READ_WIDE on', () => {
    const line = "Ha, okay. Thanks, man. I'll call him tonight.";
    expect(windingDown(line, {})).toBe(false);
    expect(windingDown(line, { SIGNOFF_READ_WIDE: 'off' })).toBe(false);
    expect(windingDown(line, { SIGNOFF_READ_WIDE: 'on' })).toBe(true);
    expect(windingDown('night shift was rough', { SIGNOFF_READ_WIDE: 'on' })).toBe(false);
  });
});
