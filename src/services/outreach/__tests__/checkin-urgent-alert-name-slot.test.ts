/**
 * The check-in alert's screen reads the person's name as Ferni's, not as their words
 * (CHECKIN_ALERT_NAME_SLOT). A name that is itself a screen word ("Loan", "Pin", "Bank",
 * "Wire") made every urgent alert drop their words and say money and safety came up, even
 * for "she seemed tired". With the flag on, the screen reads the same alert with a
 * placeholder in each name slot; their own words are still screened as their words, so a
 * real money, account or number read keeps the money line, and crisis wording never loses
 * crisisCallerLine. Flag off is main. Fictional people and numbers only.
 */
import { describe, expect, it } from 'vitest';
import { crisisCallerLine, riskyCallerLine } from '../caller-text.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const ON = { CHECKIN_ALERT_NAME_SLOT: 'on' };
const OFF = { CHECKIN_ALERT_NAME_SLOT: 'off' };
const STATES = [
  ['off', OFF],
  ['on', ON],
] as const;
const CALL = 'Call her tonight.';
const CHECK_IN = 'You may want to check in with them.';

function alertFor(
  name: string,
  description: string,
  env: Record<string, string>,
  recommendedAction = CALL
): string | null {
  const record = {
    familyMemberName: name,
    concernsIdentified: [{ urgency: 'urgent', description, recommendedAction }],
  };
  return generateUrgentNotification(record, env);
}

/** Main's alert when their words are withheld for a money read: money line, crisis line. */
const moneyFallback = (name: string): string =>
  `Important: During my call with ${name}, ${riskyCallerLine(name).replace(/\.$/, '')}. ` +
  `${crisisCallerLine(name)} ${CHECK_IN}`;

const TIRED = 'she seemed tired';
/** Each name trips the screen beside these everyday words; the words alone never do. */
const NAMES_THAT_ARE_SCREEN_WORDS = [
  ['Pin', TIRED],
  ['Riley Bank', TIRED],
  ['Wire', TIRED],
  ['Loan', 'she said money is tight this month'], // "Loan, she said money"
] as const;

describe('check-in alert: the name is not their words (CHECKIN_ALERT_NAME_SLOT)', () => {
  it.each(NAMES_THAT_ARE_SCREEN_WORDS)(
    '%s + everyday words: flag on passes them on, no money or crisis line',
    (name, said) => {
      expect(alertFor(name, said, ON)).toBe(
        `Important: During my call with ${name}, ${said}. ${CALL}`
      );
    }
  );

  it.each(NAMES_THAT_ARE_SCREEN_WORDS)('%s + everyday words: flag off is main', (name, said) => {
    expect(alertFor(name, said, OFF)).toBe(moneyFallback(name));
  });

  it('a name that is no screen word on its own (Cash): passed on in both states', () => {
    for (const [, env] of STATES) {
      expect(alertFor('Cash', TIRED, env)).toBe(
        `Important: During my call with Cash, ${TIRED}. ${CALL}`
      );
    }
  });

  it.each(NAMES_THAT_ARE_SCREEN_WORDS)(
    'only the name changes: flag on gives %s the alert Riley Test gets',
    (name, said) => {
      const plain = alertFor('Riley Test', said, ON);
      expect(plain).toBe(`Important: During my call with Riley Test, ${said}. ${CALL}`);
      expect(alertFor(name, said, ON)).toBe(plain?.replace('Riley Test', name));
    }
  );

  it.each([
    ['Loan', 'she asked that you send $400 today'],
    ['Loan', 'she gave the number 555 0142 to call'],
    ['Riley Bank', 'she read out her account number to me'],
    ['Loan', 'she needs a loan, money for rent'],
  ])('%s + a real money or number read: the money line in both states', (name, said) => {
    for (const [, env] of STATES) {
      const alert = alertFor(name, said, env);
      expect(alert).toBe(moneyFallback(name));
      expect(alert).not.toContain(said);
    }
  });

  it('a money read in the suggested action: the flag changes nothing', () => {
    const action = 'wire $400 to 4417 2290';
    const alert = alertFor('Pin', TIRED, ON, action);
    expect(alert).toBe(alertFor('Pin', TIRED, OFF, action));
    expect(alert).toContain(crisisCallerLine('Pin'));
    expect(alert).not.toMatch(/4417|\$400/);
  });

  it.each([
    "she said she doesn't want to be here anymore",
    'she said she wants to end it all',
    'she said money is tight and she wants to end it all',
  ])('a screen-word name + crisis words "%s": crisisCallerLine in both states', (said) => {
    const name = said.includes('money') ? 'Loan' : 'Pin';
    expect(alertFor(name, said, OFF)).toBe(moneyFallback(name));
    expect(alertFor(name, said, ON)).toBe(
      `Important: During my call with ${name}, ${said}. ${crisisCallerLine(name)} ${CALL}`
    );
  });

  it('a name that is a screen word, with crisis words in the suggested action: crisis line kept', () => {
    const alert = alertFor('Pin', TIRED, ON, 'she said she wants to end it all; call her now');
    expect(alert).toContain(crisisCallerLine('Pin'));
  });
});
