/**
 * Ferni's own persona mood from the last call is never told to him as the
 * caller's (#1415).
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
const OFF = { PERSONA_MOOD_NOT_CALLERS: 'off' };

describe('lastMoodNote', () => {
  it.each(MOODS)('%s: no line about how they were', (mood) => {
    expect(lastMoodNote(mood)).toEqual([]);
  });

  it('gives no line for an unknown, missing or prototype-key mood, switch on or off', () => {
    for (const env of [{}, OFF]) {
      expect(lastMoodNote(undefined, env)).toEqual([]);
      expect(lastMoodNote('constructor', env)).toEqual([]);
      expect(lastMoodNote('furious', env)).toEqual([]);
    }
  });

  it('PERSONA_MOOD_NOT_CALLERS=off gives the old lines exactly', () => {
    expect(lastMoodNote('tired_but_present', OFF)).toEqual([
      'Last time they seemed a bit tired - be gentle.',
    ]);
    expect(lastMoodNote('energized', OFF)).toEqual(['Last time they were full of energy!']);
    expect(MOODS.every((mood) => lastMoodNote(mood, OFF).length === 1)).toBe(true);
  });
});

describe('the system prompt a returning caller gets', () => {
  it('says nothing about how they seemed last time', () => {
    const profile = {
      humanizingState: { lastMood: 'tired_but_present' },
    } as unknown as UserProfile;
    const { facts } = buildUserAwareness({
      userProfile: profile,
      isReturningUser: true,
      sessionStartTime: new Date(),
    });
    expect(facts.join('\n')).not.toMatch(/they seemed|they were|Last time they/);
  });
});
