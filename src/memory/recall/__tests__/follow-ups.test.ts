import { describe, expect, it } from 'vitest';
import {
  followUpId,
  followUpsFromSummaries,
  formatFollowUps,
  raisedIn,
  toMillis,
  whenSaid,
  type FollowUp,
} from '../follow-ups.js';

const DAY = 86_400_000;
// Friday 2026-09-25, 18:00 in Denver (00:00 UTC Saturday)
const now = Date.parse('2026-09-26T00:00:00Z');
const tz = 'America/Denver';

describe('toMillis', () => {
  it('reads the timestamp shapes summaries are stored with', () => {
    const ms = Date.parse('2026-09-20T12:00:00Z');
    expect(toMillis(ms)).toBe(ms);
    expect(toMillis(new Date(ms))).toBe(ms);
    expect(toMillis('2026-09-20T12:00:00Z')).toBe(ms);
    expect(toMillis({ toMillis: () => ms })).toBe(ms);
    expect(toMillis({ _seconds: ms / 1000 })).toBe(ms);
    expect(toMillis(undefined)).toBe(0);
  });
});

describe('followUpId', () => {
  it('is the same however the summary phrased the thread', () => {
    expect(followUpId('Ask about the vet visit')).toBe('vet-visit');
    expect(followUpId('Check on the vet visit')).toBe('vet-visit');
  });
});

describe('followUpsFromSummaries', () => {
  it('keeps newest first, once each, without closed or stale threads', () => {
    const got = followUpsFromSummaries(
      [
        {
          timestamp: now - 2 * DAY,
          followUpItems: ['Ask how the interview went', 'Ask about the vet visit'],
        },
        { timestamp: now - 5 * DAY, followUpItems: ['Check on the vet visit', 'Ask about Austin'] },
        { timestamp: now - 90 * DAY, followUpItems: ['Ask about the old apartment'] },
      ],
      new Set(['austin']),
      now
    );
    expect(got.map((f) => f.text)).toEqual([
      'Ask how the interview went',
      'Ask about the vet visit',
    ]);
    expect(got[0].at).toBe(now - 2 * DAY);
  });
});

describe('whenSaid', () => {
  it('counts days in the caller’s calendar, not the server’s', () => {
    // 20:00 Thursday in Denver is already Friday in UTC
    const thursdayEvening = Date.parse('2026-09-25T02:00:00Z');
    expect(whenSaid(thursdayEvening, now, tz)).toBe('yesterday');
  });

  it('names the weekday for the past week, and rounds older ones', () => {
    expect(whenSaid(now - 3 * DAY, now, tz)).toBe('3 days ago (Tuesday)');
    expect(whenSaid(now - 9 * DAY, now, tz)).toBe('last Wednesday, 9 days ago');
    expect(whenSaid(now - 21 * DAY, now, tz)).toBe('about 3 weeks ago');
    expect(whenSaid(0, now, tz)).toBe('on an earlier call');
  });
});

describe('formatFollowUps', () => {
  it('says when each came up and asks to work out whether it has happened', () => {
    const lines = formatFollowUps(
      [{ id: 'interview-thursday', text: 'Interview on Thursday', at: now - 3 * DAY }],
      now,
      tz
    );
    expect(lines[1]).toBe('- Interview on Thursday [said 3 days ago (Tuesday)]');
    expect(lines.at(-1)).toMatch(/whether it has happened yet/);
    expect(formatFollowUps([], now)).toEqual([]);
  });
});

describe('raisedIn', () => {
  const interview: FollowUp = {
    id: 'job-interview',
    text: 'Ask how the job interview went',
    at: 0,
  };
  const vet: FollowUp = { id: 'vet-visit', text: 'Ask about the vet visit', at: 0 };

  it('counts a reply that brings the thread up', () => {
    expect(raisedIn('So how did the interview go?', [interview, vet])).toEqual([interview]);
    expect(raisedIn('How was the vet visit for Biscuit?', [interview, vet])).toEqual([vet]);
  });

  it('does not count a passing word or the way the thread was phrased', () => {
    expect(raisedIn('Can I ask you something?', [interview, vet])).toEqual([]);
    expect(raisedIn('Did your visit go okay?', [interview, vet])).toEqual([]);
  });
});
