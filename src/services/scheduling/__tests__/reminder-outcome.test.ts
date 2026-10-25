/**
 * A reminder a family member asked for is attributed to them, in the same
 * words deliverReminder used before this moved out of reminder-scheduler.ts.
 */
import { describe, expect, it } from 'vitest';
import { attributedMessage, reachedThem } from '../reminder-outcome.js';
import type { ScheduledReminder } from '../reminder-scheduler.js';

const r = (extra: Partial<ScheduledReminder>) =>
  ({ id: 'r1', message: 'take your pills', ...extra }) as ScheduledReminder;
const from = (sourceRelationship?: string) =>
  attributedMessage(r({ sourceIdentityId: 'i1', sourceIdentityName: 'Ann', sourceRelationship }));

describe('attributedMessage', () => {
  it('is the plain message when nobody asked for it', () => {
    expect(attributedMessage(r({}))).toBe('take your pills');
  });

  it('names the family member in everyday words', () => {
    expect(from('mother')).toBe('Your mom Ann wanted me to remind you: take your pills');
    expect(from('grandfather')).toBe('Your grandpa Ann wanted me to remind you: take your pills');
    expect(from('sibling')).toBe('Your sibling Ann wanted me to remind you: take your pills');
    expect(from('other')).toBe('Your other Ann wanted me to remind you: take your pills');
    expect(from(undefined)).toBe('Ann wanted me to remind you: take your pills');
  });
});

describe('reachedThem', () => {
  it('is false for a failure and for an inbox row nobody was told about', () => {
    expect(reachedThem('sent')).toBe(true);
    expect(reachedThem('in_app')).toBe(true);
    expect(reachedThem('held')).toBe(true);
    expect(reachedThem('in_app_unnotified')).toBe(false);
    expect(reachedThem('failed')).toBe(false);
  });
});
