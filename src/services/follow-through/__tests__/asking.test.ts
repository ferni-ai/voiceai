import { describe, expect, it } from 'vitest';
import {
  answer,
  ask,
  isSnoozed,
  lastAskedAt,
  snooze,
  topicAskedWithin,
  type AnswerInput,
  type FollowUp,
} from '../follow-up.js';
import { followUp } from './fixtures.js';

const NOW = new Date('2026-10-18T15:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number): Date => new Date(NOW.getTime() + ms);
const BY_CALL = { via: 'opener', personaId: 'ferni', sessionId: 's1' } as const;

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

const thread = (over: Partial<FollowUp> = {}): FollowUp =>
  followUp({ kind: 'thread', text: 'the interview', dueAt: null, topicKey: 'interview', ...over });
const asked = (f: FollowUp = thread(), when: Date = NOW): FollowUp => ok(ask(f, BY_CALL, when));
const answered = (f: FollowUp, input: Partial<AnswerInput>, when: Date = at(HOUR)): FollowUp =>
  ok(answer(f, { answer: 'none', by: 'llm', ...input }, when));

describe('ask', () => {
  it('records who asked it, on which call, and marks it surfaced for the readers that exist', () => {
    const f = asked();
    expect(f.status).toBe('surfaced');
    expect(f.asks).toEqual([{ at: NOW.toISOString(), ...BY_CALL }]);
    expect(f.surfaced).toEqual([{ at: NOW.toISOString(), via: 'opener' }]);
    expect(lastAskedAt(f)).toBe(NOW.toISOString());
  });

  it('is refused under 48 h after the last ask, whatever the answer, and allowed after', () => {
    const once = answered(asked(), { answer: 'none' });
    // `none` sets 2 days of backoff; clear it to test the 48 h rule on its own
    const f: FollowUp = { ...once, nextEligibleAt: undefined };
    expect(ask(f, BY_CALL, at(47 * HOUR)).success).toBe(false);
    expect(ask(f, BY_CALL, at(49 * HOUR)).success).toBe(true);
  });

  it('is refused for a snoozed follow-up until the snooze ends', () => {
    const snoozed = ok(snooze(thread(), at(3 * DAY).toISOString(), NOW));
    expect(isSnoozed(snoozed, at(DAY))).toBe(true);
    const early = ask(snoozed, BY_CALL, at(DAY));
    expect(early.success).toBe(false);
    expect(ask(snoozed, BY_CALL, at(3 * DAY + 1)).success).toBe(true);
  });

  it("is refused for Ferni's own promise (told, never asked) and for a closed one", () => {
    expect(ask(thread({ owner: 'ferni' }), BY_CALL, NOW).success).toBe(false);
    expect(ask(thread({ status: 'done' }), BY_CALL, NOW).success).toBe(false);
  });
});

describe('snooze', () => {
  it('keeps it open with the snooze time, and refuses a time that is not later', () => {
    const f = ok(snooze(asked(), at(DAY).toISOString(), at(HOUR)));
    expect(f.status).toBe('open');
    expect(f.snoozedUntil).toBe(at(DAY).toISOString());
    expect(snooze(thread(), NOW.toISOString(), NOW).success).toBe(false);
    expect(snooze(thread(), 'next week', NOW).success).toBe(false);
  });
});

describe('topicAskedWithin (never the same topic within 48 h)', () => {
  it('is true for a row on the topic asked under 48 h ago, false after or on another topic', () => {
    const rows = [asked(), thread({ id: 'f2', topicKey: 'dentist' })];
    expect(topicAskedWithin(rows, 'interview', at(47 * HOUR))).toBe(true);
    expect(topicAskedWithin(rows, 'interview', at(49 * HOUR))).toBe(false);
    expect(topicAskedWithin(rows, 'dentist', at(HOUR))).toBe(false);
  });
});

describe('answer', () => {
  it('done closes a one-off as answered-done, with the valence kept apart from the verdict', () => {
    const f = answered(asked(), { answer: 'done', valence: 'bad' });
    expect(f).toMatchObject({ status: 'done', closedReason: 'answered-done' });
    expect(f.asks?.[0]).toMatchObject({ answer: 'done', valence: 'bad', by: 'llm' });
  });

  it('no answer keeps it open and waits 2 days', () => {
    const f = answered(asked(), { answer: 'none' }, at(HOUR));
    expect(f.status).toBe('open');
    expect(f.nextEligibleAt).toBe(at(HOUR + 2 * DAY).toISOString());
  });

  it('not yet snoozes to their time, then 7 days, and a third not-yet drops it', () => {
    const when = at(5 * DAY).toISOString();
    const first = answered(asked(), { answer: 'not-yet', whenAgain: when });
    expect(first).toMatchObject({ status: 'open', snoozedUntil: when });

    const second = answered(asked(first, at(6 * DAY)), { answer: 'not-yet' }, at(6 * DAY + HOUR));
    expect(second.snoozedUntil).toBe(at(13 * DAY + HOUR).toISOString());

    const third = answered(asked(second, at(14 * DAY)), { answer: 'not-yet' }, at(14 * DAY + HOUR));
    expect(third).toMatchObject({ status: 'released', closedReason: 'not-yet-x3' });
  });

  it('a first not-yet with no time they gave waits 3 days', () => {
    const f = answered(asked(), { answer: 'not-yet' }, at(HOUR));
    expect(f.snoozedUntil).toBe(at(HOUR + 3 * DAY).toISOString());
  });

  it('a dodge waits 7 days; a second dodge drops it', () => {
    const first = answered(asked(), { answer: 'dodge' }, at(HOUR));
    expect(first).toMatchObject({
      status: 'open',
      nextEligibleAt: at(HOUR + 7 * DAY).toISOString(),
    });
    const second = answered(asked(first, at(8 * DAY)), { answer: 'dodge' }, at(8 * DAY + HOUR));
    expect(second).toMatchObject({ status: 'released', closedReason: 'dodged-twice' });
  });

  it('irritated, already discussed, forget and cancelled release it with their reason', () => {
    const cases = [
      ['irritated', 'irritated'],
      ['already-discussed', 'already-discussed'],
      ['forget', 'forgotten'],
      ['cancelled', 'not-doing'],
    ] as const;
    for (const [said, reason] of cases) {
      expect(answered(asked(), { answer: said }), said).toMatchObject({
        status: 'released',
        closedReason: reason,
      });
    }
  });

  it('is refused with no ask to answer, or when the last ask already has its answer', () => {
    expect(answer(thread(), { answer: 'done', by: 'live' }, NOW).success).toBe(false);
    const once = answered(asked(), { answer: 'none' });
    expect(answer(once, { answer: 'done', by: 'live' }, at(2 * HOUR)).success).toBe(false);
  });
});
