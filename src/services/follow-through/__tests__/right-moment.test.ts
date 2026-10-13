import { describe, expect, it } from 'vitest';
import { rightMoment } from '../right-moment.js';
import { followUp } from './fixtures.js';

// The fixture is due 2026-10-13T16:00Z: noon in New York.
const at = (iso: string): Date => new Date(iso);

describe('rightMoment', () => {
  it('waits until it is due', () => {
    expect(rightMoment(followUp(), at('2026-10-13T15:59:00Z'))).toBe('wait');
  });

  it('texts a reminder the caller timed as soon as it is due', () => {
    expect(rightMoment(followUp(), at('2026-10-13T16:01:00Z'))).toBe('text-now');
  });

  it('texts a reminder the caller timed even in quiet hours (they asked for 6am)', () => {
    const early = followUp({ dueAt: '2026-10-13T10:00:00.000Z' }); // 6am New York
    expect(rightMoment(early, at('2026-10-13T10:01:00Z'))).toBe('text-now');
  });

  it('does not text a time Ferni picked during quiet hours', () => {
    const late = followUp({ kind: 'commitment', dueAt: '2026-10-14T02:00:00.000Z' }); // 10pm New York
    expect(rightMoment(late, at('2026-10-14T02:05:00Z'))).toBe('wait');
  });

  it('texts a time Ferni picked outside quiet hours', () => {
    expect(rightMoment(followUp({ kind: 'commitment' }), at('2026-10-13T16:01:00Z'))).toBe(
      'text-now'
    );
  });

  it('never texts twice for the same due time; it waits for the next call', () => {
    const texted = followUp({
      status: 'surfaced',
      surfaced: [{ at: '2026-10-13T16:01:00.000Z', via: 'text' }],
    });
    expect(rightMoment(texted, at('2026-10-13T16:30:00Z'))).toBe('next-call');
  });

  it('a text from before it fell due does not count against it', () => {
    const early = followUp({ surfaced: [{ at: '2026-10-12T16:00:00.000Z', via: 'text' }] });
    expect(rightMoment(early, at('2026-10-13T16:01:00Z'))).toBe('text-now');
  });

  it('saves it for the next call when it is too late for "it is noon" to make sense', () => {
    expect(rightMoment(followUp(), at('2026-10-13T20:00:00Z'))).toBe('next-call');
  });

  it('expires a dated one-off two days past due', () => {
    expect(rightMoment(followUp(), at('2026-10-15T17:00:00Z'))).toBe('expire');
  });

  it('never expires a repeating one for being past due', () => {
    const daily = followUp({ kind: 'dose', repeat: { every: 'day', at: '12:00' } });
    expect(rightMoment(daily, at('2026-10-20T17:00:00Z'))).not.toBe('expire');
  });

  it('holds an undated thread for the next call, and expires it after 14 days', () => {
    const thread = followUp({ kind: 'thread', dueAt: null });
    expect(rightMoment(thread, at('2026-10-20T12:00:00Z'))).toBe('next-call');
    expect(rightMoment(thread, at('2026-10-27T12:00:00Z'))).toBe('expire');
  });

  it('does nothing with a closed one', () => {
    expect(rightMoment(followUp({ status: 'done' }), at('2026-10-13T16:01:00Z'))).toBe('wait');
  });
});
