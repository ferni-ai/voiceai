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

/**
 * Veiled farewells the PR #4271 verifier found reading as wind-downs at a0d260f4ef: a
 * farewell-risk line was cleared once "tonight"/"soon" was taken out. Each must stay
 * false: farewell risk fails closed, except a plan to call or text someone named.
 */
const VEILED_FAREWELLS = [
  "Thanks for everything. I won't be around after tonight.",
  "Thank you for listening. I'll be gone soon.",
  "Thanks, man. I'll end it tonight.",
  'Thanks for always being there. Goodnight, for good.',
  'I appreciate you. Tell my mom I love her. Night.',
  "Thanks. I'll take care of it tonight, all of it.",
  'thanks for everything, this is goodbye',
  "Thanks for listening. I'll check out tonight.",
  "Thanks for the help. I'll let go tonight.",
  "Thanks for listening. I'll let it all go tonight.",
  "Thanks for listening. I'll go to sleep tonight.",
  "Thanks for listening. I'll go to sleep soon.",
  "Thanks for listening. I'll go be with my mom soon.",
  "Thanks for listening. I'll go see my brother soon.",
  "Thanks for listening. I'll see my dad soon.",
  "Thanks for listening. I'm going to go join her soon.",
  "Thanks for the help. I'll give away my things tonight.",
  "Thanks for the help. I'll give my dog to my sister tonight.",
  "Thanks for listening. I'll write the letters tonight.",
  "Thanks for listening. I'll write my note tonight.",
  "Thanks for listening. I'll tell everyone goodbye tonight.",
  "Thanks for listening. I'll go to the bridge tonight.",
  "Thanks for listening. I'll go take the pills tonight.",
  "Thanks for listening. I'll go away soon.",
  "Thanks for listening. I'll go away tonight.",
  "Thanks for listening. I'll let them go tonight.",
  "Thanks for listening. I'm going to let go soon.",
  "Thanks, man. I'll go tonight.",
  "Thanks, man. I'll go soon.",
  "Thank you. I'll start the car tonight.",
  "Thanks for the talk. I'll go for good tonight.",
  "Thanks for the help. I'll try to sleep forever.",
  "Thanks for listening. I'll go home to God tonight.",
  "Thanks for listening. I'm going to see grandma soon.",
  "Thanks. That helps. I'll go rest now.",
  "Thanks for the help. I'll figure out the rope tonight.",
  "Thanks. I'll check out early tonight.",
  "night. thanks for listening. I'll go soon.",
  "Thanks for listening. I'll let you go, forever.",
  "Thanks for listening. I'll let you go for the last time.",
  "Thanks for listening. I'll call God tonight.",
  "Thanks for listening. I'll call everyone tonight.",
  "I'll call him tonight, but I'm scared he'll yell",
];

/** The one shape whose time word may clear the risk read: call or text someone named. */
const CONTACT_PLANS = [
  "Thanks, man. I'll call him tonight.",
  "Thanks. I'm going to text her tomorrow.",
  "That helps. I'll call my brother later.",
  "Thanks for listening. I'm gonna FaceTime Sam soon.",
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

  it.each(VEILED_FAREWELLS)('fails closed on the veiled farewell %j', (line) => {
    expect(callerWindsDown(line)).toBe(false);
  });

  it.each(CONTACT_PLANS)('a thanks and a plan to reach someone named is one: %j', (line) => {
    expect(callerWindsDown(line)).toBe(true);
  });

  it('only with SIGNOFF_READ_WIDE on', () => {
    const line = "Ha, okay. Thanks, man. I'll call him tonight.";
    expect(windingDown(line, {})).toBe(false);
    expect(windingDown(line, { SIGNOFF_READ_WIDE: 'off' })).toBe(false);
    expect(windingDown(line, { SIGNOFF_READ_WIDE: 'on' })).toBe(true);
    expect(windingDown('night shift was rough', { SIGNOFF_READ_WIDE: 'on' })).toBe(false);
  });
});
