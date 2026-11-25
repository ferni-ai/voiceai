import { afterEach, describe, expect, it } from 'vitest';
import { shortAskLine } from '../short-ask.js';
import { rngFor, turnShapeFor } from '../turn-shape.js';

// The caller's lines from rt-1124-short-version (#4383), plus fresh paraphrases.
const ASKS = [
  "Okay, short version though. I've got like 2 minutes before a meeting.",
  'shorter. like one sentence.',
  'Can you just give me the quick version?',
  'Just the bottom line, what do I do?',
  'tl;dr me',
  "Keep it short, I'm driving.",
  'Say it in one sentence.',
  'No, make it even shorter.',
  'Cliff notes?',
  // A negation in another clause, or followed by words that aren't part of an ask, leaves the ask.
  "I don't have long so keep it short.",
  "It's not a big deal, just give me the quick version.",
];

// A caller telling their own story, or asking for MORE, must never clip the reply.
const NOT_ASKS = [
  "And honestly, don't give me the one liner. I actually want you to walk me through what I'd say, like word for word.",
  'Not the short version, I want the whole thing.',
  'The short version is she left and took the dog.',
  "Here's the short version: my boss quit today.",
  "I'll give you the quick version, we broke up.",
  'I told him to keep it short and he talked for an hour.',
  'My commute is way shorter now that we moved.',
  'The days are getting shorter and I hate it.',
  'The short version of the story is kind of boring.',
  'Walk me through how you would plan the whole day.',
  // Longer negations and reported asks (review on #4385): six ask words may sit in between.
  'I do not want you to give me the short version, I want all of it.',
  'I told him to just keep it short and he rambled anyway.',
  'I told my manager twice to keep it short.',
];

/** The detector, read through the only export: the flag on, so a hit is the line. */
const ON = { SHORT_ASK: 'on' };
const asksForShort = (line: string): boolean => shortAskLine(line, ON) !== null;
const SHORT_ASK_LINE = shortAskLine(ASKS[0], ON) ?? '';

const before = process.env.SHORT_ASK;
afterEach(() => {
  if (before === undefined) delete process.env.SHORT_ASK;
  else process.env.SHORT_ASK = before;
});

describe('asksForShort', () => {
  it.each(ASKS)('reads a direct ask for less: %s', (line) => {
    expect(asksForShort(line)).toBe(true);
  });

  it.each(NOT_ASKS)('fails closed on a negated ask or a caller telling: %s', (line) => {
    expect(asksForShort(line)).toBe(false);
  });
});

describe('shortAskLine', () => {
  it('is null with the flag off, unset or unknown, even on a clear ask', () => {
    expect(shortAskLine(ASKS[0], {})).toBeNull();
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'off' })).toBeNull();
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'false' })).toBeNull();
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'maybe' })).toBeNull();
  });

  it('gives the one-sentence line with the flag on in any flagOn word, only on an ask', () => {
    expect(SHORT_ASK_LINE).toContain('answer in one sentence');
    expect(SHORT_ASK_LINE).toContain('No offer, no teammate, no question.');
    for (const word of ['on', 'true', ' ON '])
      expect(shortAskLine(ASKS[0], { SHORT_ASK: word })).toBe(SHORT_ASK_LINE);
    expect(shortAskLine(NOT_ASKS[0], ON)).toBeNull();
  });
});

describe('turn-shape reminder with SHORT_ASK', () => {
  const reminder = (text: string, mode: 'model' | 'dice') =>
    turnShapeFor(text, rngFor(text), mode).reminder;

  it.each(['model', 'dice'] as const)(
    '%s: flag off leaves the reminder without the line',
    (mode) => {
      delete process.env.SHORT_ASK;
      const unset = reminder(ASKS[0], mode);
      process.env.SHORT_ASK = 'off';
      expect(reminder(ASKS[0], mode)).toBe(unset);
      expect(unset).not.toContain(SHORT_ASK_LINE);
    }
  );

  it.each(['model', 'dice'] as const)(
    '%s: flag on ends the reminder with the line, and otherwise changes nothing',
    (mode) => {
      delete process.env.SHORT_ASK;
      const off = reminder(ASKS[0], mode);
      process.env.SHORT_ASK = 'on';
      const on = reminder(ASKS[0], mode);
      expect(on).toBe(`${off} ${SHORT_ASK_LINE}`);
    }
  );

  it.each(['model', 'dice'] as const)(
    '%s: flag on leaves a caller who asked for more untouched',
    (mode) => {
      delete process.env.SHORT_ASK;
      const off = reminder(NOT_ASKS[0], mode);
      process.env.SHORT_ASK = 'on';
      expect(reminder(NOT_ASKS[0], mode)).toBe(off);
    }
  );
});
