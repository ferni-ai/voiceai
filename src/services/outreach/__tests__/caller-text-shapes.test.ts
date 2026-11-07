/**
 * Shapes the caller-text screen used to miss for every name: digits from other
 * scripts, money words with a sum or debt as their object, and handles, emails
 * and links spelled so the old link rule missed them. Each one is withheld for an
 * ordinary name and a screen-word name alike, the crisis line is never lost, and
 * ordinary speech that shares a word with a shape ("pay attention", "at the gym")
 * still reaches the sponsor in their own words.
 */
import { describe, expect, it } from 'vitest';
import {
  callerText,
  crisisCallerLine,
  isRiskyCallerText,
  riskyCallerLine,
  screenedCallerText,
} from '../caller-text.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';
import type { CheckinCallRecord } from '../../family/proactive-family-checkin.js';

/** An ordinary name, and names the screen reads as a risk on their own. */
const NAMES = ['Riley Test', 'Pin', 'Wire', 'Riley Bank'];
const CRISIS_WORDS = 'she said she wants to end her life';

/** [shape, text, a token from their words that must never reach the sponsor] */
const SHAPES: Array<[string, string, string]> = [
  ['Arabic-Indic digits', 'her number is ٥٥٥٠١٤٢', '٥٥٥'],
  ['Devanagari digits', 'call her on ५५५०१४२', '५५५'],
  ['Vai digits', 'her number is ꘥꘥꘥꘠꘡꘤꘢', '꘥꘥꘥'],
  ['money sign, other digits', 'she needs $٥٠ today', '٥٠'],
  ['other digits, dollars', 'she needs ٥٠ dollars', '٥٠'],
  ['pay me back', 'she said pay me back', 'pay me back'],
  ['paid her back', 'she wants to be paid her back soon', 'paid her back'],
  ['pay the loan', 'she asked you to pay the loan today', 'the loan'],
  ['owes a grand', 'she owes a grand on the loan', 'a grand'],
  ['borrow bucks', 'she wants to borrow bucks from you', 'borrow'],
  ['borrowed cash', 'she borrowed cash from Marcus', 'borrowed'],
  ['two grand', 'she needs two grand', 'two grand'],
  ['twenty quid', 'she needs twenty quid', 'quid'],
  ['digits quid', 'she needs 20 quid', 'quid'],
  ['fifteen bucks', 'she needs fifteen bucks', 'fifteen'],
  ['thirty quid', 'she needs thirty quid', 'thirty'],
  ['twenty-five grand', 'she needs twenty-five grand', 'twenty-five'],
  ['twenty five grand', 'she needs twenty five grand', 'twenty five'],
  ['a couple of grand', 'she needs a couple of grand', 'couple'],
  ['a few grand', 'she needs a few grand', 'few grand'],
  ['some bucks', 'she needs some bucks', 'some bucks'],
  ['5k', 'she needs 5k by Friday', '5k'],
  ['five k', 'she needs five k by Friday', 'five k'],
  ['her debt', 'she is worried about her debt', 'debt'],
  ['in debt', 'she is in debt to the landlord', 'debt'],
  ['a loan', 'she wants a loan', 'loan'],
  ['email', 'write to riley@gmail', 'riley@'],
  ['handle', 'find her at @rileyhelp', 'rileyhelp'],
  ['underscore handle', 'she is riley_help on insta', 'riley_help'],
  ['at gmail', 'email riley help at gmail dot com', 'gmail'],
  ['at yahoo', 'she is maplewood riley at yahoo', 'yahoo'],
  ['spaced http', 'go to h t t p riley help', 'h t t p'],
  ['dashed http', 'go to h-t-t-p riley help', 'h-t-t-p'],
  ['spaced www', 'go to w w w riley help', 'w w w'],
  ['unknown ending', 'go to riley-help.app', 'riley-help'],
  ['short ending', 'her site is riley.us', 'riley.us'],
  ['dev ending', 'see riley-help.dev for it', 'riley-help'],
  ['shop ending', 'she sells on riley.shop', 'riley.shop'],
];

