/**
 * A group call turn's `[label] ` (turn-label.ts) comes off only on the call that put it on,
 * and only a label that call put on: a bracket the caller said stays words, and no call's
 * labels reach another call.
 */
import { describe, expect, it } from 'vitest';
import { labelTurn, stripTurnLabel, withoutTag } from '../turn-label.js';

describe('labelTurn and stripTurnLabel', () => {
  it('puts the label in front and takes it off again on the same call', () => {
    const call = {};
    const said = labelTurn(call, 'Zoë O’Neil-Ruiz Jr.', 'see you at six');
    expect(said).toBe('[Zoë O’Neil-Ruiz Jr.] see you at six');
    expect(stripTurnLabel(call, said)).toBe('see you at six');
    expect(stripTurnLabel(call, labelTurn(call, 'unclear', 'sounds good'))).toBe('sounds good');
  });

  it('two calls side by side: a label one put on is words on the other', () => {
    const group = {};
    const solo = {};
    labelTurn(group, 'note', 'hi there');
    expect(stripTurnLabel(group, '[note] hi there')).toBe('hi there');
    expect(stripTurnLabel(solo, '[note] hi there')).toBe('[note] hi there');
    labelTurn(solo, 'unclear', 'mm');
    expect(stripTurnLabel(solo, '[unclear] mm')).toBe('mm');
    expect(stripTurnLabel({}, '[unclear] mm')).toBe('[unclear] mm'); // a third call put none on
  });

  it('a solo call keeps a bracket the caller said, and one with no call is left alone', () => {
    expect(stripTurnLabel({}, '[note] hi there')).toBe('[note] hi there');
    expect(stripTurnLabel(undefined, '[note] hi there')).toBe('[note] hi there');
  });

  it('takes off only a label at the very start, in the label grammar, followed by a space', () => {
    const call = {};
    labelTurn(call, 'Sarah (guest)', 'hi');
    expect(stripTurnLabel(call, 'so [Sarah (guest)] said')).toBe('so [Sarah (guest)] said');
    expect(stripTurnLabel(call, '[Sarah (guest)]hi')).toBe('[Sarah (guest)]hi');
    labelTurn(call, 'a:b', 'mm'); // not label grammar: never read back as one
    expect(stripTurnLabel(call, '[a:b] mm')).toBe('[a:b] mm');
  });
});

describe('withoutTag (the backchannel question, with no call to go by)', () => {
  it('drops any leading tag of the label shape, and nothing else', () => {
    expect(withoutTag('[unclear] Mm-hmm.')).toBe('Mm-hmm.');
    expect(withoutTag('[laughs] mm')).toBe('mm');
    expect(withoutTag('mm [laughs]')).toBe('mm [laughs]');
    expect(withoutTag('[a:b] mm')).toBe('[a:b] mm');
  });
});
