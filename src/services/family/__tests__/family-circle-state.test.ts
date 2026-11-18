/**
 * The per-session family circle store: what a session remembered, forgotten at
 * call end, and bounded (sessions can end without telling it). Fictional data.
 */
import { describe, expect, it } from 'vitest';
import {
  familyCircleFor,
  forgetFamilyCircle,
  rememberFamilyCircle,
} from '../family-circle-state.js';

const member = {
  sponsoredIdentityId: 'sid-test',
  familyUserId: 'family_sid-test',
  displayName: 'Test Member',
};

describe('family circle state', () => {
  it('remembers a member for its session only, until forgotten', () => {
    rememberFamilyCircle('state-a', member);
    expect(familyCircleFor('state-a')).toEqual(member);
    expect(familyCircleFor('state-b')).toBeNull();
    forgetFamilyCircle('state-a');
    expect(familyCircleFor('state-a')).toBeNull();
  });

  it('keeps at most 500 sessions, dropping the oldest first', () => {
    rememberFamilyCircle('cap-0', member);
    for (let i = 1; i <= 500; i++) rememberFamilyCircle(`cap-${i}`, member);
    expect(familyCircleFor('cap-0')).toBeNull();
    expect(familyCircleFor('cap-1')).toEqual(member);
    expect(familyCircleFor('cap-500')).toEqual(member);
  });
});
