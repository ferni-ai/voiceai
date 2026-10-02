/**
 * Money facts: income, budget, savings, debt, purchases, bills.
 *
 * @module services/finance-memory/detect-money
 */

import { parseAmount } from './amounts.js';
import {
  BIG_ITEMS,
  ORDINAL_WORDS,
  cap,
  debtType,
  ordinal,
  stripArticle,
  thirdPerson,
  tidy,
  type Detector,
  type FinanceMention,
} from './detect-helpers.js';

export const income: Detector = (c, negated) => {
  if (negated) return [];
  const out: FinanceMention[] = [];
  const amount = parseAmount(c) ?? undefined;
  if (
    amount &&
    /\b(?:i|we)\s+(?:make|earn|bring in|take home|gross|net)\b|\bmy (?:salary|income|pay|paycheck|wages?)\s+(?:is|was|'s)\b/i.test(
      c
    )
  ) {
    out.push({
      kind: 'income',
      subject: 'income',
      text: 'Shared what they earn',
      amount,
      confidence: 0.85,
    });
  }
  if (/\b(?:i|we)\s+(?:just\s+|finally\s+)?got\s+a\s+(?:raise|pay rise|bonus)\b/i.test(c)) {
    const bonus = /bonus/i.test(c);
    out.push({
      kind: 'income',
      subject: bonus ? 'bonus' : 'raise',
      text: bonus ? 'Got a bonus' : 'Got a raise',
      status: 'done',
      ...(amount ? { amount } : {}),
      confidence: 0.9,
    });
  }
  if (
    /\bmy (?:hours|pay|salary|income) (?:got|was|were) (?:cut|reduced|slashed)\b|\b(?:i|we) (?:took|had) a pay cut\b|\bmy income (?:dropped|went down)\b/i.test(
      c
    )
  ) {
    out.push({ kind: 'income', subject: 'pay cut', text: 'Income went down', confidence: 0.85 });
  }
  const on = c.match(
    /\b(?:i'?m|i am|we'?re)\s+(?:on|living on|collecting)\s+(unemployment|disability|benefits|social security|a pension|a fixed income)\b/i
  );
  if (on?.[1]) {
    out.push({
      kind: 'income',
      subject: stripArticle(on[1].toLowerCase()),
      text: `Living on ${on[1].toLowerCase()}`,
      confidence: 0.85,
    });
  }
  if (
    /\b(?:i|we)\s+(?:started|have|got)\s+(?:a\s+)?(?:side hustle|second job|freelance (?:work|gig))\b/i.test(
      c
    )
  ) {
    out.push({
      kind: 'income',
      subject: 'side income',
      text: 'Has a side income',
      confidence: 0.8,
    });
  }
  return out;
};

