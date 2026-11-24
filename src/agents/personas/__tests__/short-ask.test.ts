import { afterEach, describe, expect, it } from 'vitest';
import { SHORT_ASK_LINE, asksForShort, shortAskLine } from '../short-ask.js';
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
];

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
  it('is null with the flag off or unset, even on a clear ask', () => {
    expect(shortAskLine(ASKS[0], {})).toBeNull();
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'off' })).toBeNull();
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'true' })).toBeNull();
  });

  it('gives the one-sentence line with the flag on, only on an ask', () => {
    expect(shortAskLine(ASKS[0], { SHORT_ASK: 'on' })).toBe(SHORT_ASK_LINE);
    expect(shortAskLine(NOT_ASKS[0], { SHORT_ASK: 'on' })).toBeNull();
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
