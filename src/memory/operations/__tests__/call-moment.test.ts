import { describe, expect, it, vi } from 'vitest';

vi.mock('../../embeddings.js', () => ({ embed: vi.fn(async () => null) }));
import { callMomentLine, callerTimeZoneFor, rememberCallerTimeZone } from '../call-moment.js';
import { summarizeWithLLM } from '../summarizer.js';

// 8pm Saturday in Denver is already Sunday in UTC.
const SAT_EVENING_DENVER = new Date('2026-10-11T02:00:00Z');

describe('callMomentLine', () => {
  it("dates the call in the caller's own zone, not UTC", () => {
    const line = callMomentLine(SAT_EVENING_DENVER, 'America/Denver');
    expect(line).toContain('Saturday, 2026-10-10 (America/Denver)');
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
      expect(line).toContain('Sunday, 2026-10-11 (UTC, caller time zone unknown)');
    }
  });

  it('crosses month and year ends', () => {
    const line = callMomentLine(new Date('2026-12-30T15:00:00Z'), 'Asia/Tokyo');
    expect(line).toContain('Thursday, 2026-12-31 (Asia/Tokyo)');
    expect(line).toContain('tomorrow 2027-01-01');
  });
});

describe('caller zone per session', () => {
  it('remembers a valid zone and ignores anything else', () => {
    rememberCallerTimeZone('s-a', 'America/Denver');
    rememberCallerTimeZone('s-b', 'not a zone');
    rememberCallerTimeZone('s-c', 42);
    expect(callerTimeZoneFor('s-a')).toBe('America/Denver');
    expect(callerTimeZoneFor('s-b')).toBeUndefined();
    expect(callerTimeZoneFor('s-c')).toBeUndefined();
  });
});

describe('end-of-call summary prompt', () => {
  it('carries the call date in the zone recorded for the session', async () => {
    rememberCallerTimeZone('s-sum', 'America/Denver');
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
    expect(prompt).toContain('Saturday, 2026-10-10 (America/Denver)');
    expect(prompt).toContain('Thursday 2026-10-15');
  });

  it('an explicit zone wins over the recorded one', async () => {
    rememberCallerTimeZone('s-sum2', 'America/Denver');
    let prompt = '';
    await summarizeWithLLM(
      's-sum2',
      [{ role: 'user', content: 'hi', timestamp: SAT_EVENING_DENVER }],
      async (p) => ((prompt = p), '{}'),
      { generateEmbedding: false, timeZone: 'Asia/Tokyo' }
    );
    expect(prompt).toContain('Sunday, 2026-10-11 (Asia/Tokyo)');
  });
});
