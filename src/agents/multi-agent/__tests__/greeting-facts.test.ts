/**
 * The greeting knows a returning caller (orchestrator.ts used to tell the
 * director every caller was new: isReturningUser: false, no history facts).
 */
import { describe, expect, it } from 'vitest';
import {
  callerHistory,
  greetingFacts,
  rememberCallerHistory,
  takeCallerHistory,
} from '../greeting-direction.js';

const NOW = new Date('2026-10-04T18:00:00Z');

describe('callerHistory', () => {
  it('is undefined for a first call', () => {
    expect(callerHistory({ totalConversations: 0 }, NOW)).toBeUndefined();
    expect(callerHistory({}, NOW)).toBeUndefined();
  });

  it('carries the count, days since the last call and what it was about', () => {
    expect(
      callerHistory(
        {
          totalConversations: 7,
          lastContact: '2026-10-01T20:00:00Z',
          lastConversationSummary: 'Talked about the job interview on Thursday.',
        },
        NOW
      )
    ).toEqual({
      calls: 7,
      daysSince: 2,
      lastTopic: 'Talked about the job interview on Thursday.',
    });
  });

  it('keeps the last topic short enough to be a greeting fact', () => {
    const h = callerHistory(
      { totalConversations: 2, lastConversationSummary: 'x'.repeat(500) },
      NOW
    );
    expect(h?.lastTopic?.length).toBeLessThanOrEqual(160);
  });
});

describe('greetingFacts', () => {
  it('a first call gets only the time of day and the name', () => {
    expect(greetingFacts('evening', 'Seth', undefined)).toEqual({
      'time of day': 'evening',
      'their name': 'Seth',
    });
  });

  it('a returning caller gets when you last talked and about what', () => {
    const facts = greetingFacts('evening', 'Seth', {
      calls: 7,
      daysSince: 1,
      lastTopic: 'the job interview',
    });
    expect(facts['last time you talked']).toBe('yesterday');
    expect(facts['what you talked about last time']).toBe('the job interview');
    expect(facts['how well you know each other']).toMatch(/7 calls/);
  });
});

describe('per-session history store', () => {
  it('hands the history to the greeting once', () => {
    rememberCallerHistory('s1', { calls: 3, daysSince: 5 });
    expect(takeCallerHistory('s1')).toEqual({ calls: 3, daysSince: 5 });
    expect(takeCallerHistory('s1')).toBeUndefined();
  });
});

describe('greetingFacts with a check-in (COACH_FOLLOW_THROUGH)', () => {
  it('carries what they said they would do, even before the profile loads', () => {
    const facts = greetingFacts(
      'evening',
      'Sam',
      undefined,
      "I'm going to send my resume to Dana."
    );
    expect(facts['something they said they would do']).toBe("I'm going to send my resume to Dana.");
  });

  it('leaves it out when there is nothing to check in on', () => {
    expect(greetingFacts('evening', 'Sam', { calls: 3 })).not.toHaveProperty(
      'something they said they would do'
    );
  });
});
