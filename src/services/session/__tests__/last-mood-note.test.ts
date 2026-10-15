/**
 * A new call hears Ferni's read of the last call's mood as his own sense,
 * never as a fact about the caller (#1415).
 */
import { describe, expect, it } from 'vitest';
import { buildUserAwareness } from '../../../agents/voice-agent/phases/user-awareness.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { lastMoodNote } from '../last-mood-note.js';

const MOODS = [
  'tired_but_present',
  'reflective',
  'philosophical',
  'energized',
  'grounded',
  'playful',
  'nostalgic',
];

describe('lastMoodNote', () => {
  it("names Ferni's mood read as his own sense, not a fact about them", () => {
    expect(lastMoodNote('tired_but_present')).toEqual([
      'Your own sense last time, not something they said: they seemed a bit tired. Let it shape your tone; never tell them how they were or how their day went unless they say so on this call.',
    ]);
  });

  it.each(MOODS)('%s: labelled, never "Last time they ..."', (mood) => {
    const [note] = lastMoodNote(mood);
    expect(note).toMatch(/^Your own sense last time, not something they said: they seemed /);
    expect(note).not.toMatch(/Last time they|—|–|\.\.|…/);
  });

  it('gives no line for an unknown or missing mood', () => {
    expect(lastMoodNote(undefined)).toEqual([]);
    expect(lastMoodNote('constructor')).toEqual([]);
    expect(lastMoodNote('furious')).toEqual([]);
  });

  it('LAST_MOOD_AS_SENSE=off gives the old lines exactly', () => {
    const off = { LAST_MOOD_AS_SENSE: 'off' };
    expect(lastMoodNote('tired_but_present', off)).toEqual([
      'Last time they seemed a bit tired - be gentle.',
    ]);
    expect(lastMoodNote('energized', off)).toEqual(['Last time they were full of energy!']);
  });
});

describe('the system prompt a returning caller gets', () => {
  it('carries the mood as Ferni\'s sense, not "Last time they seemed"', () => {
    const profile = {
      humanizingState: { lastMood: 'tired_but_present' },
    } as unknown as UserProfile;
    const { facts } = buildUserAwareness({
      userProfile: profile,
      isReturningUser: true,
      sessionStartTime: new Date(),
    });
    const text = facts.join('\n');
    expect(text).toContain('not something they said: they seemed a bit tired.');
    expect(text).not.toContain('Last time they');
  });
});
