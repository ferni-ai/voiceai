/**
 * HELD_BREAK_PUNCTUATION (#3165): the parser's comma and period cleanup looks
 * past held native breaks and spaced comma runs. Off, the old cleanup runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSMLProcessor, parseSSML } from '../ssml/processor.js';
import { fixStuckPunctuation } from '../ssml/stuck-punctuation.js';

// The late-night fallback greeting's closing, after its question.
const LATE = 'What\'s on your mind?<break time="500ms"/>[soft breath]<break time="200ms"/>';
// A breath cue between two short breaks ("Breathe." then a spaced comma pair).
const BREATHE = 'Breathe.<break time="300ms"/>[exhale]<break time="200ms"/>';

describe('HELD_BREAK_PUNCTUATION on', () => {
  beforeEach(() => vi.stubEnv('HELD_BREAK_PUNCTUATION', 'on'));
  afterEach(() => vi.unstubAllEnvs());
  const processor = createSSMLProcessor();

  it('drops a stray comma behind a held native break', () => {
    expect(parseSSML(LATE).cleanText).toBe('What\'s on your mind?<break time="500ms"/>');
    expect(processor.parse('Wow!<break time="450ms"/>. Okay.').cleanText).toBe(
      'Wow!<break time="450ms"/> Okay.'
    );
    // a comma after a word, not sentence punctuation, is a real pause: kept
    expect(processor.parse('Hey<break time="500ms"/>, you.').cleanText).toBe(
      'Hey<break time="500ms"/>, you.'
    );
  });

  it('collapses the spaced commas two short breaks leave around a stripped cue', () => {
    expect(processor.parse(BREATHE).cleanText).toBe('Breathe.');
    expect(processor.parse('So<break time="250ms"/>[pause]<break time="300ms"/> yes.').cleanText).toBe('So, yes.'); // prettier-ignore
  });

  it('still drops the plain stuck comma and period', () => {
    expect(processor.parse('Hey. Talk to me., Mm.,').cleanText).toBe('Hey. Talk to me. Mm.');
    expect(processor.parse("What's happening?.").cleanText).toBe("What's happening?");
  });
});

describe('HELD_BREAK_PUNCTUATION off', () => {
  it('runs the old cleanup: the comma behind a held break stays', () => {
    const off = { HELD_BREAK_PUNCTUATION: 'off' };
    expect(fixStuckPunctuation('mind?⦃BREAK500⦄, ', off)).toBe('mind?⦃BREAK500⦄, ');
    expect(fixStuckPunctuation('So, , yes.', off)).toBe('So, , yes.');
    expect(fixStuckPunctuation('Talk to me., Mm.,', off)).toBe('Talk to me. Mm.');
  });

  it('is the default', () => {
    expect(fixStuckPunctuation('mind?⦃BREAK500⦄, ', {})).toBe('mind?⦃BREAK500⦄, ');
    expect(fixStuckPunctuation('mind?⦃BREAK500⦄, ', { HELD_BREAK_PUNCTUATION: 'on' })).toBe(
      'mind?⦃BREAK500⦄ '
    );
  });
});
