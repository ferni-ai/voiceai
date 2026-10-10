/**
 * Whether the person may be handed to this persona: Ferni always; a core teammate once
 * unlocked (relationship, subscription, or BYPASS_TEAM_UNLOCKS); a marketplace agent once
 * the whole team is unlocked.
 *
 * One check for every way a handoff starts. The LLM's handoff tools ran it inline
 * (executor.ts); a tap on the team bar in a multi-agent call (the production path) went
 * straight to the orchestrator, so any persona, paid-only Nayan included, could be
 * reached by sending a handoff_request from the browser.
 */
import {
  getLockedMemberTeaser,
  isCoreTeamMember,
  isTeamMemberUnlocked,
} from '../../intelligence/context-builders/team/team-availability.js';
import { isCoach } from '../../personas/persona-ids.js';
import {
  getCanonicalPersonaId,
  getPersonaDisplayName,
  isKnownPersona,
} from '../../personas/voice-registry.js';
import { isFullTeamUnlocked } from '../../services/team-unlocks.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

/** `target` is the canonical id the check decided on: hand THAT to whatever switches */
export type HandoffUnlockResult = { open: true; target: string } | { open: false; error: string };

export function checkHandoffUnlocked(
  targetPersonaId: string,
  userProfile: UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): HandoffUnlockResult {
  const target = getCanonicalPersonaId(targetPersonaId);
  // An id nobody knows canonicalizes to 'ferni' (always open): refuse it, or a check on
  // "ferni" could wave through a switch the caller resolves to someone else
  if (
    target === 'ferni' &&
    targetPersonaId.toLowerCase().trim() !== 'ferni' &&
    !isKnownPersona(targetPersonaId)
  ) {
    return { open: false, error: `Unknown persona: ${targetPersonaId}` };
  }
  if (isCoach(target)) return { open: true, target };
  const name = getPersonaDisplayName(target);

  if (isCoreTeamMember(target)) {
    if (isTeamMemberUnlocked(target, userProfile, tier)) return { open: true, target };
    getLogger().info(
      { targetAgent: target, tier, hasProfile: !!userProfile },
      `🔒 Handoff blocked - ${name} is not yet unlocked for this user`
    );
    return {
      open: false,
      error:
        getLockedMemberTeaser(target) ||
        `${name} isn't available yet. Keep talking to Ferni to unlock more team members!`,
    };
  }

  if (isFullTeamUnlocked(userProfile, tier)) return { open: true, target };
  getLogger().info(
    { targetAgent: target, tier, hasProfile: !!userProfile },
    `🔒 Handoff blocked - marketplace agent ${name} requires full team to be unlocked`
  );
  return {
    open: false,
    error: `${name} is a marketplace advisor. Get to know your core team first - once everyone's unlocked, you can expand your circle!`,
  };
}
