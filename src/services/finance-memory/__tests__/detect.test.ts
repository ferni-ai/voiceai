/**
 * Money detection from the user's own words, amounts as said and rounded,
 * extracted-fact mapping, and redaction before anything becomes a mention.
 */

import { describe, expect, it } from 'vitest';
import {
  detectFinanceMentions,
  factToMention,
  formatAmountConversational,
  parseAmount,
} from '../index.js';

const one = (text: string) => {
  const found = detectFinanceMentions(text);
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe('detectFinanceMentions', () => {
  it.each([
    ["I'm paying off my credit card", 'debt', 'credit card', 'Paying off their credit card'],
    ["We're saving for a house.", 'savings', 'house', 'Saving for a house'],
    ["I'm building an emergency fund", 'savings', 'emergency fund', 'Building an emergency fund'],
    [
      'I finally paid off my student loans',
      'debt',
      'student loans',
      'Paid off their student loans',
    ],
    ["We're thinking about buying a new car", 'purchase', 'car', 'Thinking about buying a car'],
    ['I just bought a house!', 'purchase', 'house', 'Bought a house'],
    ['My phone bill is due on the fifteenth', 'bill', 'phone bill', 'Phone bill due on the 15th'],
    ['Money is tight right now.', 'worry', 'money', 'Money is tight'],
    [
      "I'm worried about paying rent this month",
      'worry',
      'rent',
      'Worried about paying rent this month',
    ],
    ['I just got a raise!', 'income', 'raise', 'Got a raise'],
    ['money stresses me out', 'feeling', 'money', 'Money stresses them out'],
    ['I feel guilty about my spending', 'feeling', 'spending', 'Feels guilty about their spending'],
    ["I'm trying to spend less on takeout", 'budget', 'takeout', 'Trying to spend less on takeout'],
    ['I stuck to my budget this month', 'win', 'budget', 'Stuck to their budget'],
    [
      "I'm trying to decide whether to refinance the mortgage.",
      'decision',
      'refinance the mortgage',
      'Deciding whether to refinance the mortgage',
    ],
  ])('%j → %s', (input, kind, subject, text) => {
    expect(one(input)).toMatchObject({ kind, subject, text });
  });

  it('keeps the amount and due day the user said', () => {
    expect(one("My rent is due on the 1st and it's $1,800 a month.")).toMatchObject({
      kind: 'bill',
      subject: 'rent',
      dueDay: 1,
      amount: { value: 1800, currency: 'USD', period: 'month' },
    });
    expect(one('I make $85k a year.')).toMatchObject({
      kind: 'income',
      amount: { value: 85000, period: 'year' },
    });
    expect(one('I owe $12k in student loans')).toMatchObject({
      kind: 'debt',
      subject: 'student loans',
      amount: { value: 12000 },
    });
  });

  it('ignores negations, other people, questions and non-money numbers', () => {
    for (const s of [
      "I don't have any debt.",
      'My brother is broke.',
      "what's a 401k?",
      'I ran a 5k today',
      'I bought a coffee',
    ]) {
      expect(detectFinanceMentions(s)).toEqual([]);
    }
  });

  it('never lets a secret into a mention', () => {
    const found = detectFinanceMentions(
      "I'm paying off my credit card 4111 1111 1111 1111, my pin is 4821"
    );
    expect(JSON.stringify(found)).not.toMatch(/4111|4821/);
  });
});

describe('amounts', () => {
  it.each([
    ['$2,000 a month', 'about $2k a month'],
    ['$1.5 million', 'about $1.5M'],
    ['2 grand', 'about $2k'],
    ['£450 per week', 'about £450 a week'],
    ['$37', 'about $35'],
    ['$45,300 a year', 'about $45k a year'],
  ])('%j → %j', (said, spoken) => {
    const amount = parseAmount(said);
    expect(amount).not.toBeNull();
    expect(formatAmountConversational(amount!)).toBe(spoken);
  });

  it('a bare number is not money', () => {
    expect(parseAmount('I have 3 kids and 2 cats')).toBeNull();
  });
});

describe('factToMention', () => {
  it('maps a money fact about the user, without amounts', () => {
    expect(
      factToMention({
        entityName: 'user',
        factType: 'finance',
        key: 'debt',
        value: 'has $15,000 in credit card debt',
        confidence: 0.9,
      })
    ).toMatchObject({ kind: 'debt', text: 'Has credit card debt', confidence: 0.85 });
    expect(
      factToMention({
        entityName: 'user',
        category: 'finances',
        key: 'savings_goal',
        value: 'saving for a boat',
      })
    ).toMatchObject({ kind: 'savings', subject: 'boat' });
  });

  it('skips other people, non-money facts and secret keys', () => {
    expect(
      factToMention({ entityName: 'Sam', factType: 'finance', key: 'debt', value: 'owes rent' })
    ).toBeNull();
    expect(
      factToMention({ entityName: 'user', factType: 'preference', key: 'likes', value: 'jazz' })
    ).toBeNull();
    expect(
      factToMention({
        entityName: 'user',
        factType: 'finance',
        key: 'card_number',
        value: '4111 1111 1111 1111',
      })
    ).toBeNull();
  });
});