export const budget: Detector = (c, negated) => {
  if (negated) return [];
  const out: FinanceMention[] = [];
  if (
    /\b(?:i'?m|i am|we'?re|we are)\s+(?:trying to\s+)?(?:on|sticking to|following|making|doing|living on)\s+a\s+(?:strict\s+|tight\s+|new\s+)?budget\b/i.test(
      c
    )
  ) {
    out.push({
      kind: 'budget',
      subject: 'budget',
      text: 'Working with a budget',
      confidence: 0.85,
    });
  }
  const forWhat = c.match(
    /\b(?:i|we)\s+(?:budget|set aside|put aside|allow (?:myself|ourselves))\s+.{1,30}?\s+for\s+([a-z' ]{3,30})/i
  );
  const amount = parseAmount(c) ?? undefined;
  if (forWhat?.[1] && amount) {
    const what = tidy(forWhat[1]).toLowerCase();
    if (what)
      out.push({
        kind: 'budget',
        subject: what,
        text: `Sets aside money for ${thirdPerson(what)}`,
        amount,
        confidence: 0.85,
      });
  }
  const less = c.match(
    /\b(?:i'?m|i am|we'?re|we are)\s+trying to\s+(?:spend less|cut back|stop spending|cut down)\s+on\s+([a-z' ]{3,30})/i
  );
  if (less?.[1]) {
    const what = tidy(less[1]).toLowerCase();
    if (what)
      out.push({
        kind: 'budget',
        subject: what,
        text: `Trying to spend less on ${thirdPerson(what)}`,
        confidence: 0.85,
      });
  }
  if (/\b(?:i'?m|i am|we'?re)\s+doing\s+a\s+no[- ]spend\s+(?:month|week|challenge)\b/i.test(c)) {
    out.push({
      kind: 'budget',
      subject: 'no-spend challenge',
      text: 'Doing a no-spend challenge',
      confidence: 0.85,
    });
  }
  return out;
};

export const savings: Detector = (c, negated) => {
  if (negated) return [];
  const amount = parseAmount(c) ?? undefined;
  if (
    /\b(?:i'?m|i am|we'?re)\s+(?:building|saving)\s+(?:up\s+)?(?:an?|my|our)\s+emergency fund\b/i.test(
      c
    )
  ) {
    return [
      {
        kind: 'savings',
        subject: 'emergency fund',
        text: 'Building an emergency fund',
        ...(amount ? { amount } : {}),
        confidence: 0.9,
      },
    ];
  }
  const m = c.match(
    /\b(?:(?:i'?m|i am|we'?re|we are)\s+(?:trying to\s+)?sav(?:e|ing)|(?:i|we)\s+(?:want|need|hope|plan)\s+to\s+save|i(?:'ve| have)\s+saved)\s+(?:up\s+)?(?:.{0,25}?\s)?(?:for|toward|towards)\s+((?:a|an|the|my|our)\s+)?([a-z' ]{3,40})/i
  );
  if (!m?.[2]) return [];
  const what = tidy(m[2]).toLowerCase();
  if (!what || /^(later|now|it|that|this|them)$/.test(what)) return [];
  const article = (m[1] ?? '').toLowerCase().trim();
  const label = thirdPerson(`${article ? `${article} ` : ''}${what}`);
  return [
    {
      kind: 'savings',
      subject: what,
      text: `Saving for ${label}`,
      ...(amount ? { amount } : {}),
      confidence: 0.85,
    },
  ];
};

export const debt: Detector = (c, negated) => {
  const amount = parseAmount(c) ?? undefined;
  const paidOff = c.match(
    /\b(?:i|we)\s+(?:just\s+|finally\s+)?paid off\s+(?:my|our|the|all (?:of )?(?:my|our))?\s*([a-z' ]{3,30})/i
  );
  if (paidOff?.[1] && !negated) {
    const type = debtType(c) ?? tidy(paidOff[1]).toLowerCase();
    if (type)
      return [
        {
          kind: 'debt',
          subject: type,
          text: `Paid off their ${type}`,
          status: 'done',
          confidence: 0.9,
        },
      ];
  }
  const paying = c.match(
    /\b(?:i'?m|i am|we'?re|we are)\s+(?:still\s+)?(?:paying (?:off|down)|chipping away at|working on paying off|digging out of)\s+(?:my|our|the|some)?\s*([a-z' ]{3,30})/i
  );
  if (paying?.[1] && !negated) {
    const type =
      debtType(c) ??
      tidy(paying[1])
        .toLowerCase()
        .replace(/\s+debt$/, '');
    if (type)
      return [
        {
          kind: 'debt',
          subject: type,
          text: `Paying off their ${type}`,
          ...(amount ? { amount } : {}),
          confidence: 0.85,
        },
      ];
  }
  const has =
    /\b(?:i|we)(?:'ve| have)?\s+(?:got|have|owe|still owe|carry|am carrying|'m carrying|'m in|am in|'re in|are in)\b[^.]*\b(?:debt|loans?|owe|balance)\b/i.test(
      c
    ) || /\b(?:i|we) (?:still )?owe\b/i.test(c);
  if (has && !negated) {
    const type = debtType(c) ?? 'debt';
    const label = type === 'medical bills' ? 'medical' : type.replace(/s$/, '');
    const text = type === 'debt' ? 'Carrying some debt' : `Has ${label} debt`;
    return [{ kind: 'debt', subject: type, text, ...(amount ? { amount } : {}), confidence: 0.85 }];
  }
  return [];
};

export const purchase: Detector = (c, negated) => {
  if (negated) return [];
  const amount = parseAmount(c) ?? undefined;
  const planned = c.match(
    /\b(?:(?:i'?m|i am|we'?re|we are)\s+(?:thinking (?:about|of)|planning (?:on|to)|looking (?:at|to)|hoping to|going to|about to|saving to)|(?:i|we)\s+(?:want|need|plan) to)\s+(?:buy|buying|get|getting|purchase|purchasing)\s+((?:a|an|our|my|the)\s+(?:new\s+|used\s+|first\s+)?[a-z-]+(?:\s[a-z-]+)?)/i
  );
  const done = c.match(
    /\b(?:i|we)\s+(?:just\s+|finally\s+)?(?:bought|purchased|closed on|put a down payment on|financed)\s+((?:a|an|our|my|the)\s+(?:new\s+|used\s+|first\s+)?[a-z-]+(?:\s[a-z-]+)?)/i
  );
  const m = done ?? planned;
  if (!m?.[1]) return [];
  const phrase = m[1].toLowerCase();
  const big = phrase.match(BIG_ITEMS)?.[1];
  if (!big && !(amount && amount.value >= 500)) return [];
  const noun = big ?? stripArticle(phrase);
  const a = /^[aeiou]/.test(noun) ? 'an' : 'a';
  return [
    {
      kind: 'purchase',
      subject: noun,
      text: done ? `Bought ${a} ${noun}` : `Thinking about buying ${a} ${noun}`,
      status: done ? 'done' : 'planned',
      ...(amount ? { amount } : {}),
      confidence: 0.85,
    },
  ];
};

const BILL =
  '(rent|mortgage(?: payment)?|car payment|insurance(?: payment)?|student loan payment|credit card (?:payment|bill)|tuition|[a-z]+ bill)';

export const bill: Detector = (c, negated) => {
  if (negated) return [];
  const due = c.match(
    new RegExp(
      `\\bmy\\s+${BILL}\\s+(?:is|'s|comes)\\s+due\\s+(?:on\\s+)?(?:the\\s+)?(\\d{1,2}(?:st|nd|rd|th)?|[a-z]+(?:-[a-z]+)?)\\b`,
      'i'
    )
  );
  const amount = parseAmount(c) ?? undefined;
  if (due?.[1] && due[2]) {
    const word = due[2].toLowerCase();
    const day = /^\d/.test(word) ? Number.parseInt(word, 10) : ORDINAL_WORDS[word];
    const what = due[1].toLowerCase();
    if (day && day >= 1 && day <= 31) {
      return [
        {
          kind: 'bill',
          subject: what,
          text: `${cap(what)} due on the ${ordinal(day)}`,
          dueDay: day,
          ...(amount ? { amount } : {}),
          confidence: 0.9,
        },
      ];
    }
  }
  const cost = c.match(new RegExp(`\\bmy\\s+${BILL}\\s+(?:is|'s|went up to|costs?|runs?)\\b`, 'i'));
  if (cost?.[1] && amount) {
    const what = cost[1].toLowerCase();
    return [{ kind: 'bill', subject: what, text: `Pays ${what}`, amount, confidence: 0.85 }];
  }
  return [];
};
