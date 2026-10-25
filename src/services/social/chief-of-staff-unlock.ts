/**
 * ALEX_CHIEF_OF_STAFF=on: Alex is on the caller's team from the first call.
 *
 * Planning requests go to Alex (config/alex-chief-of-staff-flag.ts), so he
 * can't wait for the `established` stage (30 conversations, 21 days, a 7-day
 * streak). Only Alex opens; the rest of the team unlocks as before, unlike
 * TEAM_BY_NEED, which opens everyone. Every unlock check reads
 * getTeamUnlockState (team-unlocks.ts), so the handoff tools, the runtime
 * check and a tap on the team bar all agree.
 *
 * @module services/social/chief-of-staff-unlock
 */
import {
  alexChiefOfStaffEnabled,
  CHIEF_OF_STAFF_ID,
} from '../../config/alex-chief-of-staff-flag.js';
import type { TeamUnlockState } from './team-unlocks.js';

/** `state` with Alex unlocked while the flag is on; `state` itself otherwise. */
export function withChiefOfStaff(state: TeamUnlockState): TeamUnlockState {
  if (!alexChiefOfStaffEnabled() || state.unlockedMembers.includes(CHIEF_OF_STAFF_ID)) return state;
  const nextIsAlex = state.nextUnlock?.member.memberId === CHIEF_OF_STAFF_ID;
  return {
    ...state,
    unlockedMembers: [...state.unlockedMembers, CHIEF_OF_STAFF_ID],
    nextUnlock: nextIsAlex ? undefined : state.nextUnlock,
  };
}
