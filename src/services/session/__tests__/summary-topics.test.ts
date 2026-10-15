/**
 * A new call is handed the last call's topics, never the summarizer's read of
 * the caller's mood, and each line says whose notes they are (#1415).
 */
import { describe, expect, it } from 'vitest';
import { buildUserAwareness } from '../../../agents/voice-agent/phases/user-awareness.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { lastCallNotes, lastCallTopics, lastMoodNote, topicKeyPoints } from '../summary-topics.js';

describe('topicKeyPoints', () => {
  it.each([
    'User seemed frustrated and confused by the conversation',
    'The user expressed frustration that Ferni did not remember them',
    'They sounded tired and a bit down',
    'Caller was having a rough day',
    'User felt overwhelmed by work',
    'She seemed upset about the call',
  ])('leaves out a read of their state: %j', (point) => {
    expect(topicKeyPoints([point, 'Planning a trip to Denver'])).toEqual([
      'Planning a trip to Denver',
    ]);
  });

  it.each([
    'Planning a trip to Denver in May',
    'Asked Ferni to call their brother',
    'Talked about the new job and the commute',
    "User's sister just moved to Denver",
    'User is learning to cook risotto',
  ])('keeps a topic: %j', (point) => {
    expect(topicKeyPoints([point])).toEqual([point]);
  });

  it('LAST_CALL_TOPICS_ONLY=off keeps every key point', () => {
    const points = ['User seemed frustrated', 'Planning a trip'];
    expect(topicKeyPoints(points, { LAST_CALL_TOPICS_ONLY: 'off' })).toEqual(points);
  });
});

describe('lastCallTopics', () => {
  it('filters a summary already stored as "a; b"', () => {
    expect(
      lastCallTopics('User seemed frustrated and confused; Asked Ferni to call their brother')
    ).toBe('Asked Ferni to call their brother');
    expect(lastCallTopics('User seemed frustrated and confused')).toBe('');
    expect(lastCallTopics(undefined)).toBe('');
  });
});

describe('lastCallNotes', () => {
  it("names the notes as Ferni's and rules out telling them how their day went", () => {
    const [note] = lastCallNotes('the trip to Denver');
    expect(note).toBe(
      'Your own notes on what you talked about last time (not their words): the trip to Denver. Never tell them how their day, mood or last call went unless they tell you on this call.'
    );
    expect(note).not.toMatch(/\u2014|\u2013|\.\.\.|\u2026/);
  });

  it('gives no line when the summary was only a read of their mood', () => {
    expect(lastCallNotes('They sounded tired and a bit down')).toEqual([]);
  });

  it('LAST_CALL_TOPICS_ONLY=off gives the line exactly as before', () => {
    expect(lastCallNotes('their week', { LAST_CALL_TOPICS_ONLY: 'off' })).toEqual([
      'Last time you talked about: their week',
    ]);
  });
});

describe('lastMoodNote', () => {
  it("names Ferni's mood read as his own sense, not a fact about them", () => {
    const [note] = lastMoodNote('tired_but_present');
    expect(note).toBe(
      'Your own sense last time, not something they said: they seemed a bit tired. Let it shape your tone; never tell them how they were or how their day went unless they say so on this call.'
    );
    expect(note).not.toMatch(/^Last time they/);
  });

  it('gives no line for an unknown or missing mood', () => {
    expect(lastMoodNote(undefined)).toEqual([]);
    expect(lastMoodNote('constructor')).toEqual([]);
    expect(lastMoodNote('furious')).toEqual([]);
  });

  it('LAST_CALL_TOPICS_ONLY=off gives the line exactly as before', () => {
    expect(lastMoodNote('tired_but_present', { LAST_CALL_TOPICS_ONLY: 'off' })).toEqual([
      'Last time they seemed a bit tired - be gentle.',
    ]);
  });
});

describe('the system prompt a returning caller gets', () => {
  it("carries the topic as Ferni's notes, no mood read stated as theirs", () => {
    const profile = {
      lastConversationSummary:
        'User seemed frustrated and confused; Asked Ferni to call their brother',
      humanizingState: { lastMood: 'tired_but_present' },
    } as unknown as UserProfile;
    const { facts } = buildUserAwareness({
      userProfile: profile,
      isReturningUser: true,
      sessionStartTime: new Date(),
    });
    const text = facts.join('\n');
    expect(text).toContain('(not their words): Asked Ferni to call their brother.');
    expect(text).toContain('not something they said: they seemed a bit tired.');
    expect(text).not.toMatch(/frustrated|confused|Last time you talked about|Last time they/);
  });
});