/** Every number word the sum rule reads: each one alone before "grand" is a sum. */
const NUMBER_WORDS = [
  ...['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  ...['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen'],
  ...['eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy'],
  ...['eighty', 'ninety', 'hundred', 'thousand', 'million'],
];

/** Ordinary speech that shares a word with a shape: never withheld for it. */
const NO_FIRE = [
  "I'll pay attention",
  'at the gym',
  'pay it forward',
  'I owe you one',
  'at work',
  'at home',
  'Riley says hi',
  'she had a grand time at the fair',
  'grandma Priya called on Sunday',
  'she paid a visit to Marcus',
  'she wants to borrow your ladder',
  'she lent Marcus her bike',
  'see you at the Maplewood library',
  'she owes Marcus a call',
  'it was 10 a.m. at the clinic, e.g. the usual',
  'she is fine. Thanks for asking',
];

/** What main's screen already withheld: still withheld, for every name. */
const MAIN_HELD = [
  'call her at 555 0142 22',
  'go to www.riley.com',
  'she needs $50',
  'she needs 50 dollars',
  'send her money',
  'her bank called',
  'she asked for the password',
];

function alertFor(name: string, description: string): string {
  const record: CheckinCallRecord = {
    id: 'call-test-1',
    scheduleId: 'schedule-test-1',
    sponsorUserId: 'sponsor-test-1',
    sponsoredIdentityId: 'identity-test-1',
    familyMemberName: name,
    callStartedAt: '2026-01-05T15:00:00.000Z',
    status: 'completed',
    concernsIdentified: [{ description, urgency: 'urgent', category: 'health' }],
    sponsorBriefed: false,
  };
  const alert = generateUrgentNotification(record);
  if (alert === null) throw new Error('expected an alert');
  return alert;
}

describe('the screen withholds each new shape for every name', () => {
  describe.each(NAMES)('name %s', (name) => {
    it.each(SHAPES)('%s', (_shape, text, token) => {
      expect(isRiskyCallerText(text)).toBe(true);
      expect(screenedCallerText(text, name)).toBe(riskyCallerLine(name));
      const alert = alertFor(name, text);
      expect(alert).not.toContain(token);
      expect(alert).toContain(riskyCallerLine(name));
      // Their words were withheld, so the crisis line goes with the alert.
      expect(alert).toContain(crisisCallerLine(name));
    });
  });
});

describe('a sum in any number word is withheld', () => {
  it.each(NUMBER_WORDS)('%s grand', (word) => {
    expect(isRiskyCallerText(`she owes me ${word} grand`)).toBe(true);
    expect(isRiskyCallerText(`she needs ${word} grand`)).toBe(true);
    expect(alertFor('Riley Test', `she needs ${word} grand`)).not.toContain(`${word} grand`);
  });
});

describe('the crisis line is kept on every new shape', () => {
  describe.each(NAMES)('name %s', (name) => {
    it.each(SHAPES)('%s', (_shape, text, token) => {
      const said = `${CRISIS_WORDS}, ${text}`;
      const screened = screenedCallerText(said, name);
      expect(screened).toContain(crisisCallerLine(name));
      expect(screened).not.toContain(token);
      const alert = alertFor(name, said);
      expect(alert).toContain(crisisCallerLine(name));
      expect(alert).not.toContain(token);
    });
  });
});

describe('ordinary speech that shares a word with a shape still goes out', () => {
  it.each(NO_FIRE)('%s', (text) => {
    expect(isRiskyCallerText(text)).toBe(false);
    for (const name of NAMES) expect(screenedCallerText(text, name)).toBe(callerText(text));
    const alert = alertFor('Riley Test', text);
    expect(alert).toContain(`During my call with Riley Test, ${text.replace(/[.\s]+$/, '')}.`);
    expect(alert).not.toContain(riskyCallerLine('Riley Test'));
  });

  it('the name Loan is not a money verb in the alert', () => {
    const text = 'she had a grand time at the fair';
    expect(alertFor('Loan', text)).toContain(`During my call with Loan, ${text}.`);
  });

  it('a single digit is not a number: "see you at 3" goes out as on main', () => {
    // No rule fires on it, new or old: one digit is under the number rule's seven,
    // and the "at" rule needs a mail provider after it.
    expect(isRiskyCallerText('see you at 3')).toBe(false);
    expect(alertFor('Riley Test', 'see you at 3')).toContain('Riley Test, see you at 3.');
  });
});

describe('never lower than main', () => {
  describe.each(NAMES)('name %s', (name) => {
    it.each(MAIN_HELD)('%s', (text) => {
      expect(isRiskyCallerText(text)).toBe(true);
      expect(screenedCallerText(text, name)).toBe(riskyCallerLine(name));
      expect(alertFor(name, `${CRISIS_WORDS}, ${text}`)).toContain(crisisCallerLine(name));
    });
  });

  it("Ferni's own lines don't trip the new rules", () => {
    for (const name of ['Riley Test', 'Priya']) {
      expect(isRiskyCallerText(riskyCallerLine(name))).toBe(false);
      expect(isRiskyCallerText(crisisCallerLine(name))).toBe(false);
    }
  });
});
