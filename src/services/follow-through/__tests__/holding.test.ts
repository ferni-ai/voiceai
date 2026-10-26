/**
 * What Ferni's holding: the person's own live follow-ups, soonest first,
 * honest about what slipped, without forgotten topics, closed or stale ones,
 * internal fields, or anything naming someone else.
 */
import { describe, expect, it } from 'vitest';
import { MAX_HELD, toHeldItem, whatFerniHolds } from '../holding.js';
import type { FollowUp } from '../follow-up.js';
import { followUp } from './fixtures.js';

const NOW = new Date('2026-10-13T16:00:00.000Z');
const at = (hours: number): string => new Date(NOW.getTime() + hours * 3_600_000).toISOString();
const nothingForgotten = (): boolean => false;
const ids = (items: ReadonlyArray<{ id: string }>): string[] => items.map((i) => i.id);

describe('whatFerniHolds', () => {
  it('lists due-soon first, undated last, and flags past-due-but-not-stale as slipped', () => {
    const rows = [
      followUp({ id: 'undated', dueAt: null, kind: 'thread', createdAt: at(-24) }),
      followUp({ id: 'tomorrow', dueAt: at(24) }),
      followUp({ id: 'slipped', dueAt: at(-5) }),
      followUp({ id: 'in-an-hour', dueAt: at(1), status: 'surfaced' }),
    ];

    const view = whatFerniHolds('u1', rows, nothingForgotten, NOW);

    expect(ids(view.items)).toEqual(['slipped', 'in-an-hour', 'tomorrow', 'undated']);
    expect(view.items.map((i) => i.slipped)).toEqual([true, false, false, false]);
    expect(view.items[1]?.status).toBe('surfaced');
    expect(view.asOf).toBe(NOW.toISOString());
  });

  it('leaves out done, released and expired rows, and ones rightMoment would expire', () => {
    const rows = [
      followUp({ id: 'live', dueAt: at(2) }),
      followUp({ id: 'done', status: 'done' }),
      followUp({ id: 'released', status: 'released', closedReason: 'not-doing' }),
      followUp({ id: 'expired', status: 'expired' }),
      // a dated one-off more than two days past due, and a thread untouched for 15 days
      followUp({ id: 'stale-dated', dueAt: at(-49) }),
      followUp({ id: 'stale-thread', dueAt: null, kind: 'thread', createdAt: at(-15 * 24) }),
      // a repeating one never goes stale by date
      followUp({ id: 'repeat', dueAt: at(-72), repeat: { every: 'day', at: '08:00' } }),
    ];

    const view = whatFerniHolds('u1', rows, nothingForgotten, NOW);

    expect(ids(view.items)).toEqual(['repeat', 'live']);
    expect(view.items[0]?.slipped).toBe(true);
  });

  it('leaves out anything about a topic they asked Ferni to forget', () => {
    const rows = [
      followUp({ id: 'divorce', text: 'ask how the divorce papers went', dueAt: at(1) }),
      followUp({ id: 'dentist', text: 'call the dentist', dueAt: at(2) }),
    ];

    const view = whatFerniHolds('u1', rows, (t) => t.includes('divorce'), NOW);

    expect(ids(view.items)).toEqual(['dentist']);
  });

  it("never lists another person's row, even one the store handed back", () => {
    const rows = [
      followUp({ id: 'mine', userId: 'u1', dueAt: at(1) }),
      followUp({ id: 'theirs', userId: 'u2', dueAt: at(0.5) }),
    ];

    expect(ids(whatFerniHolds('u1', rows, nothingForgotten, NOW).items)).toEqual(['mine']);
  });

  it('caps the list at 20, keeping the soonest', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      followUp({ id: `f${String(i).padStart(2, '0')}`, dueAt: at(25 - i) })
    );

    const view = whatFerniHolds('u1', rows, nothingForgotten, NOW);

    expect(MAX_HELD).toBe(20);
    expect(view.items).toHaveLength(20);
    expect(view.items[0]?.id).toBe('f24');
    expect(view.items.some((i) => i.id === 'f00')).toBe(false);
  });
});

