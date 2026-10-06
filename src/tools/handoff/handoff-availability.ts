/**
 * Which handoff targets a user can reach, decided the way executeHandoff()
 * decides it (executor.ts), so the tools the model sees match what a call
 * would actually do:
 *
 * - the coordinator (Ferni) is always reachable;
 * - a core team member is reachable once the user has unlocked them;
 * - any other persona is a marketplace advisor (e.g. the Financial Legends),
 *   reachable once the whole core team is unlocked.
 *
 * Handoffs to locked teammates are left out on purpose: when the model could
 * see them it promised transfers the runtime then refused (voice eval,
 * 2026-09-28). The upsell for a locked teammate is the softTeamIntro tool.
 *
 * @module tools/handoff/handoff-availability
 */

import {
  isCoreTeamMember,
  isTeamMemberUnlocked,
} from '../../intelligence/context-builders/team/team-availability.js';
import { isCoach } from '../../personas/persona-ids.js';
import { isFullTeamUnlocked } from '../../services/team-unlocks.js';
import type { UserProfile } from '../../types/user-profile.js';

export type SubscriptionTier = 'free' | 'friend' | 'partner';

/** True when a handoff to `agentId` would pass executeHandoff()'s unlock check. */
export function isHandoffTargetOpen(
  agentId: string,
  userProfile: UserProfile | null,
  tier: SubscriptionTier
): boolean {
  if (isCoach(agentId)) return true;
  if (isCoreTeamMember(agentId)) return isTeamMemberUnlocked(agentId, userProfile, tier);
  return isFullTeamUnlocked(userProfile, tier);
}

const isHandoffTool = (name: string): boolean => name.startsWith('handoffTo');

/**
 * `tools` without its handoff tools. Shared tool sets (the essential domains,
 * the dynamic loader's catalog) are built once per process with no user, so
 * they carry a handoff to every persona, the speaker itself included. An
 * agent's handoffs come only from the per-session build (buildHandoffTools),
 * which knows who is speaking and what this user has unlocked.
 */
export function withoutSharedHandoffs<T>(tools: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(tools).filter(([name]) => !isHandoffTool(name)));
}
