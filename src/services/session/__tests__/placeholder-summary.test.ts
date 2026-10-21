/**
 * PLACEHOLDER_SUMMARY_UNKNOWN (#2221): the safeguard's "Had a 1-minute
 * conversation" is not told to Ferni as a topic. Real buildUserAwareness
 * (voice-agent-entry path) and lastTalkedAbout (multi-agent agent-setup path).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUserAwareness } from '../../../agents/voice-agent/phases/user-awareness.js';
import { lastTalkedAbout } from '../../../agents/multi-agent/teammate-relationship.js';
import { createUserProfile } from '../../../types/user-profile.js';
import {
  isPlaceholderSummary,
  placeholderSummaryNote,
  UNKNOWN_LAST_TOPIC,
} from '../placeholder-summary.js';

const sessionStartTime = new Date('2026-10-19T18:05:51Z');

function awarenessFor(summary: string): string[] {
  const profile = createUserProfile('u-caller');
  profile.totalConversations = 1;
  profile.lastContact = new Date('2026-10-19T10:40:02Z');
  profile.lastConversationSummary = summary;
  return buildUserAwareness({ userProfile: profile, isReturningUser: true, sessionStartTime })
    .facts;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isPlaceholderSummary', () => {
  it('matches the safeguard placeholders and nothing with content', () => {
    expect(isPlaceholderSummary('Had a 1-minute conversation')).toBe(true);
    expect(isPlaceholderSummary('Had a 12-minute conversation')).toBe(true);
    expect(isPlaceholderSummary('Connected on 10/19/2026')).toBe(true);
    expect(isPlaceholderSummary('Chatted about work, the boat')).toBe(false);
    expect(isPlaceholderSummary('Had a 1-minute conversation about the move')).toBe(false);
  });
});

describe('PLACEHOLDER_SUMMARY_UNKNOWN on', () => {
  it('voice-agent-entry awareness says the topic is unknown instead of the placeholder', () => {
    vi.stubEnv('PLACEHOLDER_SUMMARY_UNKNOWN', 'on');
    const facts = awarenessFor('Had a 1-minute conversation');
    expect(facts).toContain(UNKNOWN_LAST_TOPIC);
    expect(facts.some((f) => f.includes('Had a 1-minute conversation'))).toBe(false);
  });

  it('multi-agent awareness line says the topic is unknown', () => {
    vi.stubEnv('PLACEHOLDER_SUMMARY_UNKNOWN', 'on');
    expect(lastTalkedAbout(false, 'Had a 1-minute conversation')).toBe(UNKNOWN_LAST_TOPIC);
    expect(lastTalkedAbout(true, 'Connected on 10/19/2026')).toBe(UNKNOWN_LAST_TOPIC);
  });

  it('a real summary is still told as before', () => {
    vi.stubEnv('PLACEHOLDER_SUMMARY_UNKNOWN', 'on');
    expect(awarenessFor('Chatted about the boat trip')).toContain(
      'Last time you talked about: Chatted about the boat trip'
    );
    expect(lastTalkedAbout(false, 'Chatted about the boat trip')).toBe(
      'Last time you talked about: Chatted about the boat trip'
    );
  });
});

describe('PLACEHOLDER_SUMMARY_UNKNOWN off (default)', () => {
  it('the placeholder lines are exactly as before', () => {
    vi.stubEnv('PLACEHOLDER_SUMMARY_UNKNOWN', '');
    expect(placeholderSummaryNote('Had a 1-minute conversation')).toBeUndefined();
    expect(awarenessFor('Had a 1-minute conversation')).toContain(
      'Last time you talked about: Had a 1-minute conversation'
    );
    expect(lastTalkedAbout(false, 'Had a 1-minute conversation')).toBe(
      'Last time you talked about: Had a 1-minute conversation'
    );
    expect(lastTalkedAbout(true, 'Had a 1-minute conversation')).toBe(
      'Last time they called, they talked about: Had a 1-minute conversation'
    );
  });
});
