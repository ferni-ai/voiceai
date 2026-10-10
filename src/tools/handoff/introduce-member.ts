/**
 * Ferni introducing a teammate: only one already earned, once, revealed in this call.
 *
 * The introduceMember tool used to "unlock" whoever it was given without unlocking
 * anything: a new person who mentioned habits heard Maya introduced as available, then
 * the offered handoff was refused (NOT_UNLOCKED). Now a locked teammate isn't
 * introduced, the introduction is remembered for the person, and the reveal is tagged
 * with the call so only that call's app shows it.
 */
import { isTeamMemberUnlocked } from '../../intelligence/context-builders/team/team-availability.js';
import { recordTeammateIntroduced } from '../../services/social/team-introductions.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import { cameoUnlockEvents } from './state.js';

export interface IntroductionContext {
  userProfile: UserProfile | null;
  tier: 'free' | 'friend' | 'partner';
  sessionId?: string;
}

export interface Teammate {
  memberId: string;
  displayName: string;
  role: string;
}

/**
 * Introduce a teammate the person has earned. Returns false (and does nothing) for one
 * still locked; otherwise records the introduction and reveals it once Ferni has
 * finished speaking (`revealDelayMs`).
 */
export async function introduceTeammate(
  member: Teammate,
  spokenIntro: string,
  revealDelayMs: number,
  context: IntroductionContext
): Promise<boolean> {
  if (!isTeamMemberUnlocked(member.memberId, context.userProfile, context.tier)) return false;

  const userId = context.userProfile?.id;
  if (userId) {
    await recordTeammateIntroduced(userId, member.memberId).catch((error: unknown) =>
      getLogger().warn(
        { error: String(error), memberId: member.memberId },
        'Could not record introduction'
      )
    );
  }
  // Never wait for the speech here: the LLM can't speak until the tool returns
  setTimeout(() => {
    cameoUnlockEvents.emit('memberUnlocked', {
      memberId: member.memberId,
      displayName: member.displayName,
      role: member.role,
      spokenIntro,
      sessionId: context.sessionId,
    });
  }, revealDelayMs);
  return true;
}
