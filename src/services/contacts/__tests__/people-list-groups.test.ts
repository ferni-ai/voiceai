import { describe, expect, it } from 'vitest';
import { relationshipGroup } from '../people-list.js';

describe('relationshipGroup: what the voice agent heard, as a group the panel shows', () => {
  it.each([
    ['mother', 'family'],
    ['Grandfather', 'family'],
    ['my best friend', 'friend'],
    ['friends', 'friend'],
    ['coworker', 'colleague'],
    ['Doctor', 'professional'],
    ['professional', 'professional'],
  ])('%s → %s', (said, group) => {
    expect(relationshipGroup(said)).toBe(group);
  });

  it('matches whole words only: "unfriendly" is not a friend, "grandmaster" not family', () => {
    expect(relationshipGroup('unfriendly')).toBe('other');
    expect(relationshipGroup('grandmaster')).toBe('other');
  });

  it('nothing said is "other"', () => {
    expect(relationshipGroup(undefined)).toBe('other');
  });
});
