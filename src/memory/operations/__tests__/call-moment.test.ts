import { describe, expect, it, vi } from 'vitest';

vi.mock('../../embeddings.js', () => ({ embed: vi.fn(async () => null) }));
import {
  callMomentLine,
  callerTimeZoneFor,
  partOfDay,
  rememberCallerTimeZone,
} from '../call-moment.js';
import { summarizeWithLLM } from '../summarizer.js';

// 8pm Saturday in Denver is already Sunday in UTC.
const SAT_EVENING_DENVER = new Date('2026-10-11T02:00:00Z');

describe('callMomentLine', () => {
  it("dates the call in the caller's own zone, not UTC", () => {
    const line = callMomentLine(SAT_EVENING_DENVER, 'America/Denver');
    expect(line).toContain('Saturday, 2026-10-10, in the evening (20:00 America/Denver)');
    expect(line).not.toContain('Sunday, 2026-10-11');
  });

  it('turns "tomorrow" and weekdays into days the model can copy', () => {
    const line = callMomentLine(SAT_EVENING_DENVER, 'America/Denver');
    expect(line).toContain('tomorrow 2026-10-11');
    expect(line).toContain('Thursday 2026-10-15');
    expect(line).toContain('Saturday 2026-10-17');
    expect(line).toMatch(/absolute date \(YYYY-MM-DD\)/);
  });

  it('says so when the zone is unknown or invalid, and uses UTC', () => {
    for (const zone of [undefined, 'Mars/Olympus']) {
      const line = callMomentLine(SAT_EVENING_DENVER, zone);
      expect(line).toContain('Sunday, 2026-10-11, at night (02:00 UTC, caller time zone unknown)');
    }
  });

  it('a 9pm Denver call is "evening" in local time, never night or 1 AM (UTC)', () => {
    const nine = new Date('2026-10-11T03:00:00Z'); // 21:00 MDT, 03:00 UTC
    const line = callMomentLine(nine, 'America/Denver');
    expect(line).toContain('Saturday, 2026-10-10, in the evening (21:00 America/Denver)');
    expect(line).not.toMatch(/\bnight\b|03:00|01:00/);
    expect(line).toMatch(/never describe the call's time in UTC/);
  });

  it('names the part of day by local hour', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22].map(partOfDay)).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
    ]);
  });

  it('crosses month and year ends', () => {
    const line = callMomentLine(new Date('2026-12-30T15:00:00Z'), 'Asia/Tokyo');
    expect(line).toContain('Thursday, 2026-12-31, at night (00:00 Asia/Tokyo)');
    expect(line).toContain('tomorrow 2027-01-01');
  });
});

describe('caller zone per session', () => {
  it('remembers a valid zone and ignores anything else', () => {
    rememberCallerTimeZone('America/Denver', 's-a');
    rememberCallerTimeZone('not a zone', 's-b');
    rememberCallerTimeZone(42, 's-c');
    expect(callerTimeZoneFor('s-a')).toBe('America/Denver');
    expect(callerTimeZoneFor('s-b')).toBeUndefined();
    expect(callerTimeZoneFor('s-c')).toBeUndefined();
  });

  it('records every id the call is keyed by (session and realtime conversation)', () => {
    rememberCallerTimeZone('America/Denver', 's-d', 'conv-d', undefined, '');
    expect(callerTimeZoneFor('s-d')).toBe('America/Denver');
    expect(callerTimeZoneFor('conv-d')).toBe('America/Denver');
  });
});

describe('end-of-call summary prompt', () => {
  it('carries the call date in the zone recorded for the session', async () => {
    rememberCallerTimeZone('America/Denver', 's-sum');
    let prompt = '';
    const llm = async (p: string) => {
      prompt = p;
      return '{"mainTopics":["interview"],"keyPoints":["Interview at Northlight on 2026-10-15"]}';
    };
    await summarizeWithLLM(
      's-sum',
      [{ role: 'user', content: 'My interview is Thursday.', timestamp: SAT_EVENING_DENVER }],
      llm,
      { generateEmbedding: false }
    );
    expect(prompt).toContain('Saturday, 2026-10-10, in the evening (20:00 America/Denver)');
    expect(prompt).toContain('Thursday 2026-10-15');
    // Follow-ups feed pondering, recall and outreach: no routine-life trivia.
    expect(prompt).toMatch(/followUps: only what a close friend would ask/);
    expect(prompt).toMatch(/Never routine daily life \(sleep, meals, chores, a run\)/);
  });

  it('an explicit zone wins over the recorded one', async () => {
    rememberCallerTimeZone('America/Denver', 's-sum2');
    let prompt = '';
    await summarizeWithLLM(
      's-sum2',
      [{ role: 'user', content: 'hi', timestamp: SAT_EVENING_DENVER }],
      async (p) => ((prompt = p), '{}'),
      { generateEmbedding: false, timeZone: 'Asia/Tokyo' }
    );
    expect(prompt).toContain('Sunday, 2026-10-11, in the morning (11:00 Asia/Tokyo)');
  });
});
