/**
 * Family members learned from what the caller said (issue #3993).
 *
 * The real path: extractSmallDetails catches "my brother Jason" during the call, and at
 * session end applyLearningToProfile files it under profile.familyMembers, which the person
 * model and the "how's Jason doing?" callback read. Names are fictional.
 */

import { describe, expect, it } from 'vitest';
import { extractSmallDetails } from '../../tracking/conversation-quality.js';
import { UserLearningEngine } from '../engine.js';
import type { ConversationLearningData } from '../types.js';
import { createUserProfile } from '../../../types/user-profile.js';

function familyFrom(said: string) {
  const learning: ConversationLearningData = {
    insights: [],
    keyMoments: [],
    smallDetails: extractSmallDetails(said),
    emotionalPatterns: [],
    storiesTold: [],
    preferenceUpdates: {},
    followUps: [],
  };
  const profile = createUserProfile('test-user');
  expect(profile.familyMembers).toEqual([]);
  return UserLearningEngine.applyLearningToProfile(profile, learning).familyMembers.map(
    ({ relationship, name }) => ({ relationship, name })
  );
}

describe('family members from what the caller said', () => {
  it('files "my brother Jason" as a brother, not a son (ja-SON)', () => {
    expect(familyFrom('I had lunch with my brother Jason today.')).toEqual([
      { relationship: 'brother', name: 'Jason' },
    ]);
  });

  it('files "my sister Allison" as a sister, not a son (alli-SON)', () => {
    expect(familyFrom('my sister Allison is visiting')).toEqual([
      { relationship: 'sister', name: 'Allison' },
    ]);
  });

  it('files "Madison, my daughter" as a daughter', () => {
    expect(familyFrom('Madison, my daughter, starts school')).toEqual([
      { relationship: 'daughter', name: 'Madison' },
    ]);
  });

  it('still files a plain "my son Theo"', () => {
    expect(familyFrom('my son Theo turned six')).toEqual([{ relationship: 'son', name: 'Theo' }]);
  });

  it('stores no son named "and" from "my son and I"', () => {
    expect(familyFrom('my son and I went fishing')).toEqual([]);
  });

  it('stores no mom named "was" from "my mom was upset"', () => {
    expect(familyFrom('my mom was upset with me')).toEqual([]);
  });

  it('keeps no "how is X doing" detail for a non-name', () => {
    const names = extractSmallDetails('my dad is fine and my wife was there').map((d) => d.value);
    expect(names).not.toContain('is');
    expect(names).not.toContain('was');
    expect(names).not.toContain('and');
  });
});
