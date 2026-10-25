import { describe, expect, it } from 'vitest';
import { fallbackCallSummary, isFillerLine } from '../call-summary-fallback.js';

const user = (content: string) => ({ role: 'user', content });

describe('isFillerLine', () => {
  it.each([
    'Yep',
    'yeah.',
    'Ok',
    'Okay!',
    'Mm',
    'Mm-hmm.',
    'Uh huh',
    'Just checking you out',
    'Yep, just checking you out.',
    'Hello? Can you hear me?',
    'Thank you, bye!',
    '',
    '   ',
  ])('treats %j as filler', (line) => {
    expect(isFillerLine(line)).toBe(true);
  });

  it.each([
    'My sister gets married on Saturday',
    'Yeah, the interview went well',
    'Testing out a new recipe tonight',
    'x',
    '你好世界',
  ])('keeps %j', (line) => {
    expect(isFillerLine(line)).toBe(false);
  });
});

describe('fallbackCallSummary', () => {
  it('stores nothing when the caller only said filler', () => {
    expect(fallbackCallSummary([user('Yep'), user('Just checking you out'), user('ok')])).toBe('');
  });

  it("keeps the caller's lines that say something, and drops their filler", () => {
    const summary = fallbackCallSummary([
      user('Yep'),
      { role: 'assistant', content: 'How did the move go?' },
      user('The move went fine, the cat hated it.'),
      user('Mm'),
    ]);
    expect(summary).toBe('Discussed: The move went fine, the cat hated it');
  });

  it("uses the last three of the caller's real lines, truncated", () => {
    const summary = fallbackCallSummary(
      [
        user('one thing'),
        user('two things'),
        user('ok'),
        user('three things'),
        user('four things'),
      ],
      5
    );
    expect(summary).toBe('Discussed: two t; three; four');
  });
});
