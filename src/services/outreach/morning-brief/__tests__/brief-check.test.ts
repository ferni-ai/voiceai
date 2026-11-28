/**
 * MORNING_BRIEF_WRITER's deterministic check (brief-check.ts): one row per check, each
 * asserting its own reason, so dropping a check turns its row red. Fictional user Sam.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../brief-facts.js';
import { checkBrief, openerHash } from '../brief-check.js';
import type { DayItems } from '../brief-job.js';

const ZONE = 'America/Chicago';
const NOW = new Date('2026-10-18T13:05:00Z'); // 08:05 in Chicago
const day: DayItems = {
  events: [],
  reminders: ['Call the plumber'],
  tasks: ['Book the dentist', 'Return the library books'],
  commitments: [],
  refs: {
    reminders: [{ store: 'reminders', ref: 'r1', dueAt: '2026-10-18T15:00:00Z' }],
    tasks: [
      { store: 'tasks', ref: 't1' },
      { store: 'tasks', ref: 't2' },
    ],
    commitments: [],
  },
};
const facts = factsOf(day, ZONE, NOW);
const ctx = { facts, name: 'Sam' };
const GOOD =
  "Morning Sam, it's Alex. Call the plumber at 10am, then Book the dentist and Return the " +
  'library books when you can. Call me if you want a hand.';

describe('factsOf', () => {
  it('lists what is due today first, with its time in their zone, then what is open', () => {
    expect(facts.map((f) => [f.label, f.at, f.rank])).toEqual([
      ['Call the plumber', '10am', 1],
      ['Book the dentist', undefined, 3],
      ['Return the library books', undefined, 3],
    ]);
  });

  it('puts an overdue task ahead of an open one', () => {
    const late = { ...day, refs: { ...day.refs!, tasks: [day.refs!.tasks[0], { store: 'tasks' as const, ref: 't2', dueAt: '2026-10-15T12:00:00Z' }] } }; // prettier-ignore
    expect(factsOf(late, ZONE, NOW).map((f) => f.label)).toEqual([
      'Call the plumber',
      'Return the library books',
      'Book the dentist',
    ]);
  });
});

describe('checkBrief', () => {
  it('passes a brief that names every fact in plain words', () => {
    expect(checkBrief(GOOD, ctx)).toBeNull();
  });

  it('passes the top items plus an exact count of the rest', () => {
    const top =
      "Morning Sam, it's Alex. Call the plumber at 10am and Book the dentist, and 1 more.";
    expect(checkBrief(top, ctx)).toBeNull();
  });

  it('empty', () => expect(checkBrief('  ', ctx)).toBe('empty'));
  it('too long', () =>
    expect(checkBrief(`${GOOD} ${'Call me. '.repeat(30)}`, ctx)).toBe('too-long'));
  it('style: an exclamation mark', () => expect(checkBrief(GOOD.replace('hand.', 'hand!'), ctx)).toBe('style')); // prettier-ignore

  it('missing fact: a middle item dropped, even when the count covers it', () => {
    const text = "Morning Sam, it's Alex. Call the plumber at 10am and Return the library books.";
    expect(checkBrief(text, ctx)).toBe('missing-fact');
    // Only the last items may go into the count: "2 more" with the third named is not a count.
    expect(checkBrief(text.replace('books.', 'books, and 2 more.'), ctx)).toBe('missing-fact');
  });

  it('missing fact: the last item dropped with no count', () => {
    const text = "Morning Sam, it's Alex. Call the plumber at 10am and Book the dentist.";
    expect(checkBrief(text, ctx)).toBe('missing-fact');
  });

  it('advice', () => {
    expect(checkBrief(`${GOOD} You should take something for the tooth.`, ctx)).toBe('advice');
  });

  it('unseen name', () => {
    expect(checkBrief(GOOD.replace('when you can', 'with Jess'), ctx)).toBe('unseen-name');
  });

  it('unseen name: no name on file, and the reply uses one', () => {
    expect(checkBrief(GOOD, { facts })).toBe('unseen-name');
  });

  it('unseen number: a time no fact has', () => {
    expect(checkBrief(GOOD.replace('10am', '11am'), ctx)).toBe('unseen-number');
  });

  it('unseen date', () => {
    expect(checkBrief(GOOD.replace('when you can', 'before friday'), ctx)).toBe('unseen-date');
  });

  it('unseen word: an item the facts do not have', () => {
    const text = GOOD.replace('when you can', 'and pick up dry cleaning');
    expect(checkBrief(text, ctx)).toBe('unseen-word');
  });

  it("same opener as yesterday's", () => {
    expect(checkBrief(GOOD, { ...ctx, lastOpener: openerHash(GOOD) })).toBe('same-opener');
    expect(checkBrief(GOOD, { ...ctx, lastOpener: openerHash('Hey Sam. Busy one.') })).toBeNull();
  });

  it('the opener is the first sentence, folded: case, quotes and the rest of the text do not count', () => {
    const a = openerHash("Morning Sam, it's Alex. Call the plumber.");
    expect(openerHash('morning sam, its alex.  Book the dentist.')).toBe(a);
    expect(openerHash("Hey Sam, it's Alex. Call the plumber.")).not.toBe(a);
  });
});
