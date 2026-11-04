/**
 * The line the sponsor gets when a check-in concern's words aren't passed on names a reason
 * only when the screen read one. A money, account or number read gets riskyCallerLine; words
 * that are only too long to screen in full, or a field that isn't text, get the neutral
 * withheldCallerLine, never "money, an account or a number" (the owner's decision).
 * Crisis wording is untouched: crisisCallerLine goes whenever their words are withheld.
 * Fictional people and numbers only.
 */
import { describe, expect, it } from 'vitest';
import { crisisCallerLine, riskyCallerLine } from '../caller-text.js';
import { generateUrgentNotification, type CheckinAlertInput } from '../checkin-urgent-alert.js';

const NAME = 'Rosa';
const CHECK_IN = 'You may want to check in with them.';
const CRISIS = crisisCallerLine(NAME);
const NEUTRAL = `${NAME} said something I didn't pass along; ask them directly`;
const MONEY = riskyCallerLine(NAME).replace(/\.$/, '');
const alertWith = (line: string): string =>
  `Important: During my call with ${NAME}, ${line}. ${CRISIS} ${CHECK_IN}`;

function alertFor(concern: { description?: unknown; recommendedAction?: unknown }): string | null {
  const record: CheckinAlertInput = {
    familyMemberName: NAME,
    concernsIdentified: [{ description: 'mentioned chest pain', urgency: 'urgent', ...concern }],
  };
  return generateUrgentNotification(record);
}

/** Everyday words past the screen's 10,000-character window, nothing risky in them. */
const ONLY_LONG = 'she talked about the garden and the tomatoes '.repeat(240).trim();
/** Everyday words, then a fictional number the screen never reads, past the window. */
const NUMBER_PAST_WINDOW = `${'she talked about the garden and the tomatoes '.repeat(224)}call 555 0142`;

describe('check-in alert: the line for words not passed on', () => {
  it.each([
    ['a description only too long to screen', { description: ONLY_LONG }],
    ['a suggested action only too long to screen', { recommendedAction: ONLY_LONG }],
    ['a number past the window the screen never read', { description: NUMBER_PAST_WINDOW }],
  ])('%s: the neutral line, never money', (_, concern) => {
    expect(ONLY_LONG.length).toBeGreaterThan(10_000);
    const alert = alertFor(concern);
    expect(alert).toBe(alertWith(NEUTRAL));
    expect(alert).not.toMatch(/money|account|number/);
  });

  it.each([
    ['a number', 5550142],
    ['an object with toString', { toString: () => 'call 555 0142' }],
    ['a boolean', true],
  ])('a description that is %s: the neutral line, never money', (_, description) => {
    const alert = alertFor({ description });
    expect(alert).toBe(alertWith(NEUTRAL));
    expect(alert).not.toMatch(/money|account|number|\d/);
  });

  it.each([
    ['a money request in the description', { description: 'asked that you send $400 today' }],
    ['a number in the description', { description: 'gave the number 555 0142 for her' }],
    [
      'a number formed by joining the fields',
      { description: 'gave 555 01', recommendedAction: '42 to call' },
    ],
    ['an array of risky words', { description: ['call 555 0142'] }],
    [
      'a money read inside the window of a long text',
      { description: `send $400 now ${ONLY_LONG}` },
    ],
    [
      'a description that is a number, and a money read in the suggested action',
      { description: 5550142, recommendedAction: 'wire $400 to 4417 2290' },
    ],
    [
      'a description that is an object, and a crisis and money read in the suggested action',
      {
        description: { toString: () => 'fine' },
        recommendedAction: 'She said she wants to end her life; wire $400 to 4417 2290',
      },
    ],
    [
      'a number split across the fields, the two together past the window',
      {
        description: `${'she talked about the garden and the tomatoes '.repeat(221)}gave 555 01`,
        recommendedAction: '42 to call her back about the garden and the tomatoes today',
      },
    ],
    [
      'a description past the window, and a money read in the suggested action',
      { description: ONLY_LONG, recommendedAction: 'send $400 to my account' },
    ],
  ])('%s: still the money line', (_, concern) => {
    const alert = alertFor(concern);
    expect(alert).toContain(MONEY);
    expect(alert).not.toContain(NEUTRAL);
    expect(alert).toContain(CRISIS);
  });
});
