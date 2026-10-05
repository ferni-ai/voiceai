import { describe, expect, it } from 'vitest';
import { createRepeatTurnGuard, isRepeatTurn, REPEAT_WINDOW_MS } from '../turn-dedupe.js';

const last = { role: 'user' as const, content: "My sister's birthday is next week.", at: 1000 };

describe('isRepeatTurn', () => {
  it('drops the same caller line written twice a few ms apart', () => {
    expect(isRepeatTurn(last, 'user', "My sister's birthday is next week.", 1004)).toBe(true);
  });
  it('ignores case and spacing differences between the two writers', () => {
    expect(isRepeatTurn(last, 'user', "  my sister's  birthday is next week. ", 1004)).toBe(true);
  });
  it('keeps a person really repeating themself later', () => {
    expect(isRepeatTurn(last, 'user', "My sister's birthday is next week.", 1000 + REPEAT_WINDOW_MS)).toBe(false);
  });
  it('keeps a different line, the other role, or the first turn', () => {
    expect(isRepeatTurn(last, 'user', 'She loves hiking.', 1004)).toBe(false);
    expect(isRepeatTurn(last, 'assistant', "My sister's birthday is next week.", 1004)).toBe(false);
    expect(isRepeatTurn(undefined, 'user', 'Hi', 0)).toBe(false);
  });
});

describe('createRepeatTurnGuard', () => {
  it('drops the second write of one caller turn and keeps the next turn', () => {
    let t = 0;
    const isRepeat = createRepeatTurnGuard(() => t);
    expect(isRepeat('user', 'Hello there')).toBe(false);
    t = 4;
    expect(isRepeat('user', 'Hello there')).toBe(true);
    t = 900;
    expect(isRepeat('assistant', 'Hi!')).toBe(false);
    expect(isRepeat('user', 'How are you?')).toBe(false);
  });
});
