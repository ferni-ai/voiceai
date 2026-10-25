import { describe, expect, it } from 'vitest';
import { CALLER_PROVENANCE } from '../../../memory/recall/session-recall.js';
import { buildPersonModel } from '../build.js';
import { buildUnfinished } from '../unfinished.js';
import { ago, inputs, NOW, summary } from './fixtures.js';

const checked = (daysAgo: number, over: Record<string, unknown>) =>
  summary(daysAgo, { callerProvenance: CALLER_PROVENANCE, ...over });

describe('open loops', () => {
  it('lists follow-ups by due date, then the threads of recent calls', () => {
    const u = buildUnfinished(
      inputs({
        followThrough: [
          {
            kind: 'reminder',
            status: 'open',
            text: 'water the ferns',
            dueAt: ago(-3),
            createdAt: ago(2),
          },
          {
            kind: 'commitment',
            status: 'surfaced',
            text: 'sign up for pottery',
            dueAt: ago(-1),
            createdAt: ago(9),
          },
          { kind: 'reminder', status: 'done', text: 'already done', createdAt: ago(9) },
        ],
        summaries: [
          checked(1, {
            followUpItems: ['ask how the recital went'],
            questionsRemaining: ['which bike to buy'],
          }),
          checked(4, { followUpItems: ['Water the ferns'] }), // same item, said again
        ],
      }),
      NOW,
      []
    );
    expect(u.openLoops.map((l) => [l.text, l.kind, l.ageDays])).toEqual([
      ['sign up for pottery', 'commitment', 9],
      ['water the ferns', 'reminder', 2],
      ['ask how the recital went', 'thread', 1],
      ['which bike to buy', 'thread', 1],
    ]);
  });

  it('takes threads only from summaries checked against their own lines, without disputed items', () => {
    const u = buildUnfinished(
      inputs({
        summaries: [
          summary(1, { followUpItems: ['an unchecked thread'] }),
          checked(2, {
            followUpItems: ['ask about the trip', 'the dog was sick', 'Ferni said it first'],
            disputedItems: ['the dog was sick'],
            assistantRaisedItems: ['Ferni said it first'],
          }),
        ],
      }),
      NOW,
      []
    );
    expect(u.openLoops.map((l) => l.text)).toEqual(['ask about the trip']);
  });

  it('drops forgotten topics and contact data, and keeps at most five', () => {
    const items = ['ex wife lawyer call', 'text 415 555 0134', 'email kim@example.com'];
    for (let k = 0; k < 7; k++) items.push(`thread ${k}`);
    const u = buildUnfinished(inputs({ summaries: [checked(1, { followUpItems: items })] }), NOW, [
      'ex-wife',
    ]);
    expect(u.openLoops).toHaveLength(5);
    expect(u.openLoops.map((l) => l.text).every((t) => /^thread \d$/.test(t))).toBe(true);
  });
});

describe('dates and promises', () => {
  const event = (over: Record<string, unknown>) => ({
    attribute: 'event',
    subject: 'Kate',
    subjectKind: 'person',
    value: 'job interview',
    validTo: null,
    eventDate: '2026-10-21',
    ...over,
  });

  it('lists their own confirmed dates in the next two weeks', () => {
    const u = buildUnfinished(
      inputs({
        worldFacts: [
          event({}),
          event({ value: 'too far', eventDate: '2026-11-20' }),
          event({ value: 'already past', eventDate: '2026-10-10' }),
          event({ value: 'ferni promised', by: 'ferni' }),
          event({ value: 'unsure', needsConfirmation: true }),
          event({ value: 'closed', validTo: ago(1) }),
          event({
            subjectKind: 'self',
            value: 'anniversary',
            recurrence: 'yearly',
            monthDay: '10-25',
            eventDate: undefined,
          }),
        ],
      }),
      NOW,
      []
    );
    expect(u.upcomingDates).toEqual([
      { text: 'Kate: job interview', on: '2026-10-21' },
      { text: 'anniversary', on: '2026-10-25' },
    ]);
  });

  it('lists what Ferni still owes them, as ferni-commitments reads it', () => {
    const u = buildUnfinished(
      inputs({
        ferniCommitments: [
          {
            type: 'follow_up',
            fulfilled: false,
            outcome: 'open',
            commitment: 'send the recipe',
            madeAt: ago(2),
            dueBy: ago(-2),
          },
          { type: 'follow_up', fulfilled: true, commitment: 'kept one', madeAt: ago(2) },
          { type: 'remember', fulfilled: false, commitment: 'their coffee order', madeAt: ago(2) },
          {
            type: 'check_in',
            fulfilled: false,
            outcome: 'missed',
            commitment: 'missed one',
            madeAt: ago(9),
          },
        ],
      }),
      NOW,
      []
    );
    expect(u.ferniOwes).toEqual([{ text: 'send the recipe', since: ago(2) }]);
  });

  it('is wired into the model, and empty when the forgotten topics are unreadable', () => {
    const over = { summaries: [checked(1, { followUpItems: ['ask about the trip'] })] };
    expect(buildPersonModel(inputs(over), NOW).unfinished.value.openLoops).toHaveLength(1);
    expect(
      buildPersonModel(inputs({ ...over, forgotten: null }), NOW).unfinished.value.openLoops
    ).toEqual([]);
  });
});
