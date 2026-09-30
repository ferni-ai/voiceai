/**
 * Quiet users hear from us less often, and after a few unanswered messages
 * not at all until they come back.
 */
import { describe, expect, it } from 'vitest';
import {
  cadenceHold,
  engagementLevel,
  MAX_UNANSWERED,
  unansweredCount,
} from '../outreach-cadence.js';

const NOW = Date.parse('2026-09-30T16:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('engagementLevel', () => {
  it('reads lastContact, which is where user records keep the last session', () => {
    expect(engagementLevel({ lastContact: daysAgo(1) }, NOW)).toBe('high');
    expect(engagementLevel({ lastContact: daysAgo(5) }, NOW)).toBe('medium');
    expect(engagementLevel({ lastContact: daysAgo(10) }, NOW)).toBe('low');
    expect(engagementLevel({ lastContact: daysAgo(40) }, NOW)).toBe('silent');
  });

  it('accepts Firestore timestamps and falls back to lastConversationDate', () => {
    const ts = { toDate: () => new Date(NOW - 86_400_000) };
    expect(engagementLevel({ lastContact: ts }, NOW)).toBe('high');
    expect(engagementLevel({ lastConversationDate: daysAgo(1) }, NOW)).toBe('high');
    expect(engagementLevel({}, NOW)).toBe('silent');
    expect(engagementLevel({ lastContact: 'not a date' }, NOW)).toBe('silent');
  });
});

describe('cadenceHold', () => {
  it('lets an active user hear from us daily', () => {
    expect(cadenceHold({ lastOutreachDate: daysAgo(1.2) }, 'high', NOW)).toBeNull();
    expect(cadenceHold({ lastOutreachDate: daysAgo(0.5) }, 'high', NOW)).not.toBeNull();
  });

  it('waits a week between messages to a silent user', () => {
    expect(cadenceHold({ lastOutreachDate: daysAgo(3) }, 'silent', NOW)).toBe('Contacted recently');
    expect(cadenceHold({ lastOutreachDate: daysAgo(8) }, 'silent', NOW)).toBeNull();
  });

  it('stops after the unanswered limit, however long ago the last one was', () => {
    const user = { lastOutreachDate: daysAgo(30), outreachUnanswered: MAX_UNANSWERED };
    expect(cadenceHold(user, 'silent', NOW)).toBe('Unanswered limit reached');
  });

  it('starts over once they talk with Ferni again', () => {
    const user = {
      lastOutreachDate: daysAgo(30),
      outreachUnanswered: MAX_UNANSWERED,
      lastContact: daysAgo(20),
    };
    expect(unansweredCount(user)).toBe(0);
    expect(cadenceHold(user, 'silent', NOW)).toBeNull();
  });

  it('never contacted means nothing to hold', () => {
    expect(unansweredCount({ outreachUnanswered: 5 })).toBe(0);
    expect(cadenceHold({}, 'silent', NOW)).toBeNull();
  });
});
