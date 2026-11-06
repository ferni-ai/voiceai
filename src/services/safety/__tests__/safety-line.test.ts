import { describe, expect, it } from 'vitest';

import { namesSafetyLine } from '../safety-line.js';

describe('namesSafetyLine', () => {
  it.each([
    'If it gets worse tonight, please call or text 988 right away.',
    'You can call or text 988 any time, tonight or tomorrow.',
    'You can always text 988, day or night, tonight too.',
    'If the chest pain comes back tonight, call 911.',
    'Call 9-1-1 if he stops breathing.',
    'Dial nine one one now.',
    'You can text HOME to 741741.',
    'The Suicide and Crisis Lifeline is there tonight.',
    'Want me to call the crisis line with you tonight?',
    'Please get an ambulance if it comes back.',
    'Go to the emergency room tonight if it spreads.',
    'Call emergency services first.',
    'Call poison control right now.',
  ])('%j gives a crisis or emergency line', (text) => {
    expect(namesSafetyLine(text)).toBe(true);
  });

  it.each([
    "I'll call her tonight.",
    "I'll call her at 555-0142.",
    'The flight is $911 round trip.',
    'Room 9110 is on the left.',
    "Let's fix the error tonight.",
    '',
  ])('%j gives no crisis or emergency line', (text) => {
    expect(namesSafetyLine(text)).toBe(false);
  });
});
