/**
 * Team member IDs match exactly (after alias lookup), never by substring.
 *
 * isTeamMemberUnlocked matched IDs by substring in both directions, so an
 * empty or partial ID ('', 'n', 'ern') matched 'ferni', who is always
 * unlocked, and counted as unlocked for every user; handoff.ts passes
 * `wakeWord.targetAgent || ''`. Legacy IDs ('spend-save') matched no one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UserProfile } from '../../../../types/user-profile.js';
import {
  getLockedMemberTeaser,
  isCoreTeamMember,
  isTeamMemberUnlocked,
  teamMemberIdOf,
} from '../team-availability.js';

const newUser = { totalConversations: 0 } as UserProfile;
const longtimeUser = {
  totalConversations: 400,
  firstContact: new Date(Date.now() - 2 * 365 * 86_400_000).toISOString(),
} as unknown as UserProfile;

describe('team member ids', () => {
  beforeEach(() => {
    delete process.env['BYPASS_TEAM_UNLOCKS'];
  });

  it("doesn't unlock an empty or partial id for a new user", () => {
    for (const id of ['', ' ', 'n', 'e', 'ern', 'fer']) {
      expect(isTeamMemberUnlocked(id, newUser, 'free'), JSON.stringify(id)).toBe(false);
    }
  });

  it('still unlocks Ferni for everyone, by id or alias', () => {
    expect(isTeamMemberUnlocked('ferni', newUser, 'free')).toBe(true);
    expect(isTeamMemberUnlocked('jack-b', newUser, 'free')).toBe(true);
  });

  it("doesn't count a partial id as a core team member", () => {
    for (const id of ['', 'pete', 'santos-maya', 'peter-johnson', 'a']) {
      expect(isCoreTeamMember(id), JSON.stringify(id)).toBe(false);
    }
    expect(isCoreTeamMember('peter-lynch')).toBe(false);
    expect(isCoreTeamMember('maya-santos')).toBe(true);
  });

  it('resolves ids, aliases and legacy ids to the same member', () => {
    for (const id of ['maya-santos', 'Maya', 'maya_santos', 'spend-save']) {
      expect(teamMemberIdOf(id), id).toBe('maya-santos');
    }
    expect(isTeamMemberUnlocked('spend-save', longtimeUser, 'partner')).toBe(true);
    expect(isTeamMemberUnlocked('maya', newUser, 'free')).toBe(false);
  });

  it('gives no teaser for an id that names no one', () => {
    expect(getLockedMemberTeaser('a')).toBeNull();
    expect(getLockedMemberTeaser('maya')).toContain('habits');
  });
});
