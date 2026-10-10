/**
 * Progress toward a locked teammate counts only what that teammate needs.
 *
 * Maya needs 10 conversations and no days or streak. Counting those two empty
 * requirements as already met put her at 67% before a single conversation, and the
 * agent and the app both read this number.
 */
import { describe, expect, it } from 'vitest';
import { TEAM_MEMBERS, getTeamMemberUnlockStatus } from '../team-unlocks.js';

const member = (id: string) => {
  const found = TEAM_MEMBERS.find((m) => m.memberId === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const progress = (id: string, totalConversations: number, daysSinceFirstMeeting = 0, streak = 0) =>
  getTeamMemberUnlockStatus(member(id), 'first-meeting', 'free', {
    totalConversations,
    daysSinceFirstMeeting,
    currentStreak: streak,
    longestStreak: streak,
  }).progress;

describe('team unlock progress', () => {
  it('no conversations is no progress toward Maya', () => {
    expect(progress('maya-santos', 0)).toBe(0);
  });

  it('5 of the 10 conversations Maya needs is halfway', () => {
    expect(progress('maya-santos', 5)).toBeCloseTo(0.5);
  });

  it('a teammate who needs conversations, days and a streak averages all three', () => {
    // Peter: 15 conversations, 5 days, a 3-day streak; all met but the streak
    expect(progress('peter-john', 15, 5, 0)).toBeCloseTo(2 / 3);
  });
});
