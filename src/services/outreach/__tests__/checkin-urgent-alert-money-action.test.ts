/**
 * When the check-in concern's description is clean but its suggested action reads money, an
 * account or a number, the alert names money: riskyCallerLine takes the suggestion's place.
 * Before, it said only "You may want to check in with them." plus crisisCallerLine, so the
 * sponsor never heard money came up (owner yes). crisisCallerLine stays in every row, and the
 * money line is said once. Fictional people and numbers only.
 */
import { describe, expect, it } from 'vitest';
import { crisisCallerLine, riskyCallerLine } from '../caller-text.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const NAME = 'Rosa';
const CRISIS = crisisCallerLine(NAME);
const MONEY = riskyCallerLine(NAME);
const CHECK_IN = 'You may want to check in with them.';

function alertFor(description: unknown, recommendedAction: unknown): string | null {
  return generateUrgentNotification({
    familyMemberName: NAME,
    concernsIdentified: [{ urgency: 'urgent', description, recommendedAction }],
  });
}

const count = (text: string | null, part: string): number => (text ?? '').split(part).length - 1;

describe('check-in alert: a money read in the suggested action names money', () => {
  it.each([
    ['a money request with a link', 'Wire $400 to pay-rosa.example.test/r/4417 now'],
    ['a money request to an account', 'send $400 to my account'],
    ['a number to call', 'call 555 0142 tonight'],
    ['a code', 'give her the PIN for the card'],
    ['an array of words with a number', ['call 555 0142']],
  ])('a clean description and %s: their words, crisis line, then the money line', (_, action) => {
    expect(alertFor('mentioned chest pain', action)).toBe(
      `Important: During my call with ${NAME}, mentioned chest pain. ${CRISIS} ${MONEY}`
    );
  });

  it('crisis and money in the suggested action: both lines, no number', () => {
    const alert = alertFor(
      'mentioned chest pain',
      'She said she wants to end her life; wire $400 to 4417 2290'
    );
    expect(alert).toBe(
      `Important: During my call with ${NAME}, mentioned chest pain. ${CRISIS} ${MONEY}`
    );
    expect(alert).not.toMatch(/\d/);
  });

  it.each([
    ['a description with its own money read', 'asked that you send $400 today'],
    ['a description that is not text', 5550142],
  ])('%s and a money read in the action: the money line once', (_, description) => {
    const alert = alertFor(description, 'wire $400 to 4417 2290');
    expect(count(alert, MONEY.replace(/\.$/, ''))).toBe(1);
    expect(alert).toContain(CRISIS);
    expect(alert?.endsWith(CHECK_IN)).toBe(true);
  });

  it.each([
    ['a clean suggestion', 'Call her doctor today', 'Call her doctor today'],
    ['a suggestion that is not text', 5550142, CHECK_IN],
  ])('%s: unchanged', (_, action, ends) => {
    const alert = alertFor('mentioned chest pain', action);
    expect(alert?.endsWith(ends)).toBe(true);
    expect(alert).not.toContain(MONEY.replace(/\.$/, ''));
  });
});