describe('toHeldItem', () => {
  it('maps only the view fields: no source ref, action, closedReason, userId or brain fields', () => {
    const row: FollowUp = followUp({
      id: 'r1',
      source: { store: 'reminders', ref: 'secret-ref' },
      closedReason: 'stale',
      topicKey: 'mom call',
      salience: { weight: 0.9, heavy: true, sensitive: true, by: 'llm', v: 1 },
    });

    const item = toHeldItem(row, NOW);

    expect(Object.keys(item).sort()).toEqual(
      ['dueAt', 'id', 'kind', 'slipped', 'source', 'status', 'text', 'zone'].sort()
    );
    expect(item).toEqual({
      id: 'r1',
      kind: 'reminder',
      text: 'call mom',
      dueAt: row.dueAt,
      zone: row.zone,
      status: 'open',
      slipped: true,
      source: 'reminder',
    });
  });

  it('names the source by kind of store, never the store or its ref', () => {
    const src = (store: string): string =>
      toHeldItem(followUp({ source: { store, ref: 'x' } }), NOW).source;

    expect(['reminders', 'commitments', 'summaries', 'something-new'].map(src)).toEqual([
      'reminder',
      'commitment',
      'thread',
      'other',
    ]);
  });

  it('shows an on-behalf call or text as a plain phrase, with no contact, number or contactId', () => {
    const call = followUp({
      kind: 'promise',
      text: 'Call Aunt Linda at (415) 555-0132 for you',
      source: { store: 'outreach_confirm', ref: 'u-1' },
      action: { tool: 'callOnBehalf', contactId: 'contact-abc123', waitingOn: 'you' },
    });
    const text = followUp({
      kind: 'promise',
      text: 'Text Marcus that you are running late',
      action: { tool: 'reachOut', contactId: 'contact-xyz' },
    });

    const items = [toHeldItem(call, NOW), toHeldItem(text, NOW)];
    const json = JSON.stringify(items);

    expect(items.map((i) => [i.text, i.source])).toEqual([
      ['A call you asked me to make', 'on-behalf'],
      ['A message you asked me to send', 'on-behalf'],
    ]);
    expect(json).not.toMatch(/contact-|Linda|Marcus|555|contactId/);
  });

  it('still names no one when an on-behalf row lost its action', () => {
    const bare = followUp({
      kind: 'promise',
      text: 'Call Aunt Linda for you',
      source: { store: 'outreach_confirm', ref: 'u-2' },
    });
    const item = toHeldItem(bare, NOW);
    expect([item.text, item.source]).toEqual(['Something you asked me to do for you', 'on-behalf']);
    expect(JSON.stringify(item)).not.toMatch(/Linda/);
  });

  it('blanks phone numbers and email addresses in any text, but leaves times and dates', () => {
    const t = (text: string): string => toHeldItem(followUp({ text }), NOW).text;

    expect(t('call +1 415-555-0132 about the car')).toBe('call a number about the car');
    expect(t('email jo@example.com the form')).toBe('email an email address the form');
    expect(t('pick up 2 bags at 10:30')).toBe('pick up 2 bags at 10:30');
    expect(t('rent due 2026-11-01')).toBe('rent due 2026-11-01');
    expect(t('dentist 2026-10-22 8:30')).toBe('dentist 2026-10-22 8:30');
    expect(t('dentist 2026-10-22T08:30')).toBe('dentist 2026-10-22T08:30');
    expect(t('call 415-555-0132 on 2026-10-22 9:15')).toBe('call a number on 2026-10-22 9:15');
    // A date-shaped run inside a longer number never splits it.
    expect(t('ring +44 2026-10-22 1234 now')).not.toMatch(/2026|1234/);
    expect(t('ring 4155-12-0132 77 today')).toBe('ring a number today');
    // Over-long runs are never handed back: two numbers side by side, or a number by a date.
    expect(t('dentist 2026-10-22 415-555-0132')).not.toMatch(/415|555|0132/);
    expect(t('415 555 0132 2026-10-22')).not.toMatch(/415|555|0132/);
    expect(t('call 415-555-0132 415-555-0199')).toBe('call a number');
    expect(t('4155-55-0132')).toBe('a number');
    // A bracketed area code goes with the number; a bracketed date stays.
    expect(t('The number is (415)555-0132')).toBe('The number is a number');
    expect(t('call (415) 555-0132 today')).toBe('call a number today');
    expect(t('rent due (2026-11-01)')).toBe('rent due (2026-11-01)');
  });
});
